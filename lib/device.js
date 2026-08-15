'use strict';

function guessDeviceName() {
  const platform = navigator.platform || 'Device';
  return `${platform} (${new Date().toLocaleDateString()})`;
}

export async function getOrCreateDevice() {
  const { device } = await chrome.storage.local.get('device');
  if (device?.id) return device;

  const created = { id: crypto.randomUUID(), name: guessDeviceName() };
  await chrome.storage.local.set({ device: created });
  return created;
}

export async function setDeviceName(name) {
  const { device } = await chrome.storage.local.get('device');
  const updated = { ...(device || {}), name };
  await chrome.storage.local.set({ device: updated });
  return updated;
}
