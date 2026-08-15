'use strict';

import { getOrCreateDevice } from './lib/device.js';
import { getLocalWorkspaces, normalizeWorkspaceId, parseVivExtData } from './lib/workspace.js';
import { getLabels } from './lib/labels.js';
import { loadHandle } from './lib/handleStore.js';
import { verifyPermission, writeDeviceFile, scanSyncFolder } from './lib/syncFolder.js';
import { isMirrored, getLastAppliedTs, setLastAppliedTs } from './lib/mirrorState.js';
import { computeSyncActions } from './lib/merge.js';

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
});
chrome.runtime.onInstalled.addListener(writeSnapshot);
chrome.runtime.onStartup.addListener(writeSnapshot);

export async function writeSnapshot() {
  const handle = await loadHandle();
  if (!handle) return; // no sync folder configured yet
  if (!(await verifyPermission(handle, false))) return; // Task 9 handles surfacing this

  const [device, localWorkspaces, labels] = await Promise.all([
    getOrCreateDevice(),
    getLocalWorkspaces(),
    getLabels()
  ]);

  const { workspaces: previous } = await readOwnPreviousSnapshot(handle, device.id);

  const workspaces = await Promise.all(localWorkspaces.map(async (ws) => {
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
  const { devices: remoteDevices } = await scanSyncFolder(handle, device.id);

  for (const ws of localWorkspaces) {
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
