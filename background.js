'use strict';

import { getOrCreateDevice } from './lib/device.js';
import { getLocalWorkspaces, normalizeWorkspaceId, parseVivExtData } from './lib/workspace.js';
import { getLabels } from './lib/labels.js';
import { loadHandle } from './lib/handleStore.js';
import { verifyPermission, writeDeviceFile, scanSyncFolder } from './lib/syncFolder.js';
import { isMirrored, getLastAppliedTs, setLastAppliedTs } from './lib/mirrorState.js';
import { computeSyncActions } from './lib/merge.js';
import { getExcludedWorkspaces } from './lib/syncFlags.js';
import { getColors } from './lib/workspaceColors.js';
import { writeInboxEntry, readInboxEntry, getLastInboxTs, setLastInboxTs } from './lib/inbox.js';

const ALARM_NAME = 'workspacesync-sync';

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// chrome.alarms.create() with an existing name replaces it and restarts its
// countdown. The service worker's top-level code re-runs on every wake
// (messages, alarms, etc.), so creating unconditionally could keep pushing
// the first fire into the future and the alarm might never actually fire.
chrome.alarms.get(ALARM_NAME, (existing) => {
  if (!existing) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await writeSnapshot();
  await reconcileMirrors();
  await checkOwnInbox();
  await rebuildSendToDeviceMenu();
});
chrome.runtime.onInstalled.addListener(async () => {
  await writeSnapshot();
  await rebuildSendToDeviceMenu();
});
chrome.runtime.onStartup.addListener(async () => {
  await writeSnapshot();
  await rebuildSendToDeviceMenu();
});

export async function writeSnapshot() {
  const handle = await loadHandle();
  if (!handle) return; // no sync folder configured yet
  if (!(await verifyPermission(handle, false))) return; // Task 9 handles surfacing this

  const [device, localWorkspaces, labels, excludedWorkspaces, colors] = await Promise.all([
    getOrCreateDevice(),
    getLocalWorkspaces(),
    getLabels(),
    getExcludedWorkspaces(),
    getColors()
  ]);

  const { workspaces: previous } = await readOwnPreviousSnapshot(handle, device.id);

  // Excluded workspaces (e.g. "Banking") never leave this device: they're
  // dropped before writing, not just hidden from other devices' view. If a
  // workspace was synced before and then excluded, this also removes any
  // previously-written data for it on the next tick.
  const syncableWorkspaces = localWorkspaces.filter((ws) => !excludedWorkspaces[ws.workspaceId]);

  const workspaces = await Promise.all(syncableWorkspaces.map(async (ws) => {
    const prev = previous.find((p) => p.localId === ws.workspaceId);
    const prevUrls = new Set((prev?.tabs || []).map((t) => t.url));
    const currentUrls = new Set(ws.tabs.map((t) => t.url));
    const now = Date.now();
    const newEvents = [
      ...ws.tabs.filter((t) => !prevUrls.has(t.url)).map((t) => ({ op: 'open', url: t.url, ts: now })),
      ...(prev?.tabs || []).filter((t) => !currentUrls.has(t.url)).map((t) => ({ op: 'close', url: t.url, ts: now }))
    ];

    return {
      localId: ws.workspaceId,
      label: labels[ws.workspaceId] || prev?.label || '',
      color: colors[ws.workspaceId] || prev?.color || '',
      mirror: await isMirrored(ws.workspaceId),
      tabs: ws.tabs,
      recentEvents: [...(prev?.recentEvents || []), ...newEvents].slice(-50)
    };
  }));

  await writeDeviceFile(handle, device.id, {
    deviceId: device.id,
    deviceName: device.name,
    updatedAt: new Date().toISOString(),
    workspaces
  });
}

const HTTP_URL = /^https?:\/\//;

export async function reconcileMirrors() {
  const handle = await loadHandle();
  if (!handle || !(await verifyPermission(handle, false))) return;

  const device = await getOrCreateDevice();
  const localWorkspaces = await getLocalWorkspaces();
  const labels = await getLabels();
  const excludedWorkspaces = await getExcludedWorkspaces();
  const { devices: remoteDevices } = await scanSyncFolder(handle, device.id);

  for (const ws of localWorkspaces) {
    // Excluded workspaces don't sync in either direction: they never send
    // their own tabs out (handled in writeSnapshot), and they never pull
    // remote tabs in either — otherwise a "private" workspace could still
    // be influenced by another device's data despite being excluded.
    if (excludedWorkspaces[ws.workspaceId]) continue;
    const label = labels[ws.workspaceId];
    if (!label) continue;
    if (!(await isMirrored(ws.workspaceId))) continue;

    for (const remoteDevice of remoteDevices) {
      const remoteWs = (remoteDevice.workspaces || []).find((w) => w.label === label && w.mirror);
      if (!remoteWs) continue;

      const lastTs = await getLastAppliedTs(remoteDevice.deviceId, label);

      if (lastTs === 0) {
        // Never reconciled this remote+label pairing before (e.g. the user
        // just checked "Mirror" for the first time). Replaying the entire
        // remote event backlog here could close tabs the user currently has
        // open, which is exactly the "surprise" the both-sides-opt-in design
        // was meant to prevent. Instead, just adopt the current cursor
        // position and start reconciling from here on the next tick.
        const events = remoteWs.recentEvents || [];
        const newestTs = events.length ? Math.max(...events.map((e) => e.ts)) : 0;
        await setLastAppliedTs(remoteDevice.deviceId, label, newestTs);
        continue;
      }

      const { toOpen, toClose, newLastAppliedTs } = computeSyncActions(ws.tabs, remoteWs, lastTs);

      // Internal browser pages (chrome://, vivaldi://, about:blank, ...)
      // aren't meaningfully mirrorable across devices, and chrome.tabs.create
      // / chrome.tabs.remove can throw for them — drop them before acting.
      const httpToOpen = toOpen.filter((url) => HTTP_URL.test(url));
      const httpToClose = toClose.filter((url) => HTTP_URL.test(url));

      for (const url of httpToOpen) {
        try {
          await chrome.tabs.create({ url });
        } catch (err) {
          console.warn('[WorkspaceSync] failed to open mirrored tab', url, err);
        }
      }

      if (httpToClose.length) {
        // chrome.tabs.query({ url }) treats its argument as a match pattern
        // (not a literal URL) and searches every window/workspace, so it can
        // pick the wrong tab. Query once and match the exact URL within this
        // specific local workspace instead.
        const allTabs = await chrome.tabs.query({});
        for (const url of httpToClose) {
          const match = allTabs.find(
            (t) => t.url === url && normalizeWorkspaceId(parseVivExtData(t).workspaceId) === ws.workspaceId
          );
          if (!match) continue; // already gone, or was in a different workspace
          try {
            await chrome.tabs.remove(match.id);
          } catch (err) {
            console.warn('[WorkspaceSync] failed to close mirrored tab', url, err);
          }
        }
      }

      // Always advance the cursor on a successful reconcile pass, even if
      // some individual open/close above failed — otherwise a single bad
      // tab operation would keep the whole pairing retrying forever.
      await setLastAppliedTs(remoteDevice.deviceId, label, newLastAppliedTs);
    }
  }
}

const SEND_MENU_PARENT_ID = 'workspacesync-send-parent';
const SEND_MENU_PREFIX = 'workspacesync-send-to-';

async function rebuildSendToDeviceMenu() {
  const handle = await loadHandle();
  await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));
  if (!handle || !(await verifyPermission(handle, false))) return;

  const device = await getOrCreateDevice();
  const { devices: remoteDevices } = await scanSyncFolder(handle, device.id);
  if (remoteDevices.length === 0) return;

  chrome.contextMenus.create({
    id: SEND_MENU_PARENT_ID,
    title: 'Send tab to device',
    contexts: ['page']
  });
  for (const remote of remoteDevices) {
    chrome.contextMenus.create({
      id: `${SEND_MENU_PREFIX}${remote.deviceId}`,
      parentId: SEND_MENU_PARENT_ID,
      title: remote.deviceName || remote.deviceId,
      contexts: ['page']
    });
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.startsWith(SEND_MENU_PREFIX) || !tab?.url) return;
  const targetDeviceId = info.menuItemId.slice(SEND_MENU_PREFIX.length);

  const handle = await loadHandle();
  if (!handle || !(await verifyPermission(handle, false))) return;

  const device = await getOrCreateDevice();
  await writeInboxEntry(handle, targetDeviceId, {
    url: tab.url,
    title: tab.title || tab.url,
    from: device.name,
    ts: Date.now()
  });
});

// Single-slot inbox check: opens a tab another device sent here, once per
// send. Uses a locally-stored cursor timestamp rather than deleting the
// inbox file after reading, since deleting would race against another
// device writing a new send into the same file around the same tick.
async function checkOwnInbox() {
  const handle = await loadHandle();
  if (!handle || !(await verifyPermission(handle, false))) return;

  const device = await getOrCreateDevice();
  const entry = await readInboxEntry(handle, device.id);
  if (!entry?.url || !entry?.ts) return;

  const lastTs = await getLastInboxTs();
  if (entry.ts <= lastTs) return;

  try {
    await chrome.tabs.create({ url: entry.url });
  } catch (err) {
    console.warn('[WorkspaceSync] failed to open tab sent from another device', entry.url, err);
  }
  await setLastInboxTs(entry.ts);
}

async function readOwnPreviousSnapshot(handle, deviceId) {
  try {
    const fileHandle = await handle.getFileHandle(`${deviceId}.json`);
    const file = await fileHandle.getFile();
    const parsed = JSON.parse(await file.text());
    return { workspaces: parsed.workspaces || [] };
  } catch {
    return { workspaces: [] };
  }
}

chrome.runtime.onMessageExternal.addListener((message) => {
  if (message?.type !== 'workspaceNames' || !Array.isArray(message.names)) return;
  chrome.storage.local.get('suggestedNames').then(({ suggestedNames }) => {
    const updated = { ...(suggestedNames || {}) };
    for (const { workspaceId, name } of message.names) {
      if (name) updated[workspaceId] = name;
    }
    chrome.storage.local.set({ suggestedNames: updated });
  });
});
