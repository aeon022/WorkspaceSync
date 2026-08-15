'use strict';

import { getOrCreateDevice } from './lib/device.js';
import { getLocalWorkspaces } from './lib/workspace.js';
import { getLabels } from './lib/labels.js';
import { loadHandle } from './lib/handleStore.js';
import { verifyPermission, writeDeviceFile } from './lib/syncFolder.js';

const ALARM_NAME = 'workspacesync-sync';

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) writeSnapshot();
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

  const workspaces = localWorkspaces.map((ws) => {
    const prev = previous.find((p) => p.localId === ws.workspaceId);
    return {
      localId: ws.workspaceId,
      label: labels[ws.workspaceId] || prev?.label || '',
      mirror: prev?.mirror || false,
      tabs: ws.tabs,
      recentEvents: prev?.recentEvents || []
    };
  });

  await writeDeviceFile(handle, device.id, {
    deviceId: device.id,
    deviceName: device.name,
    updatedAt: new Date().toISOString(),
    workspaces
  });
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
