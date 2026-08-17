'use strict';

// navigator.platform is useless for telling devices apart: it returns the
// literal string "MacIntel" on every Mac regardless of chip (Intel or
// Apple Silicon) or hostname — there's no browser API that exposes an
// actual machine name to an extension. Appending a slice of this device's
// own random id at least keeps two Macs from showing up with an identical
// name; the user can still rename it for real via the Options page input.
function guessDeviceName(id) {
  const platform = navigator.platform || 'Device';
  return `${platform}-${id.slice(0, 4)}`;
}

export async function getOrCreateDevice() {
  const { device } = await chrome.storage.local.get('device');
  if (device?.id) return device;

  const id = crypto.randomUUID();
  const created = { id, name: guessDeviceName(id) };
  await chrome.storage.local.set({ device: created });
  return created;
}

export async function setDeviceName(name) {
  const { device } = await chrome.storage.local.get('device');
  const updated = { ...(device || {}), name };
  await chrome.storage.local.set({ device: updated });
  return updated;
}
