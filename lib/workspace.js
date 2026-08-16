'use strict';

export function normalizeWorkspaceId(raw) {
  if (raw === undefined || raw === null) return 'default';
  const n = Math.round(Number(raw));
  if (Number.isNaN(n)) return 'default';
  return String(n);
}

// How often the Layer 2 UI mod relays a fresh snapshot (uimod/workspacesync-uimod.js).
// Missing three heartbeats means it's not currently registered/running.
const LAYER2_STALE_MS = 90000;

function groupTabs(tabs) {
  const byWorkspace = new Map();

  for (const tab of tabs) {
    const key = tab.workspaceId || 'default';
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

export async function isLayer2Active() {
  const { layer2UpdatedAt } = await chrome.storage.local.get('layer2UpdatedAt');
  return !!(layer2UpdatedAt && Date.now() - layer2UpdatedAt < LAYER2_STALE_MS);
}

// Vivaldi workspace membership is only readable from Vivaldi's own
// privileged UI context (the Layer 2 Custom UI Modification script) -
// confirmed by direct testing, never from this extension's own
// chrome.tabs.query. This reads the tab-to-workspace snapshot Layer 2 last
// relayed via chrome.runtime.onMessageExternal (background.js), falling
// back to a single undifferentiated 'default' bucket of every open tab if
// Layer 2 has never reported or has gone quiet.
export async function getLocalWorkspaces() {
  const { layer2Tabs } = await chrome.storage.local.get('layer2Tabs');

  if (await isLayer2Active() && Array.isArray(layer2Tabs) && layer2Tabs.length > 0) {
    return groupTabs(layer2Tabs);
  }

  const fallbackTabs = await chrome.tabs.query({});
  return groupTabs(fallbackTabs.map((tab) => ({
    url: tab.url,
    title: tab.title,
    pinned: tab.pinned,
    favIconUrl: tab.favIconUrl,
    index: tab.index,
    workspaceId: 'default'
  })));
}
