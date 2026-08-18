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

// Generic read for a single JSON file in the sync folder - used for
// _layer2.json (see lib/workspace.js) and anything else that isn't a
// per-device snapshot.
export async function readJsonFile(handle, filename) {
  try {
    const fileHandle = await handle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

const ICLOUD_PLACEHOLDER = /^\.(.+)\.icloud$/;
const INBOX_SUFFIX = '-inbox.json';
// Each Layer 2 install now writes its own uniquely-named
// _layer2-<id>.json (see uimod/workspacesync-uimod.js) rather than one
// shared filename every device used to overwrite - matched by prefix here
// since the id itself isn't known to this side.
const LAYER2_FILE_PREFIX = '_layer2';

export function isLayer2File(name) {
  return name.startsWith(LAYER2_FILE_PREFIX) && name.endsWith('.json');
}

// Every Layer 2 snapshot filename currently in the folder - one per
// install writing there (see uimod/workspacesync-uimod.js), not just this
// device's own.
export async function listLayer2FileNames(handle) {
  const names = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === 'file' && isLayer2File(name)) names.push(name);
  }
  return names;
}

export async function scanSyncFolder(handle, ownDeviceId) {
  const devices = [];
  const pending = [];

  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== 'file') continue;
    if (isLayer2File(name)) continue; // Layer 2's own live-tab file, not a device snapshot

    const placeholderMatch = name.match(ICLOUD_PLACEHOLDER);
    if (placeholderMatch) {
      const placeholderName = placeholderMatch[1].endsWith('.json')
        ? placeholderMatch[1].slice(0, -'.json'.length)
        : placeholderMatch[1];
      if (placeholderName.endsWith(INBOX_SUFFIX) || isLayer2File(placeholderMatch[1])) continue;
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
