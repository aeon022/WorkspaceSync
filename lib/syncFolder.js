'use strict';

export async function pickSyncFolder() {
  return window.showDirectoryPicker({ id: 'workspacesync', mode: 'readwrite' });
}

export async function verifyPermission(handle, requestIfNeeded) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (!requestIfNeeded) return false;
  return (await handle.requestPermission(opts)) === 'granted';
}

export async function writeDeviceFile(handle, deviceId, data) {
  const fileHandle = await handle.getFileHandle(`${deviceId}.json`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

const ICLOUD_PLACEHOLDER = /^\.(.+)\.icloud$/;

export async function scanSyncFolder(handle, ownDeviceId) {
  const devices = [];
  const pending = [];

  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== 'file') continue;

    const placeholderMatch = name.match(ICLOUD_PLACEHOLDER);
    if (placeholderMatch) {
      pending.push(placeholderMatch[1]);
      continue;
    }

    if (!name.endsWith('.json')) continue;
    const deviceIdFromName = name.slice(0, -'.json'.length);
    if (deviceIdFromName === ownDeviceId) continue;

    const file = await entry.getFile();
    const text = await file.text();
    try {
      devices.push(JSON.parse(text));
    } catch {
      // Corrupt/partially-written snapshot from a device mid-write — skip
      // this tick, it'll be complete on the next one.
    }
  }

  return { devices, pending };
}
