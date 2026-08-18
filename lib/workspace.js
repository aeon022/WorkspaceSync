'use strict';

import { loadHandle } from './handleStore.js';
import { verifyPermission, readJsonFile, listLayer2FileNames } from './syncFolder.js';

export function normalizeWorkspaceId(raw) {
  if (raw === undefined || raw === null) return 'default';
  const n = Math.round(Number(raw));
  if (Number.isNaN(n)) return 'default';
  return String(n);
}

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

// Reads every fresh Layer 2 snapshot currently in the sync folder (see
// uimod/workspacesync-uimod.js) - messaging between Vivaldi's privileged UI
// and this extension is confirmed blocked (Vivaldi's UI is very likely a
// Chromium "component extension"; chrome.runtime.sendMessage fails with
// "Could not establish connection" regardless of externally_connectable
// config), so the file itself is the bridge. Both this extension and
// Layer 2 need their own File System Access grant to the same folder
// (permissions are per-origin), but only Layer 2's grant is new - this
// extension already has one for the sync folder itself.
//
// There can be more than one: every device with Layer 2 running writes
// its own _layer2-<id>.json into this same Dropbox/iCloud-synced folder,
// so a snapshot showing up here is NOT necessarily this device's own - it
// could be another machine's, synced down. Sorted freshest-first so a
// caller merging by key (URL, workspace id) naturally prefers the most
// recently written entry when more than one snapshot mentions it.
async function readLayer2Snapshots() {
  const handle = await loadHandle();
  if (!handle || !(await verifyPermission(handle, false))) return [];

  const names = await listLayer2FileNames(handle);
  const snapshots = [];
  for (const name of names) {
    const snapshot = await readJsonFile(handle, name);
    if (!snapshot?.updatedAt || !Array.isArray(snapshot.tabs)) continue;
    if (Date.now() - snapshot.updatedAt >= LAYER2_STALE_MS) continue;
    snapshots.push(snapshot);
  }
  snapshots.sort((a, b) => b.updatedAt - a.updatedAt);
  return snapshots;
}

export async function isLayer2Active() {
  return (await readLayer2Snapshots()).length > 0;
}

// Flat list of every tab across every fresh snapshot - used by
// background.js to find a Layer 2-reported tab id to close. A caller
// closing a tab by this id MUST still verify it against this device's own
// chrome.tabs.query first (see background.js) - a foreign device's
// snapshot can appear here too, and its tab ids mean nothing on this
// machine.
export async function getLayer2Tabs() {
  const snapshots = await readLayer2Snapshots();
  return snapshots.flatMap((s) => s.tabs);
}

// Real Vivaldi workspace name per workspace id, freshest snapshot wins per
// key when more than one reports the same id (only plausible right after
// two devices briefly overlap, since ids are per-device otherwise).
export async function getLayer2WorkspaceNames() {
  const snapshots = await readLayer2Snapshots();
  const names = {};
  for (const snapshot of snapshots) {
    for (const [id, name] of Object.entries(snapshot.workspaceNames || {})) {
      if (!(id in names)) names[id] = name;
    }
  }
  return names;
}

// tab id -> {url, workspaceId}, freshest snapshot wins per id. Keyed by id,
// not URL: several tabs across DIFFERENT workspaces routinely share the
// exact same URL (a blank/speed-dial tab, a shared bookmark's landing
// page, ...), and a URL-keyed map can only ever remember one workspace per
// URL - collapsing every other same-URL tab (sometimes an entire workspace
// whose only tab was one of these) into 'default'. A tab id is unique
// within one browser session, so this doesn't have that problem. See
// getLocalWorkspaces below for why the URL is still carried alongside it
// and re-checked before being trusted.
async function getLayer2ById() {
  const snapshots = await readLayer2Snapshots();
  const byId = new Map();
  for (const snapshot of snapshots) {
    for (const tab of snapshot.tabs) {
      const key = String(tab.id);
      if (!byId.has(key)) byId.set(key, { url: tab.url, workspaceId: normalizeWorkspaceId(tab.workspaceId) });
    }
  }
  return byId;
}

// Vivaldi workspace membership is only readable from Vivaldi's own
// privileged UI context (Layer 2) - never from this extension's own
// chrome.tabs.query, confirmed by direct testing. So this always starts
// from chrome.tabs.query({}) - guaranteed to be THIS device's own actual
// open tabs, nothing else - and only uses Layer 2 to attach a workspace id
// to a tab whose id AND url both match one of Layer 2's entries right now.
// Requiring both, not just the id, is what makes reading a foreign
// device's snapshot harmless instead of an id coincidence quietly
// attaching the wrong workspace: a tab id is only meaningful within one
// browser session, so another machine's ids are essentially random noise
// here, and matching its URL too is what catches that.
export async function getLocalWorkspaces() {
  const [localTabs, layer2ById] = await Promise.all([
    chrome.tabs.query({}),
    getLayer2ById()
  ]);

  return groupTabs(localTabs.map((tab) => {
    const layer2Entry = layer2ById.get(String(tab.id));
    const workspaceId = layer2Entry && layer2Entry.url === tab.url ? layer2Entry.workspaceId : 'default';
    return {
      url: tab.url,
      title: tab.title,
      pinned: tab.pinned,
      favIconUrl: tab.favIconUrl,
      index: tab.index,
      workspaceId
    };
  }));
}
