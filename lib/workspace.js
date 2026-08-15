'use strict';

export function normalizeWorkspaceId(raw) {
  if (raw === undefined || raw === null) return 'default';
  const n = Math.round(Number(raw));
  if (Number.isNaN(n)) return 'default';
  return String(n);
}

function parseVivExtData(tab) {
  if (!tab.vivExtData) return {};
  try {
    return JSON.parse(tab.vivExtData);
  } catch {
    return {};
  }
}

export async function getLocalWorkspaces() {
  const tabs = await chrome.tabs.query({});
  const byWorkspace = new Map();

  for (const tab of tabs) {
    const { workspaceId } = parseVivExtData(tab);
    const key = normalizeWorkspaceId(workspaceId);
    if (!byWorkspace.has(key)) byWorkspace.set(key, []);
    byWorkspace.get(key).push({
      url: tab.url,
      title: tab.title || tab.url,
      pinned: !!tab.pinned,
      favIconUrl: tab.favIconUrl || '',
      index: tab.index
    });
  }

  return [...byWorkspace.entries()].map(([workspaceId, tabList]) => ({
    workspaceId,
    tabs: tabList.sort((a, b) => a.index - b.index)
  }));
}
