'use strict';

import { getOrCreateDevice, setDeviceName } from './lib/device.js';
import { saveHandle, loadHandle } from './lib/handleStore.js';
import { pickSyncFolder, verifyPermission, writeDeviceFile } from './lib/syncFolder.js';

const deviceNameInput = document.getElementById('deviceName');
const pickFolderBtn = document.getElementById('pickFolder');
const reconnectBtn = document.getElementById('reconnectFolder');
const folderStatus = document.getElementById('folderStatus');

async function refreshFolderStatus() {
  const handle = await loadHandle();
  if (!handle) {
    folderStatus.textContent = 'No folder chosen yet.';
    reconnectBtn.style.display = 'none';
    return;
  }
  const ok = await verifyPermission(handle, false);
  if (ok) {
    folderStatus.textContent = `Connected: ${handle.name}`;
    reconnectBtn.style.display = 'none';
  } else {
    folderStatus.textContent = `Connected to "${handle.name}" but permission needs to be re-granted.`;
    reconnectBtn.style.display = 'inline-block';
  }
}

async function init() {
  const device = await getOrCreateDevice();
  deviceNameInput.value = device.name;
  await refreshFolderStatus();
}

deviceNameInput.addEventListener('change', async () => {
  await setDeviceName(deviceNameInput.value.trim() || deviceNameInput.value);
  chrome.runtime.sendMessage({ type: 'SYNC_NOW' }).catch(() => {});
});

pickFolderBtn.addEventListener('click', async () => {
  const hadPreviousHandle = !!(await loadHandle());

  let handle;
  try {
    handle = await pickSyncFolder();
  } catch (err) {
    if (err?.name === 'AbortError') return; // user cancelled the picker
    throw err;
  }
  await saveHandle(handle);

  if (!hadPreviousHandle) {
    const device = await getOrCreateDevice();
    await writeDeviceFile(handle, device.id, {
      deviceId: device.id,
      deviceName: device.name,
      updatedAt: new Date().toISOString(),
      workspaces: []
    });
  }
  await refreshFolderStatus();
  chrome.runtime.sendMessage({ type: 'SYNC_NOW' }).catch(() => {});
});

reconnectBtn.addEventListener('click', async () => {
  const handle = await loadHandle();
  if (!handle) return;
  await verifyPermission(handle, true);
  await refreshFolderStatus();
  chrome.runtime.sendMessage({ type: 'SYNC_NOW' }).catch(() => {});
});

init();
