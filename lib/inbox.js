'use strict';

// Single-slot inbox: writing overwrites whatever was there before. This is
// a "send this one tab" nudge, not a queue — if two sends land in the same
// device's inbox within one poll tick, only the newer one survives, which
// is an acceptable ceiling for a personal 2-3 device tool (matches the
// project's existing last-write-wins stance on rare concurrent writes).
export async function writeInboxEntry(handle, targetDeviceId, entry) {
  const fileHandle = await handle.getFileHandle(`${targetDeviceId}-inbox.json`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(entry, null, 2));
  await writable.close();
}

export async function readInboxEntry(handle, deviceId) {
  try {
    const fileHandle = await handle.getFileHandle(`${deviceId}-inbox.json`);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

export async function getLastInboxTs() {
  const { inboxLastTs } = await chrome.storage.local.get('inboxLastTs');
  return inboxLastTs || 0;
}

export async function setLastInboxTs(ts) {
  await chrome.storage.local.set({ inboxLastTs: ts });
}
