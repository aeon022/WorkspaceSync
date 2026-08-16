'use strict';

export async function getExcludedWorkspaces() {
  const { excludedWorkspaces } = await chrome.storage.local.get('excludedWorkspaces');
  return excludedWorkspaces || {};
}

export async function setSyncExcluded(workspaceId, excluded) {
  const excludedWorkspaces = await getExcludedWorkspaces();
  excludedWorkspaces[workspaceId] = excluded;
  await chrome.storage.local.set({ excludedWorkspaces });
  return excludedWorkspaces;
}
