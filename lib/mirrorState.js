'use strict';

export async function isMirrored(workspaceId) {
  const { mirrorFlags } = await chrome.storage.local.get('mirrorFlags');
  return !!(mirrorFlags || {})[workspaceId];
}

export async function setMirrored(workspaceId, on) {
  const { mirrorFlags } = await chrome.storage.local.get('mirrorFlags');
  const updated = { ...(mirrorFlags || {}), [workspaceId]: on };
  await chrome.storage.local.set({ mirrorFlags: updated });
  return updated;
}

function cursorKey(remoteDeviceId, workspaceLabel) {
  return `${remoteDeviceId}:${workspaceLabel}`;
}

export async function getLastAppliedTs(remoteDeviceId, workspaceLabel) {
  const { mirrorCursors } = await chrome.storage.local.get('mirrorCursors');
  return (mirrorCursors || {})[cursorKey(remoteDeviceId, workspaceLabel)] || 0;
}

export async function setLastAppliedTs(remoteDeviceId, workspaceLabel, ts) {
  const { mirrorCursors } = await chrome.storage.local.get('mirrorCursors');
  const updated = { ...(mirrorCursors || {}), [cursorKey(remoteDeviceId, workspaceLabel)]: ts };
  await chrome.storage.local.set({ mirrorCursors: updated });
}
