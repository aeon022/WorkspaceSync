'use strict';

import { loadHandle } from './handleStore.js';
import { verifyPermission, readJsonFile } from './syncFolder.js';

export function normalizeWorkspaceId(raw) {
  if (raw === undefined || raw === null) return 'default';
  const n = Math.round(Number(raw));
  if (Number.isNaN(n)) return 'default';
  return String(n);
}

const LAYER2_FILE_NAME = '_layer2.json';
// How often the Layer 2 UI mod (uimod/workspacesync-uimod.js) writes a
// fresh snapshot. Older than three missed heartbeats means it's not
// currently connected/running.
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

// Reads the tab-to-workspace snapshot Layer 2 wrote directly into the sync
// folder (see uimod/workspacesync-uimod.js) - messaging between Vivaldi's
// privileged UI and this extension is confirmed blocked (Vivaldi's UI is
// very likely a Chromium "component extension"; chrome.runtime.sendMessage
// fails with "Could not establish connection" regardless of
// externally_connectable config), so the file itself is the bridge. Both
// this extension and Layer 2 need their own File System Access grant to
// the same folder (permissions are per-origin), but only Layer 2's grant
// is new - this extension already has one for the sync folder itself.
// Returns null if there's no sync folder configured, no permission, or no
// (or a stale) _layer2.json file.
async function readLayer2Snapshot() {
  const handle = await loadHandle();
  if (!handle || !(await verifyPermission(handle, false))) return null;

  const snapshot = await readJsonFile(handle, LAYER2_FILE_NAME);
  if (!snapshot?.updatedAt || !Array.isArray(snapshot.tabs)) return null;
  if (Date.now() - snapshot.updatedAt >= LAYER2_STALE_MS) return null;

  return snapshot;
}

export async function isLayer2Active() {
  return (await readLayer2Snapshot()) !== null;
}

export async function getLayer2Tabs() {
  const snapshot = await readLayer2Snapshot();
  return snapshot?.tabs || [];
}

export async function getLayer2WorkspaceNames() {
  const snapshot = await readLayer2Snapshot();
  return snapshot?.workspaceNames || {};
}

// Vivaldi workspace membership is only readable from Vivaldi's own
// privileged UI context (Layer 2) - never from this extension's own
// chrome.tabs.query, confirmed by direct testing. This reads the
// tab-to-workspace snapshot Layer 2 last wrote to the sync folder, falling
// back to a single undifferentiated 'default' bucket of every open tab if
// Layer 2 has never reported or has gone quiet.
export async function getLocalWorkspaces() {
  const layer2Tabs = await getLayer2Tabs();

  if (layer2Tabs.length > 0) {
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
