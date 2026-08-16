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
const INBOX_SUFFIX = '-inbox.json';

export async function scanSyncFolder(handle, ownDeviceId) {
  const devices = [];
  const pending = [];

  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== 'file') continue;

    const placeholderMatch = name.match(ICLOUD_PLACEHOLDER);
    if (placeholderMatch) {
      const placeholderName = placeholderMatch[1].endsWith('.json')
        ? placeholderMatch[1].slice(0, -'.json'.length)
        : placeholderMatch[1];
      if (placeholderName.endsWith(INBOX_SUFFIX)) continue; // inbox file, not a device snapshot
      if (placeholderName !== ownDeviceId) pending.push(placeholderName);
      continue;
    }

    if (name.endsWith(INBOX_SUFFIX)) continue; // per-device inbox file, not a device snapshot
    if (!name.endsWith('.json')) continue;
    const deviceIdFromName = name.slice(0, -'.json'.length);
    if (deviceIdFromName === ownDeviceId) continue;

    try {
      const file = await entry.getFile();
      const text = await file.text();
      devices.push(JSON.parse(text));
    } catch {
      // Corrupt/partially-written snapshot, or the file got evicted
      // mid-scan (iCloud race) — skip this entry, it'll be complete (or
      // present again) on the next tick.
    }
  }

  return { devices, pending };
}
