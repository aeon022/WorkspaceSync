'use strict';

import { getOrCreateDevice } from './lib/device.js';
import { getLocalWorkspaces } from './lib/workspace.js';
import { getLabels } from './lib/labels.js';
import { loadHandle } from './lib/handleStore.js';
import { verifyPermission, writeDeviceFile, scanSyncFolder } from './lib/syncFolder.js';
import { isMirrored, getLastAppliedTs, setLastAppliedTs } from './lib/mirrorState.js';
import { computeSyncActions } from './lib/merge.js';

const ALARM_NAME = 'workspacesync-sync';

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
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
      const { toOpen, toClose, newLastAppliedTs } = computeSyncActions(ws.tabs, remoteWs, lastTs);

      for (const url of toOpen) {
        await chrome.tabs.create({ url });
      }
      for (const url of toClose) {
        const [match] = await chrome.tabs.query({ url });
        if (match) await chrome.tabs.remove(match.id);
      }

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
