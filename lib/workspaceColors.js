'use strict';

export async function getColors() {
  const { workspaceColors } = await chrome.storage.local.get('workspaceColors');
  return workspaceColors || {};
}

export async function setColor(workspaceId, color) {
  const workspaceColors = await getColors();
  workspaceColors[workspaceId] = color;
  await chrome.storage.local.set({ workspaceColors });
  return workspaceColors;
}
