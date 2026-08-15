# WorkspaceSync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vivaldi (Manifest V3) extension that lets you browse and open another device's workspace tabs from a sidepanel, and opt into live-mirroring a workspace that exists (by matching label) on two devices — synced through a JSON file per device in a folder the user already syncs via iCloud Drive/Dropbox.

**Architecture:** A background service worker polls local tabs (grouped by Vivaldi's undocumented-but-stable `vivExtData.workspaceId`) on a 1-minute alarm, writes a per-device JSON snapshot into a user-chosen synced folder via the File System Access API, and reads every other device's snapshot from the same folder. A sidepanel renders a browse-and-pick tree and per-workspace mirror toggles. A pure, unit-tested merge function decides which tabs to open/close locally to converge a mirrored workspace with a remote snapshot, deduping by URL. An optional, fully separable Custom UI Modification script (Layer 2) supplies real Vivaldi workspace names in place of user-typed labels; nothing else depends on it working.

**Tech Stack:** Plain JavaScript, Manifest V3 (ES module service worker), File System Access API, chrome.storage.local, chrome.alarms, chrome.tabs/chrome.windows. No build step, no npm dependencies — loaded unpacked, matching every other extension in `Extensions/`. Tests: plain Node `assert`, no framework.

**Spec:** `docs/superpowers/specs/2026-08-15-workspacesync-design.md`

## Global Constraints

- No build system, no npm dependencies — plain JS/HTML/CSS loaded unpacked (matches `Extensions/CLAUDE.md` convention).
- MV3 alarm minimum period is 1 minute — "live mirror" is at best ~1-minute latency, never presented as instant.
- Layer 1 (label-based, standard extension APIs only) must work completely standalone. Layer 2 (Custom UI Modification bridge) is additive only — its absence must never break Layer 1.
- Cross-device workspace matching is by exact `label` string (case-sensitive), not by Vivaldi's internal `workspaceId` (those are per-device and never coincide naturally).
- Mirroring a workspace pairing only activates once **both** devices have the toggle on for that label.
- Dedup rule: never open a URL locally that's already open in the target workspace; never close a URL that isn't actually open locally. This check re-runs every tick, not just at mirror-enable time.
- The extension ID is pinned via a `key` in `manifest.json` (see Task 1) so Layer 2's `externally_connectable` target and any hardcoded IDs stay stable across reloads.

---

## Task 1: Extension scaffold

**Files:**
- Create: `manifest.json`
- Create: `background.js`
- Create: `sidepanel.html`
- Create: `sidepanel.js`
- Create: `options.html`
- Create: `options.js`
- Create: `.gitignore`

**Interfaces:**
- Produces: a loadable MV3 extension with a fixed extension ID `cmjniggmemdcamengapegfpfhdinbejo`, an empty sidepanel and options page, and a background service worker that only wires up the side-panel-on-click behavior. Later tasks fill in real logic in these same files.

- [ ] **Step 1: Write `.gitignore`**

```
wsync-signing-key.pem
```

(The private key isn't a security secret here — nothing is ever published to a store — but there's no reason to publish it either. Losing it just means picking a new one and updating Task 10's hardcoded extension ID.)

- [ ] **Step 2: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "WorkspaceSync",
  "version": "0.1.0",
  "description": "Browse and mirror Vivaldi workspaces and open tabs across your devices.",
  "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAstTpFKIA9lR3xHxnCorQXOVzyfYTIpSo89TK145cIGJoYYrVMJgcP8LRTIXNxWMCGOyBnhHHOwQrP7g7HZdhKL0oIkTjW4TxJghbJf5yxoyAgKgS2IRmW/5gmd17U4pqDFc41fgNnoYybArwPhbkjOdzC940nSOrYc5vxc0swNeZKVhCcSf5g0CaaoL7TingWbRMn6lZX4BhHADldM/u8BplZM4gHD8BgAUgzVg+q/6rfIMhntb3M9sFX5xcjKE6V4qDctrrJkDwEPpF9+E8wMxON0BYdHaytfUxkoCT8FoIXw2Yi0zsKpxsnx/ASeWemv8eOJuFCmsoh5PbAWCJ7QIDAQAB",
  "permissions": ["tabs", "storage", "alarms", "sidePanel"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "action": {
    "default_title": "WorkspaceSync"
  }
}
```

- [ ] **Step 3: Write `background.js`**

```js
'use strict';

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}
```

- [ ] **Step 4: Write `sidepanel.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WorkspaceSync</title>
  <style>
    body { font: 13px system-ui, sans-serif; margin: 0; padding: 12px; color: #1a1a1a; }
    h1 { font-size: 14px; margin: 0 0 12px; }
  </style>
</head>
<body>
  <h1>WorkspaceSync</h1>
  <div id="root">Loading…</div>
  <script src="sidepanel.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 5: Write `sidepanel.js`**

```js
'use strict';

document.getElementById('root').textContent = 'WorkspaceSync scaffold loaded.';
```

- [ ] **Step 6: Write `options.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WorkspaceSync Settings</title>
  <style>
    body { font: 14px system-ui, sans-serif; margin: 24px; max-width: 560px; }
    h1 { font-size: 18px; }
  </style>
</head>
<body>
  <h1>WorkspaceSync Settings</h1>
  <div id="root">Loading…</div>
  <script src="options.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 7: Write `options.js`**

```js
'use strict';

document.getElementById('root').textContent = 'WorkspaceSync scaffold loaded.';
```

- [ ] **Step 8: Manual test — load unpacked**

In Vivaldi: `vivaldi://extensions` → enable Developer mode → "Load unpacked" → select the `WorkspaceSync/` folder.

Expected:
- Extension loads with no errors on the extensions page.
- Its ID in the extensions page reads `cmjniggmemdcamengapegfpfhdinbejo`.
- Clicking the toolbar icon opens the side panel showing "WorkspaceSync scaffold loaded."
- Right-clicking the extension icon → Options opens a tab showing "WorkspaceSync scaffold loaded."

- [ ] **Step 9: Commit**

```bash
cd ~/Developing/Projects/Extensions/WorkspaceSync
git add manifest.json background.js sidepanel.html sidepanel.js options.html options.js .gitignore
git commit -m "Scaffold WorkspaceSync MV3 extension"
```

---

## Task 2: Device identity and workspace grouping

**Files:**
- Create: `lib/device.js`
- Create: `lib/workspace.js`
- Modify: `background.js`

**Interfaces:**
- Consumes: nothing from earlier tasks beyond the manifest's `storage`/`tabs` permissions (Task 1).
- Produces:
  - `lib/device.js`: `async function getOrCreateDevice()` → `{ id: string, name: string }`. Reads/writes `chrome.storage.local` key `device`. `id` is a `crypto.randomUUID()` generated once. `name` defaults to `navigator.platform`-derived guess and is editable later (Task 3's options page).
  - `lib/workspace.js`: `function normalizeWorkspaceId(raw)` → `string` (handles the int/float quirk: `String(Math.round(Number(raw)))`; returns `'default'` for `undefined`/`null`). `async function getLocalWorkspaces()` → `Array<{ workspaceId: string, tabs: Array<{ url: string, title: string, pinned: boolean, favIconUrl: string, index: number }> }>`, built from `chrome.tabs.query({})` grouped by `normalizeWorkspaceId(tab.vivExtData ? JSON.parse(tab.vivExtData).workspaceId : undefined)`.

- [ ] **Step 1: Write `lib/device.js`**

```js
'use strict';

function guessDeviceName() {
  const platform = navigator.platform || 'Device';
  return `${platform} (${new Date().toLocaleDateString()})`;
}

export async function getOrCreateDevice() {
  const { device } = await chrome.storage.local.get('device');
  if (device?.id) return device;

  const created = { id: crypto.randomUUID(), name: guessDeviceName() };
  await chrome.storage.local.set({ device: created });
  return created;
}

export async function setDeviceName(name) {
  const { device } = await chrome.storage.local.get('device');
  const updated = { ...(device || {}), name };
  await chrome.storage.local.set({ device: updated });
  return updated;
}
```

- [ ] **Step 2: Write `lib/workspace.js`**

```js
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
```

- [ ] **Step 3: Wire into `background.js`**

```js
'use strict';

import { getOrCreateDevice } from './lib/device.js';
import { getLocalWorkspaces } from './lib/workspace.js';

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(async () => {
  const device = await getOrCreateDevice();
  const workspaces = await getLocalWorkspaces();
  console.log('[WorkspaceSync] device', device);
  console.log('[WorkspaceSync] workspaces', workspaces);
});
```

- [ ] **Step 4: Manual test**

Reload the extension in `vivaldi://extensions`. Open several tabs across at least two different Vivaldi workspaces. Click "Service Worker" on the extension's card to open its console (or trigger `chrome.runtime.onInstalled` by toggling the extension off/on).

Expected: console logs a `device` object with a stable `id`/`name`, and a `workspaces` array with one entry per workspace you actually have open, each listing the right tabs.

- [ ] **Step 5: Commit**

```bash
git add lib/device.js lib/workspace.js background.js
git commit -m "Add device identity and local workspace grouping"
```

---

## Task 3: Sync folder connection (File System Access)

**Files:**
- Create: `lib/handleStore.js`
- Create: `lib/syncFolder.js`
- Modify: `options.html`
- Modify: `options.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `lib/handleStore.js`: `async function saveHandle(handle)`, `async function loadHandle()` → `FileSystemDirectoryHandle | null`. Raw IndexedDB (no chrome.storage — handles aren't JSON-serializable).
  - `lib/syncFolder.js`: `async function pickSyncFolder()` → `FileSystemDirectoryHandle` (must be called from a user gesture in a document context, i.e. only from `options.js`). `async function verifyPermission(handle, requestIfNeeded)` → `boolean`. `async function writeDeviceFile(handle, deviceId, data)`. `async function scanSyncFolder(handle, ownDeviceId)` → `{ devices: Array<object>, pending: Array<string> }` (parses every `*.json` entry except the caller's own; entries named `.{name}.icloud` are undownloaded iCloud placeholders and go into `pending` instead of being silently skipped).

- [ ] **Step 1: Write `lib/handleStore.js`**

```js
'use strict';

const DB_NAME = 'workspacesync';
const STORE = 'handles';
const KEY = 'syncFolder';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveHandle(handle) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadHandle() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
```

- [ ] **Step 2: Write `lib/syncFolder.js`**

```js
'use strict';

export async function pickSyncFolder() {
  return window.showDirectoryPicker({ id: 'workspacesync', mode: 'readwrite' });
}

export async function verifyPermission(handle, requestIfNeeded) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (!requestIfNeeded) return false;
  return (await handle.requestPermission(opts)) === 'granted';
}

export async function writeDeviceFile(handle, deviceId, data) {
  const fileHandle = await handle.getFileHandle(`${deviceId}.json`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

const ICLOUD_PLACEHOLDER = /^\.(.+)\.icloud$/;

export async function scanSyncFolder(handle, ownDeviceId) {
  const devices = [];
  const pending = [];

  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== 'file') continue;

    const placeholderMatch = name.match(ICLOUD_PLACEHOLDER);
    if (placeholderMatch) {
      pending.push(placeholderMatch[1]);
      continue;
    }

    if (!name.endsWith('.json')) continue;
    const deviceIdFromName = name.slice(0, -'.json'.length);
    if (deviceIdFromName === ownDeviceId) continue;

    const file = await entry.getFile();
    const text = await file.text();
    try {
      devices.push(JSON.parse(text));
    } catch {
      // Corrupt/partially-written snapshot from a device mid-write — skip
      // this tick, it'll be complete on the next one.
    }
  }

  return { devices, pending };
}
```

- [ ] **Step 3: Update `options.html`** — replace the placeholder `<div id="root">` content with real controls:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WorkspaceSync Settings</title>
  <style>
    body { font: 14px system-ui, sans-serif; margin: 24px; max-width: 560px; }
    h1 { font-size: 18px; }
    label { display: block; margin: 16px 0 4px; font-weight: 600; }
    input[type="text"] { width: 100%; padding: 6px; box-sizing: border-box; }
    button { margin-top: 8px; padding: 6px 12px; }
    #folderStatus { margin-top: 8px; color: #555; }
  </style>
</head>
<body>
  <h1>WorkspaceSync Settings</h1>

  <label for="deviceName">Device name</label>
  <input type="text" id="deviceName">

  <label>Sync folder</label>
  <button id="pickFolder">Choose sync folder…</button>
  <div id="folderStatus">No folder chosen yet.</div>

  <script src="options.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 4: Write `options.js`**

```js
'use strict';

import { getOrCreateDevice, setDeviceName } from './lib/device.js';
import { saveHandle, loadHandle } from './lib/handleStore.js';
import { pickSyncFolder, verifyPermission, writeDeviceFile } from './lib/syncFolder.js';

const deviceNameInput = document.getElementById('deviceName');
const pickFolderBtn = document.getElementById('pickFolder');
const folderStatus = document.getElementById('folderStatus');

async function refreshFolderStatus() {
  const handle = await loadHandle();
  if (!handle) {
    folderStatus.textContent = 'No folder chosen yet.';
    return;
  }
  const ok = await verifyPermission(handle, false);
  folderStatus.textContent = ok
    ? `Connected: ${handle.name}`
    : `Connected to "${handle.name}" but permission needs to be re-granted — click "Choose sync folder…" again.`;
}

async function init() {
  const device = await getOrCreateDevice();
  deviceNameInput.value = device.name;
  await refreshFolderStatus();
}

deviceNameInput.addEventListener('change', async () => {
  await setDeviceName(deviceNameInput.value.trim() || deviceNameInput.value);
});

pickFolderBtn.addEventListener('click', async () => {
  const handle = await pickSyncFolder();
  await saveHandle(handle);
  const device = await getOrCreateDevice();
  await writeDeviceFile(handle, device.id, {
    deviceId: device.id,
    deviceName: device.name,
    updatedAt: new Date().toISOString(),
    workspaces: []
  });
  await refreshFolderStatus();
});

init();
```

- [ ] **Step 5: Manual test**

Reload the extension. Open Options. Set a device name, tab away, confirm it's saved (reopen Options, value persists). Click "Choose sync folder…", pick (or create) a subfolder inside your iCloud Drive/Dropbox. Confirm `folderStatus` shows "Connected: <folder name>" and that a `<uuid>.json` file with an empty `workspaces` array actually appears in that folder on disk.

- [ ] **Step 6: Commit**

```bash
git add lib/handleStore.js lib/syncFolder.js options.html options.js
git commit -m "Add sync folder connection via File System Access API"
```

---

## Task 4: Snapshot writer loop

**Files:**
- Create: `lib/labels.js`
- Modify: `background.js`

**Interfaces:**
- Consumes: `getOrCreateDevice` (Task 2), `getLocalWorkspaces`/`normalizeWorkspaceId` (Task 2), `loadHandle` (Task 3), `verifyPermission`/`writeDeviceFile` (Task 3).
- Produces: `lib/labels.js`: `async function getLabels()` → `Record<workspaceId, string>`, `async function setLabel(workspaceId, label)`. Reads/writes `chrome.storage.local` key `labels`. `background.js` gains a `chrome.alarms` tick (`workspacesync-sync`, period 1 minute) that writes a full snapshot on every fire, and also once on install/startup.

- [ ] **Step 1: Write `lib/labels.js`**

```js
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
```

- [ ] **Step 2: Rewrite `background.js`**

```js
'use strict';

import { getOrCreateDevice } from './lib/device.js';
import { getLocalWorkspaces } from './lib/workspace.js';
import { getLabels } from './lib/labels.js';
import { loadHandle } from './lib/handleStore.js';
import { verifyPermission, writeDeviceFile } from './lib/syncFolder.js';

const ALARM_NAME = 'workspacesync-sync';

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) writeSnapshot();
});
chrome.runtime.onInstalled.addListener(writeSnapshot);
chrome.runtime.onStartup.addListener(writeSnapshot);

export async function writeSnapshot() {
  const handle = await loadHandle();
  if (!handle) return; // no sync folder configured yet
  if (!(await verifyPermission(handle, false))) return; // Task 9 handles surfacing this

  const [device, localWorkspaces, labels] = await Promise.all([
    getOrCreateDevice(),
    getLocalWorkspaces(),
    getLabels()
  ]);

  const { workspaces: previous } = await readOwnPreviousSnapshot(handle, device.id);

  const workspaces = localWorkspaces.map((ws) => {
    const prev = previous.find((p) => p.localId === ws.workspaceId);
    return {
      localId: ws.workspaceId,
      label: labels[ws.workspaceId] || prev?.label || '',
      mirror: prev?.mirror || false,
      tabs: ws.tabs,
      recentEvents: prev?.recentEvents || []
    };
  });

  await writeDeviceFile(handle, device.id, {
    deviceId: device.id,
    deviceName: device.name,
    updatedAt: new Date().toISOString(),
    workspaces
  });
}

async function readOwnPreviousSnapshot(handle, deviceId) {
  try {
    const fileHandle = await handle.getFileHandle(`${deviceId}.json`);
    const file = await fileHandle.getFile();
    const parsed = JSON.parse(await file.text());
    return { workspaces: parsed.workspaces || [] };
  } catch {
    return { workspaces: [] };
  }
}
```

(`readOwnPreviousSnapshot` exists so `label`, `mirror`, and `recentEvents` — all set elsewhere, by Task 5's sidepanel and Task 8's event listeners — survive across ticks instead of being wiped every minute by the tab re-scan.)

- [ ] **Step 3: Manual test**

Reload the extension with a sync folder already configured (Task 3). Wait up to a minute, or manually fire the alarm from the service worker console with `writeSnapshot()`. Open the written `<deviceId>.json` file and confirm it lists real workspace ids and tab URLs/titles matching what's actually open.

- [ ] **Step 4: Commit**

```bash
git add lib/labels.js background.js
git commit -m "Write periodic per-device workspace snapshot to sync folder"
```

---

## Task 5: Label management UI

**Files:**
- Modify: `sidepanel.html`
- Modify: `sidepanel.js`

**Interfaces:**
- Consumes: `getLocalWorkspaces` (Task 2), `getLabels`/`setLabel` (Task 4).
- Produces: a sidepanel section listing local workspaces; unlabeled ones get a text input + Save button that calls `setLabel`.

- [ ] **Step 1: Update `sidepanel.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WorkspaceSync</title>
  <style>
    body { font: 13px system-ui, sans-serif; margin: 0; padding: 12px; color: #1a1a1a; }
    h1 { font-size: 14px; margin: 0 0 12px; }
    h2 { font-size: 12px; text-transform: uppercase; color: #666; margin: 16px 0 6px; }
    .ws-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; }
    .ws-row input[type="text"] { flex: 1; padding: 4px; }
    .ws-row .count { color: #888; font-size: 11px; }
  </style>
</head>
<body>
  <h1>WorkspaceSync</h1>
  <h2>This device's workspaces</h2>
  <div id="localWorkspaces">Loading…</div>
  <script src="sidepanel.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: Rewrite `sidepanel.js`**

```js
'use strict';

import { getLocalWorkspaces } from './lib/workspace.js';
import { getLabels, setLabel } from './lib/labels.js';

const localList = document.getElementById('localWorkspaces');

async function renderLocalWorkspaces() {
  const [workspaces, labels] = await Promise.all([getLocalWorkspaces(), getLabels()]);
  localList.innerHTML = '';

  for (const ws of workspaces) {
    const row = document.createElement('div');
    row.className = 'ws-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Name this workspace…';
    input.value = labels[ws.workspaceId] || '';

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${ws.tabs.length} tab${ws.tabs.length === 1 ? '' : 's'}`;

    input.addEventListener('change', async () => {
      await setLabel(ws.workspaceId, input.value.trim());
    });

    row.append(input, count);
    localList.append(row);
  }

  if (workspaces.length === 0) {
    localList.textContent = 'No open tabs found.';
  }
}

renderLocalWorkspaces();
chrome.tabs.onCreated.addListener(renderLocalWorkspaces);
chrome.tabs.onRemoved.addListener(renderLocalWorkspaces);
chrome.tabs.onUpdated.addListener(renderLocalWorkspaces);
```

- [ ] **Step 3: Manual test**

Reload the extension, open the side panel. Confirm every open workspace shows with its real tab count. Type a label into one, tab away — reopen the side panel and confirm the label persisted. Open/close a tab and confirm the list updates live. Wait for the next snapshot write (Task 4) and confirm the label now shows up in the written JSON file's `label` field for that workspace.

- [ ] **Step 4: Commit**

```bash
git add sidepanel.html sidepanel.js
git commit -m "Add workspace labeling UI to sidepanel"
```

---

## Task 6: Merge/diff logic (TDD)

**Files:**
- Create: `lib/merge.js`
- Test: `tests/merge.test.js`

**Interfaces:**
- Consumes: nothing (pure function, no chrome APIs).
- Produces: `function computeSyncActions(localTabs, remoteWorkspace, lastAppliedTs)` → `{ toOpen: string[], toClose: string[], newLastAppliedTs: number }`.
  - `localTabs`: `Array<{ url: string }>` — tabs currently open locally in the mirrored workspace.
  - `remoteWorkspace`: `{ tabs: Array<{ url: string }>, recentEvents: Array<{ op: 'open' | 'close', url: string, ts: number }> }`.
  - `lastAppliedTs`: `number` — the `ts` of the newest remote event already applied by this device (`0` if none yet).
  - This is the function Task 8 wires into the alarm tick.

- [ ] **Step 1: Write the failing test — `tests/merge.test.js`**

```js
'use strict';

const assert = require('node:assert');
const { computeSyncActions } = require('../lib/merge.js');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

run('opens a tab that was opened remotely and is missing locally', () => {
  const result = computeSyncActions(
    [{ url: 'https://a.com' }],
    {
      tabs: [{ url: 'https://a.com' }, { url: 'https://b.com' }],
      recentEvents: [{ op: 'open', url: 'https://b.com', ts: 100 }]
    },
    0
  );
  assert.deepStrictEqual(result.toOpen, ['https://b.com']);
  assert.deepStrictEqual(result.toClose, []);
  assert.strictEqual(result.newLastAppliedTs, 100);
});

run('closes a tab that was closed remotely and is still open locally', () => {
  const result = computeSyncActions(
    [{ url: 'https://a.com' }, { url: 'https://b.com' }],
    {
      tabs: [{ url: 'https://a.com' }],
      recentEvents: [{ op: 'close', url: 'https://b.com', ts: 100 }]
    },
    0
  );
  assert.deepStrictEqual(result.toOpen, []);
  assert.deepStrictEqual(result.toClose, ['https://b.com']);
});

run('does not duplicate a tab already open on both sides (dedup by URL)', () => {
  const result = computeSyncActions(
    [{ url: 'https://a.com' }],
    {
      tabs: [{ url: 'https://a.com' }],
      recentEvents: [{ op: 'open', url: 'https://a.com', ts: 100 }]
    },
    0
  );
  assert.deepStrictEqual(result.toOpen, []);
  assert.deepStrictEqual(result.toClose, []);
});

run('does not try to close a URL that is not actually open locally', () => {
  const result = computeSyncActions(
    [{ url: 'https://a.com' }],
    {
      tabs: [],
      recentEvents: [{ op: 'close', url: 'https://never-was-open.com', ts: 100 }]
    },
    0
  );
  assert.deepStrictEqual(result.toClose, []);
});

run('ignores events at or before lastAppliedTs and advances the cursor to the newest new event', () => {
  const result = computeSyncActions(
    [],
    {
      tabs: [{ url: 'https://a.com' }, { url: 'https://b.com' }],
      recentEvents: [
        { op: 'open', url: 'https://a.com', ts: 50 },
        { op: 'open', url: 'https://b.com', ts: 150 }
      ]
    },
    100
  );
  assert.deepStrictEqual(result.toOpen, ['https://b.com']);
  assert.strictEqual(result.newLastAppliedTs, 150);
});

run('a later close event cancels an earlier open event for the same URL in one tick', () => {
  const result = computeSyncActions(
    [],
    {
      tabs: [],
      recentEvents: [
        { op: 'open', url: 'https://a.com', ts: 100 },
        { op: 'close', url: 'https://a.com', ts: 200 }
      ]
    },
    0
  );
  assert.deepStrictEqual(result.toOpen, []);
  assert.deepStrictEqual(result.toClose, []);
});

run('lastAppliedTs does not regress when there are no new events', () => {
  const result = computeSyncActions([{ url: 'https://a.com' }], { tabs: [{ url: 'https://a.com' }], recentEvents: [] }, 500);
  assert.strictEqual(result.newLastAppliedTs, 500);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/merge.test.js`
Expected: `Error: Cannot find module '../lib/merge.js'` (file doesn't exist yet).

- [ ] **Step 3: Write `lib/merge.js`**

```js
'use strict';

function computeSyncActions(localTabs, remoteWorkspace, lastAppliedTs) {
  const localUrls = new Set(localTabs.map((t) => t.url));
  const newEvents = remoteWorkspace.recentEvents
    .filter((e) => e.ts > lastAppliedTs)
    .sort((a, b) => a.ts - b.ts);

  const toOpen = new Set();
  const toClose = new Set();

  for (const event of newEvents) {
    if (event.op === 'open') {
      toOpen.add(event.url);
      toClose.delete(event.url);
    } else if (event.op === 'close') {
      toClose.add(event.url);
      toOpen.delete(event.url);
    }
  }

  const finalToOpen = [...toOpen].filter((url) => !localUrls.has(url));
  const finalToClose = [...toClose].filter((url) => localUrls.has(url));

  const newLastAppliedTs = newEvents.length
    ? newEvents[newEvents.length - 1].ts
    : lastAppliedTs;

  return { toOpen: finalToOpen, toClose: finalToClose, newLastAppliedTs };
}

module.exports = { computeSyncActions };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/merge.test.js`
Expected: seven `PASS` lines, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add lib/merge.js tests/merge.test.js
git commit -m "Add event-log merge function for live-mirror sync, with tests"
```

---

## Task 7: Browse & pick (remote devices in the sidepanel)

**Files:**
- Modify: `sidepanel.html`
- Modify: `sidepanel.js`

**Interfaces:**
- Consumes: `loadHandle` (Task 3), `scanSyncFolder`/`verifyPermission` (Task 3), `getOrCreateDevice` (Task 2).
- Produces: a "Other devices" section in the sidepanel: device → workspace → tab tree. Clicking a tab opens it (`chrome.tabs.create`). An "Open all" button per workspace opens `chrome.windows.create({ url: [...urls] })`. Placeholder (not-yet-downloaded) remote snapshots from `scanSyncFolder`'s `pending` list render as "Syncing…".

- [ ] **Step 1: Add a container to `sidepanel.html`** — insert before the closing `</body>`, after the existing `#localWorkspaces` div:

```html
  <h2>Other devices</h2>
  <div id="remoteDevices">Loading…</div>
```

- [ ] **Step 2: Extend `sidepanel.js`** — append to the existing file:

```js
import { loadHandle } from './lib/handleStore.js';
import { verifyPermission, scanSyncFolder } from './lib/syncFolder.js';

const remoteList = document.getElementById('remoteDevices');

async function renderRemoteDevices() {
  const handle = await loadHandle();
  if (!handle) {
    remoteList.textContent = 'No sync folder configured — set one up in Options.';
    return;
  }
  if (!(await verifyPermission(handle, false))) {
    remoteList.textContent = 'Sync folder permission lost — reconnect it in Options.';
    return;
  }

  const { devices, pending } = await scanSyncFolder(handle, (await getOwnDeviceId()));
  remoteList.innerHTML = '';

  for (const name of pending) {
    const p = document.createElement('div');
    p.textContent = `${name}: syncing…`;
    remoteList.append(p);
  }

  for (const device of devices) {
    const deviceHeader = document.createElement('div');
    deviceHeader.textContent = device.deviceName || device.deviceId;
    deviceHeader.style.fontWeight = '600';
    deviceHeader.style.marginTop = '8px';
    remoteList.append(deviceHeader);

    for (const ws of device.workspaces || []) {
      const wsHeader = document.createElement('div');
      wsHeader.style.marginLeft = '8px';
      wsHeader.style.marginTop = '4px';

      const label = ws.label || '(unlabeled)';
      const openAllBtn = document.createElement('button');
      openAllBtn.textContent = `Open all (${ws.tabs.length})`;
      openAllBtn.addEventListener('click', () => {
        chrome.windows.create({ url: ws.tabs.map((t) => t.url) });
      });

      wsHeader.textContent = `${label} `;
      wsHeader.append(openAllBtn);
      remoteList.append(wsHeader);

      for (const tab of ws.tabs) {
        const tabRow = document.createElement('div');
        tabRow.style.marginLeft = '16px';
        tabRow.style.cursor = 'pointer';
        tabRow.style.color = '#0645ad';
        tabRow.textContent = tab.title || tab.url;
        tabRow.addEventListener('click', () => {
          chrome.tabs.create({ url: tab.url });
        });
        remoteList.append(tabRow);
      }
    }
  }

  if (devices.length === 0 && pending.length === 0) {
    remoteList.textContent = 'No other devices found in the sync folder yet.';
  }
}

async function getOwnDeviceId() {
  const { device } = await chrome.storage.local.get('device');
  return device?.id;
}

renderRemoteDevices();
setInterval(renderRemoteDevices, 15000);
```

- [ ] **Step 3: Manual test with a hand-crafted fixture**

With a real sync folder configured (Task 3/4), manually create a second file in that folder named `fixture-device.json`:

```json
{
  "deviceId": "fixture-device",
  "deviceName": "Fixture Laptop",
  "updatedAt": "2026-08-15T00:00:00.000Z",
  "workspaces": [
    {
      "localId": "1",
      "label": "Coding",
      "mirror": false,
      "tabs": [
        { "url": "https://example.com", "title": "Example", "pinned": false, "favIconUrl": "", "index": 0 }
      ],
      "recentEvents": []
    }
  ]
}
```

Open the sidepanel. Expected: "Fixture Laptop" appears under "Other devices" with a "Coding" workspace showing one tab. Clicking the tab title opens `https://example.com` in the current window. Clicking "Open all (1)" opens it as a new window instead.

- [ ] **Step 4: Commit**

```bash
git add sidepanel.html sidepanel.js
git commit -m "Add browse-and-pick view for other devices' workspaces"
```

---

## Task 8: Live mirror wiring

**Files:**
- Modify: `sidepanel.js`
- Modify: `background.js`
- Create: `lib/mirrorState.js`

**Interfaces:**
- Consumes: `computeSyncActions` (Task 6), `scanSyncFolder`/`loadHandle`/`verifyPermission`/`writeDeviceFile` (Task 3), `getLabels` (Task 4).
- Produces:
  - `lib/mirrorState.js`: `async function isMirrored(workspaceId)` / `async function setMirrored(workspaceId, on)` (reads/writes `chrome.storage.local` key `mirrorFlags`, `Record<workspaceId, boolean>`). `async function getLastAppliedTs(remoteDeviceId, workspaceLabel)` / `async function setLastAppliedTs(remoteDeviceId, workspaceLabel, ts)` (key `mirrorCursors`, `Record<string, number>` keyed by `` `${remoteDeviceId}:${workspaceLabel}` ``).
  - Sidepanel: a "Mirror" checkbox next to any local workspace whose label matches a label seen on at least one remote device.
  - Background: on every alarm tick, after writing the snapshot, run mirror reconciliation for every local workspace with `mirrorFlags[workspaceId] === true` **and** a remote snapshot showing `mirror: true` for a workspace with the same label.

- [ ] **Step 1: Write `lib/mirrorState.js`**

```js
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
```

- [ ] **Step 2: Extend `sidepanel.js`'s local-workspace rendering** — in `renderLocalWorkspaces`, after computing `workspaces`/`labels`, also fetch remote labels once and add a mirror checkbox. Replace the whole function with:

```js
import { isMirrored, setMirrored } from './lib/mirrorState.js';

async function collectRemoteLabels() {
  const handle = await loadHandle();
  if (!handle || !(await verifyPermission(handle, false))) return new Set();
  const { devices } = await scanSyncFolder(handle, await getOwnDeviceId());
  const labels = new Set();
  for (const device of devices) {
    for (const ws of device.workspaces || []) {
      if (ws.label) labels.add(ws.label);
    }
  }
  return labels;
}

async function renderLocalWorkspaces() {
  const [workspaces, labels, remoteLabels] = await Promise.all([
    getLocalWorkspaces(),
    getLabels(),
    collectRemoteLabels()
  ]);
  localList.innerHTML = '';

  for (const ws of workspaces) {
    const row = document.createElement('div');
    row.className = 'ws-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Name this workspace…';
    const currentLabel = labels[ws.workspaceId] || '';
    input.value = currentLabel;

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${ws.tabs.length} tab${ws.tabs.length === 1 ? '' : 's'}`;

    input.addEventListener('change', async () => {
      await setLabel(ws.workspaceId, input.value.trim());
      renderLocalWorkspaces();
    });

    row.append(input, count);

    if (currentLabel && remoteLabels.has(currentLabel)) {
      const mirrorLabel = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = await isMirrored(ws.workspaceId);
      checkbox.addEventListener('change', async () => {
        await setMirrored(ws.workspaceId, checkbox.checked);
      });
      mirrorLabel.append(checkbox, ' Mirror');
      row.append(mirrorLabel);
    }

    localList.append(row);
  }

  if (workspaces.length === 0) {
    localList.textContent = 'No open tabs found.';
  }
}
```

- [ ] **Step 3: Persist `mirror` flags and derive open/close events by diffing against the previous snapshot** — in `background.js`, add this import at the top alongside the existing ones (needed now, and again by Step 4):

```js
import { isMirrored, getLastAppliedTs, setLastAppliedTs } from './lib/mirrorState.js';
```

There's no reliable way to catch a tab close *event* directly — `chrome.tabs.onRemoved` doesn't carry the closed tab's URL, only its id. Instead, derive both open and close events by comparing this tick's tab list against the previous snapshot's, which `writeSnapshot` already loads as `previous`. Replace the entire `.map` callback body:

```js
  const workspaces = localWorkspaces.map((ws) => {
    const prev = previous.find((p) => p.localId === ws.workspaceId);
    return {
      localId: ws.workspaceId,
      label: labels[ws.workspaceId] || prev?.label || '',
      mirror: prev?.mirror || false,
      tabs: ws.tabs,
      recentEvents: prev?.recentEvents || []
    };
  });
```

with:

```js
  const workspaces = await Promise.all(localWorkspaces.map(async (ws) => {
    const prev = previous.find((p) => p.localId === ws.workspaceId);
    const prevUrls = new Set((prev?.tabs || []).map((t) => t.url));
    const currentUrls = new Set(ws.tabs.map((t) => t.url));
    const now = Date.now();
    const newEvents = [
      ...ws.tabs.filter((t) => !prevUrls.has(t.url)).map((t) => ({ op: 'open', url: t.url, ts: now })),
      ...(prev?.tabs || []).filter((t) => !currentUrls.has(t.url)).map((t) => ({ op: 'close', url: t.url, ts: now }))
    ];

    return {
      localId: ws.workspaceId,
      label: labels[ws.workspaceId] || prev?.label || '',
      mirror: await isMirrored(ws.workspaceId),
      tabs: ws.tabs,
      recentEvents: [...(prev?.recentEvents || []), ...newEvents].slice(-50)
    };
  }));
```

(this means open/close detection is bounded by the same 1-minute alarm tick as everything else — consistent with the spec's "live mirror is ~1 minute, not instant," and it needs no separate `chrome.tabs.onCreated`/`onRemoved` listeners in `background.js` at all.)

- [ ] **Step 4: Add mirror reconciliation to `background.js`** — append after the `writeSnapshot` function. Add these two imports at the top alongside the others:

```js
import { computeSyncActions } from './lib/merge.js';
import { scanSyncFolder } from './lib/syncFolder.js';
```

Then **replace** the existing alarm listener from Task 4 —

```js
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) writeSnapshot();
});
```

— with:

```js
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await writeSnapshot();
  await reconcileMirrors();
});
```

(the old listener must be removed, not left alongside the new one — otherwise `writeSnapshot` fires twice per tick.)

Then add the reconciliation function itself:

```js
export async function reconcileMirrors() {
  const handle = await loadHandle();
  if (!handle || !(await verifyPermission(handle, false))) return;

  const device = await getOrCreateDevice();
  const localWorkspaces = await getLocalWorkspaces();
  const labels = await getLabels();
  const { devices: remoteDevices } = await scanSyncFolder(handle, device.id);

  for (const ws of localWorkspaces) {
    const label = labels[ws.workspaceId];
    if (!label) continue;
    if (!(await isMirrored(ws.workspaceId))) continue;

    for (const remoteDevice of remoteDevices) {
      const remoteWs = (remoteDevice.workspaces || []).find((w) => w.label === label && w.mirror);
      if (!remoteWs) continue;

      const lastTs = await getLastAppliedTs(remoteDevice.deviceId, label);
      const { toOpen, toClose, newLastAppliedTs } = computeSyncActions(ws.tabs, remoteWs, lastTs);

      for (const url of toOpen) {
        await chrome.tabs.create({ url });
      }
      for (const url of toClose) {
        const [match] = await chrome.tabs.query({ url });
        if (match) await chrome.tabs.remove(match.id);
      }

      await setLastAppliedTs(remoteDevice.deviceId, label, newLastAppliedTs);
    }
  }
}
```

- [ ] **Step 5: Manual test with the fixture file**

Label a local workspace "Coding" (Task 5), check its "Mirror" checkbox (only appears once the fixture from Task 7 — also labeled "Coding" — exists in the sync folder). Edit `fixture-device.json`: set `"mirror": true` on its "Coding" workspace and add a second tab URL to its `tabs` array. From the service worker console, run `reconcileMirrors()` directly (or wait for the next alarm tick).

Expected: the new tab from the fixture opens locally. Remove that same URL from the fixture's `tabs` array, add a matching `recentEvents` entry `{"op": "close", "url": "<that url>", "ts": <a number larger than any previous ts in the fixture>}`, run `reconcileMirrors()` again — the tab closes locally. Add a tab URL to the fixture that's already open locally and confirm no duplicate tab opens.

- [ ] **Step 6: Commit**

```bash
git add lib/mirrorState.js sidepanel.js background.js
git commit -m "Wire live-mirror reconciliation using the merge function"
```

---

## Task 9: Error handling surfaces

**Files:**
- Modify: `sidepanel.html`
- Modify: `sidepanel.js`

**Interfaces:**
- Consumes: `verifyPermission`/`pickSyncFolder` (Task 3), `loadHandle`/`saveHandle` (Task 3).
- Produces: a banner in the sidepanel when the sync folder handle is missing or its permission has been revoked, with a "Reconnect" button that re-triggers the picker (this must live in the sidepanel, not background.js, since `requestPermission` needs a user gesture in a document context).

- [ ] **Step 1: Add a banner container to `sidepanel.html`** — insert right after `<h1>WorkspaceSync</h1>`:

```html
  <div id="folderBanner" style="display:none; background:#fff3cd; border:1px solid #ffe69c; padding:8px; border-radius:4px; margin-bottom:12px;"></div>
```

- [ ] **Step 2: Extend `sidepanel.js`**

```js
import { pickSyncFolder } from './lib/syncFolder.js';
import { saveHandle } from './lib/handleStore.js';

const folderBanner = document.getElementById('folderBanner');

async function renderFolderBanner() {
  const handle = await loadHandle();
  folderBanner.style.display = 'none';
  folderBanner.innerHTML = '';

  if (!handle) {
    folderBanner.textContent = 'No sync folder configured yet — set one up in Options.';
    folderBanner.style.display = 'block';
    return;
  }

  if (!(await verifyPermission(handle, false))) {
    folderBanner.textContent = 'Sync folder permission was lost. ';
    const btn = document.createElement('button');
    btn.textContent = 'Reconnect';
    btn.addEventListener('click', async () => {
      const newHandle = await pickSyncFolder();
      await saveHandle(newHandle);
      await renderFolderBanner();
      await renderRemoteDevices();
    });
    folderBanner.append(btn);
    folderBanner.style.display = 'block';
  }
}

renderFolderBanner();
setInterval(renderFolderBanner, 15000);
```

- [ ] **Step 3: Manual test**

With a sync folder already connected, revoke its permission (Vivaldi: `vivaldi://settings/content/all` → find the folder's site-adjacent File System entry and remove it, or simpler — delete and recreate the IndexedDB entry by running `indexedDB.deleteDatabase('workspacesync')` in the sidepanel's devtools console, then reload the sidepanel). Expected: banner appears with a working "Reconnect" button; clicking it re-picks the folder and the banner disappears once granted.

Separately, delete the fixture's `.json` extension and rename it to `.fixture-device.json.icloud` to simulate an undownloaded iCloud placeholder; confirm the "Other devices" list shows "fixture-device: syncing…" (from Task 7's `pending` handling) instead of silently showing nothing.

- [ ] **Step 4: Commit**

```bash
git add sidepanel.html sidepanel.js
git commit -m "Surface sync folder permission and iCloud placeholder states"
```

---

## Task 10: Layer 2 — Custom UI Modification bridge (optional, isolated)

**Files:**
- Create: `uimod/workspacesync-uimod.js`
- Modify: `manifest.json`
- Modify: `background.js`
- Modify: `sidepanel.js`

**Interfaces:**
- Consumes: nothing from earlier tasks except the pinned extension ID (Task 1).
- Produces: `background.js` gains an `externally_connectable` message listener that stores `{ workspaceId: string, name: string }` pairs (keyed by normalized `workspaceId`) under `chrome.storage.local` key `suggestedNames`. `sidepanel.js`'s label input (Task 5) pre-fills from `suggestedNames` when a workspace has no label yet, instead of leaving it blank.

- [ ] **Step 1: Add `externally_connectable` to `manifest.json`** — add this top-level key:

```json
  "externally_connectable": {
    "matches": ["chrome://vivaldi-webui/*"]
  }
```

(This is the one unverified assumption in the whole spec — Vivaldi's own UI origin. If registering the UI mod and reloading doesn't result in `chrome.runtime.onMessageExternal` firing in the background service worker console, open the UI mod's own console — Vivaldi's browser UI is inspectable via `vivaldi://inspect/#apps` or by right-clicking the browser chrome with `--enable-features` devtools flags — and check `location.origin` there, then update this `matches` pattern to the real value. Everything built in Tasks 1-9 works with zero changes if this never gets resolved.)

- [ ] **Step 2: Write `uimod/workspacesync-uimod.js`**

```js
'use strict';

(function () {
  const EXTENSION_ID = 'cmjniggmemdcamengapegfpfhdinbejo';

  async function relayWorkspaceNames() {
    if (!window.vivaldi?.prefs?.get) return;
    try {
      const list = await window.vivaldi.prefs.get('vivaldi.workspaces.list');
      if (!Array.isArray(list)) return;
      const names = list.map((w) => ({
        workspaceId: String(Math.round(Number(w.id))),
        name: w.name
      }));
      chrome.runtime.sendMessage(EXTENSION_ID, { type: 'workspaceNames', names });
    } catch (err) {
      console.warn('[WorkspaceSync UI mod] could not read workspace list', err);
    }
  }

  relayWorkspaceNames();
  setInterval(relayWorkspaceNames, 30000);
})();
```

- [ ] **Step 3: Add the message listener to `background.js`**

```js
chrome.runtime.onMessageExternal.addListener((message) => {
  if (message?.type !== 'workspaceNames' || !Array.isArray(message.names)) return;
  chrome.storage.local.get('suggestedNames').then(({ suggestedNames }) => {
    const updated = { ...(suggestedNames || {}) };
    for (const { workspaceId, name } of message.names) {
      if (name) updated[workspaceId] = name;
    }
    chrome.storage.local.set({ suggestedNames: updated });
  });
});
```

- [ ] **Step 4: Pre-fill labels from suggested names in `sidepanel.js`** — in `renderLocalWorkspaces`, change how `input.value` is set:

```js
    const { suggestedNames } = await chrome.storage.local.get('suggestedNames');
    input.value = currentLabel || (suggestedNames || {})[ws.workspaceId] || '';
```

(and if that pre-filled value differs from `currentLabel`, it's still just sitting in the input — the user still has to hit "change"/blur to actually save it as a real label, so nothing gets auto-committed without a look.)

- [ ] **Step 5: Manual test — register the UI mod**

In Vivaldi: Settings → Appearance → Custom UI Modifications → point the JS field at `uimod/workspacesync-uimod.js`'s absolute path on disk → restart Vivaldi.

Expected: within 30 seconds, unlabeled workspaces in the sidepanel show the real Vivaldi workspace name pre-filled in the input (still requires hitting enter/blur to save as the actual sync label). Un-register the UI mod, restart Vivaldi again, and confirm the sidepanel still works exactly as it did in Task 9 — labels just go back to blank-until-typed, nothing else breaks.

- [ ] **Step 6: Commit**

```bash
git add uimod/workspacesync-uimod.js manifest.json background.js sidepanel.js
git commit -m "Add optional Layer 2 UI modification bridge for real workspace names"
```

---

## Spec coverage check

- Problem statement / native-sync gap → addressed by the whole plan; not a separate task.
- Layer 1 vs Layer 2 split → Tasks 1-9 (Layer 1, fully standalone) vs Task 10 (Layer 2, isolated, degrades cleanly).
- Data model (`<deviceId>.json`, `recentEvents` cap 50) → Task 4 (`writeSnapshot`), Task 8 Step 3 (open/close event diffing, `.slice(-50)`).
- Workspace identity & labeling → Task 2 (`normalizeWorkspaceId`), Task 5 (label UI), Task 10 (name suggestions).
- Browse & pick sidepanel → Task 7.
- Live mirror (both-sides toggle, 1-minute alarm, event-log replay, URL dedup) → Task 8, dedup specifically covered by Task 6's tests and Task 8 Step 5's manual verification.
- Setup UX (folder picker, device name, UI mod instructions) → Task 3 (folder/device name), Task 10 Step 5 (UI mod instructions).
- Error handling (iCloud placeholders, lost permission, missing Layer 2) → Task 7 (`pending`), Task 9 (permission banner), Task 10 (degrades cleanly, tested explicitly).
- Testing (assert-based merge test) → Task 6.
- Out of scope items (native workspace creation, >2-device CRDT, store distribution) → not built anywhere in this plan, consistent with the spec.
