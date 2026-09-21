'use strict';

import { getOrCreateDevice } from './lib/device.js';
import { getLocalWorkspaces, getLayer2Tabs, getLayer2WorkspaceNames } from './lib/workspace.js';
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

async function updateBadgeStatus(handleExists, permissionGranted) {
  if (!chrome.action) return;
  if (!handleExists) {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'DeckMirror: Setup sync folder in Options' });
    return;
  }
  if (!permissionGranted) {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#E53935' });
    await chrome.action.setTitle({ title: 'DeckMirror: Permission lost. Reconnect in Options.' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'DeckMirror' });
  }
}

export async function runSyncCycle() {
  const handle = await loadHandle();
  if (!handle) {
    await updateBadgeStatus(false, false);
    return;
  }
  const hasPerm = await verifyPermission(handle, false);
  await updateBadgeStatus(true, hasPerm);
  if (!hasPerm) return;

  await writeSnapshot();
  await reconcileMirrors();
  await checkOwnInbox();
  await rebuildSendToDeviceMenu();
}

let syncTimeout = null;
function scheduleSync(delayMs = 1500) {
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    runSyncCycle().catch((err) => console.warn('[DeckMirror] sync cycle error:', err));
  }, delayMs);
}

// Event-based real-time tab listeners
chrome.tabs.onCreated.addListener(() => scheduleSync(1500));
chrome.tabs.onRemoved.addListener(() => scheduleSync(1000));
chrome.tabs.onMoved.addListener(() => scheduleSync(1500));
chrome.tabs.onAttached?.addListener(() => scheduleSync(1500));
chrome.tabs.onDetached?.addListener(() => scheduleSync(1500));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    scheduleSync(1500);
  }
});

// Periodic fallback polling
chrome.alarms.get(ALARM_NAME, (existing) => {
  if (!existing) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await runSyncCycle();
});

chrome.runtime.onInstalled.addListener(async () => {
  await runSyncCycle();
});
chrome.runtime.onStartup.addListener(async () => {
  await runSyncCycle();
});

// Message handling for UI triggers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SYNC_NOW') {
    runSyncCycle()
      .then(() => sendResponse({ success: true, timestamp: Date.now() }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }
  if (message?.type === 'CHECK_STATUS') {
    loadHandle().then(async (handle) => {
      const hasPerm = handle ? await verifyPermission(handle, false) : false;
      await updateBadgeStatus(!!handle, hasPerm);
      sendResponse({ configured: !!handle, permission: hasPerm });
    });
    return true;
  }
});

export async function writeSnapshot() {
  const handle = await loadHandle();
  if (!handle) return;
  if (!(await verifyPermission(handle, false))) return;

  const [device, localWorkspaces, labels, excludedWorkspaces, colors, layer2Names] = await Promise.all([
    getOrCreateDevice(),
    getLocalWorkspaces(),
    getLabels(),
    getExcludedWorkspaces(),
    getColors(),
    getLayer2WorkspaceNames()
  ]);

  const { workspaces: previous } = await readOwnPreviousSnapshot(handle, device.id);

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
      label: layer2Names[ws.workspaceId] || labels[ws.workspaceId] || prev?.label || '',
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
  const layer2Names = await getLayer2WorkspaceNames();
  const excludedWorkspaces = await getExcludedWorkspaces();
  const { devices: remoteDevices } = await scanSyncFolder(handle, device.id);

  for (const ws of localWorkspaces) {
    if (excludedWorkspaces[ws.workspaceId]) continue;
    const label = layer2Names[ws.workspaceId] || labels[ws.workspaceId];
    if (!label) continue;
    if (!(await isMirrored(ws.workspaceId))) continue;

    for (const remoteDevice of remoteDevices) {
      const remoteWs = (remoteDevice.workspaces || []).find((w) => w.label === label && w.mirror);
      if (!remoteWs) continue;

      const lastTs = await getLastAppliedTs(remoteDevice.deviceId, label);

      if (lastTs === 0) {
        const events = remoteWs.recentEvents || [];
        const newestTs = events.length ? Math.max(...events.map((e) => e.ts)) : 0;
        await setLastAppliedTs(remoteDevice.deviceId, label, newestTs);
        continue;
      }

      const { toOpen, toClose, newLastAppliedTs } = computeSyncActions(ws.tabs, remoteWs, lastTs);

      const httpToOpen = toOpen.filter((url) => HTTP_URL.test(url));
      const httpToClose = toClose.filter((url) => HTTP_URL.test(url));

      for (const url of httpToOpen) {
        try {
          await chrome.tabs.create({ url });
        } catch (err) {
          console.warn('[DeckMirror] failed to open mirrored tab', url, err);
        }
      }

      if (httpToClose.length) {
        const [candidates, localTabs] = await Promise.all([getLayer2Tabs(), chrome.tabs.query({})]);
        const localById = new Map(localTabs.map((t) => [t.id, t.url]));
        for (const url of httpToClose) {
          const match = candidates.find((t) => t.url === url && t.workspaceId === ws.workspaceId);
          if (!match) continue;
          if (localById.get(match.id) !== url) continue;
          try {
            await chrome.tabs.remove(match.id);
          } catch (err) {
            console.warn('[DeckMirror] failed to close mirrored tab', url, err);
          }
        }
      }

      await setLastAppliedTs(remoteDevice.deviceId, label, newLastAppliedTs);
    }
  }
}

const SEND_MENU_PARENT_ID = 'workspacesync-send-parent';
const SEND_MENU_PREFIX = 'workspacesync-send-to-';

let isRebuildingMenu = false;
let queuedMenuRebuild = false;

async function rebuildSendToDeviceMenu() {
  if (isRebuildingMenu) {
    queuedMenuRebuild = true;
    return;
  }
  isRebuildingMenu = true;

  try {
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
    }, () => {
      if (chrome.runtime?.lastError) { /* ignore race condition */ }
    });

    for (const remote of remoteDevices) {
      chrome.contextMenus.create({
        id: `${SEND_MENU_PREFIX}${remote.deviceId}`,
        parentId: SEND_MENU_PARENT_ID,
        title: remote.deviceName || remote.deviceId,
        contexts: ['page']
      }, () => {
        if (chrome.runtime?.lastError) { /* ignore race condition */ }
      });
    }
  } finally {
    isRebuildingMenu = false;
    if (queuedMenuRebuild) {
      queuedMenuRebuild = false;
      setTimeout(rebuildSendToDeviceMenu, 100);
    }
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
    console.warn('[DeckMirror] failed to open tab sent from another device', entry.url, err);
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
