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
const LAYER2_FILE_PREFIX = '_layer2';

export function isLayer2File(name) {
  return name.startsWith(LAYER2_FILE_PREFIX) && name.endsWith('.json');
}

export async function listLayer2FileNames(handle) {
  const names = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === 'file' && isLayer2File(name)) names.push(name);
  }
  return names.sort();
}

export async function scanSyncFolder(handle, ownDeviceId) {
  const devices = [];
  const pending = [];

  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== 'file') continue;
    if (isLayer2File(name)) continue;

    const placeholderMatch = name.match(ICLOUD_PLACEHOLDER);
    if (placeholderMatch) {
      const placeholderName = placeholderMatch[1].endsWith('.json')
        ? placeholderMatch[1].slice(0, -'.json'.length)
        : placeholderMatch[1];
      if (placeholderName.endsWith(INBOX_SUFFIX) || isLayer2File(placeholderMatch[1])) continue;
      if (placeholderName !== ownDeviceId) pending.push(placeholderName);
      continue;
    }

    if (name.endsWith(INBOX_SUFFIX)) continue;
    if (!name.endsWith('.json')) continue;
    const deviceIdFromName = name.slice(0, -'.json'.length);
    if (deviceIdFromName === ownDeviceId) continue;

    try {
      const file = await entry.getFile();
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        devices.push(parsed);
      }
    } catch {
      // Ignore partial/corrupt files during sync
    }
  }

  // Deterministic sorting so device cards and workspaces never jump around
  devices.sort((a, b) => {
    const nameA = (a.deviceName || a.deviceId || '').toLowerCase();
    const nameB = (b.deviceName || b.deviceId || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  for (const d of devices) {
    if (Array.isArray(d.workspaces)) {
      d.workspaces.sort((a, b) => {
        const labelA = (a.label || a.localId || '').toLowerCase();
        const labelB = (b.label || b.localId || '').toLowerCase();
        return labelA.localeCompare(labelB);
      });
    }
  }

  pending.sort();

  return { devices, pending };
}
