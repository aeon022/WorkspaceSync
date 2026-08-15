'use strict';

export async function getLabels() {
  const { labels } = await chrome.storage.local.get('labels');
  return labels || {};
}

export async function setLabel(workspaceId, label) {
  const labels = await getLabels();
  labels[workspaceId] = label;
  await chrome.storage.local.set({ labels });
  return labels;
}
