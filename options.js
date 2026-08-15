'use strict';

import { getOrCreateDevice, setDeviceName } from './lib/device.js';
import { saveHandle, loadHandle } from './lib/handleStore.js';
import { pickSyncFolder, verifyPermission, writeDeviceFile } from './lib/syncFolder.js';

const deviceNameInput = document.getElementById('deviceName');
const pickFolderBtn = document.getElementById('pickFolder');
const folderStatus = document.getElementById('folderStatus');

async function refreshFolderStatus() {
  const handle = await loadHandle();
  if (!handle) {
    folderStatus.textContent = 'No folder chosen yet.';
    return;
  }
  const ok = await verifyPermission(handle, false);
  folderStatus.textContent = ok
    ? `Connected: ${handle.name}`
    : `Connected to "${handle.name}" but permission needs to be re-granted — click "Choose sync folder…" again.`;
}

async function init() {
  const device = await getOrCreateDevice();
  deviceNameInput.value = device.name;
  await refreshFolderStatus();
}

deviceNameInput.addEventListener('change', async () => {
  await setDeviceName(deviceNameInput.value.trim() || deviceNameInput.value);
});

pickFolderBtn.addEventListener('click', async () => {
  const handle = await pickSyncFolder();
  await saveHandle(handle);
  const device = await getOrCreateDevice();
  await writeDeviceFile(handle, device.id, {
    deviceId: device.id,
    deviceName: device.name,
    updatedAt: new Date().toISOString(),
    workspaces: []
  });
  await refreshFolderStatus();
});

init();
