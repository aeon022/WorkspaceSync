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

  // Only seed an empty snapshot on genuinely first-time setup. Re-picking
  // to reconnect an existing setup must never wipe a device's already-synced
  // workspace data back to empty - the next alarm tick repopulates it for
  // real via writeSnapshot() either way.
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
});

reconnectBtn.addEventListener('click', async () => {
  const handle = await loadHandle();
  if (!handle) return;
  // Re-grant permission on the SAME already-saved handle - no new folder
  // selection needed, just the native permission prompt.
  await verifyPermission(handle, true);
  await refreshFolderStatus();
});

init();
