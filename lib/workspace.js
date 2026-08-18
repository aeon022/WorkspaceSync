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

// url -> workspaceId, freshest snapshot wins per URL. This is deliberately
// NOT "trust whichever snapshot we find" - see getLocalWorkspaces below for
// why a URL that doesn't match one of THIS device's actual open tabs never
// gets used at all.
async function getLayer2WorkspaceIdByUrl() {
  const snapshots = await readLayer2Snapshots();
  const byUrl = new Map();
  for (const snapshot of snapshots) {
    for (const tab of snapshot.tabs) {
      if (!byUrl.has(tab.url)) byUrl.set(tab.url, normalizeWorkspaceId(tab.workspaceId));
    }
  }
  return byUrl;
}

// Vivaldi workspace membership is only readable from Vivaldi's own
// privileged UI context (Layer 2) - never from this extension's own
// chrome.tabs.query, confirmed by direct testing. So this always starts
// from chrome.tabs.query({}) - guaranteed to be THIS device's own actual
// open tabs, nothing else - and only uses Layer 2 to attach a workspace id
// to tabs whose URL genuinely matches one of them right now. A snapshot
// written by a different device sharing this sync folder mostly just
// fails to match (it's very unlikely to share this device's exact open
// URLs) rather than replacing the whole tab list, which is what used to
// happen when a foreign snapshot's tabs were trusted outright.
export async function getLocalWorkspaces() {
  const [localTabs, layer2ByUrl] = await Promise.all([
    chrome.tabs.query({}),
    getLayer2WorkspaceIdByUrl()
  ]);

  return groupTabs(localTabs.map((tab) => ({
    url: tab.url,
    title: tab.title,
    pinned: tab.pinned,
    favIconUrl: tab.favIconUrl,
    index: tab.index,
    workspaceId: layer2ByUrl.get(tab.url) || 'default'
  })));
}
