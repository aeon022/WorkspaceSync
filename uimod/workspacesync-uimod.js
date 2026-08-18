'use strict';

// Confirmed by direct testing: a tab's Vivaldi workspace membership
// (vivExtData.workspaceId) is only readable from this privileged UI
// context, never from a standard extension. Also confirmed: getting that
// data OUT to the extension via chrome.runtime.sendMessage does not work
// here even with externally_connectable wide open ("Could not establish
// connection. Receiving end does not exist.") - Vivaldi's own UI is very
// likely a Chromium "component extension", and component-to-extension
// messaging appears to be blocked regardless of manifest config.
//
// So this writes the tab-to-workspace snapshot directly into the same
// sync folder the extension already has File System Access permission
// for, as its own file - the extension just reads it like any other file
// in that folder. This context needs its OWN one-time folder grant
// (permissions are per-origin, chrome-extension://<this context's id> is a
// different origin than the actual extension), done via the button below.
//
// The filename embeds a random id generated once and kept in this same
// IndexedDB, alongside the folder handle - confirmed by direct testing: two
// machines pointed at the same Dropbox-synced folder previously both wrote
// the literal name "_layer2.json", so whichever device's write synced down
// last silently became "this device's own tabs" on the OTHER device too
// (the extension had no way to tell the file wasn't its own). A unique
// filename per install stops the overwrite; lib/workspace.js additionally
// never trusts a snapshot's contents wholesale for exactly this reason -
// see its own comment.
(function () {
  const DB_NAME = 'workspacesync-layer2';
  const STORE = 'handles';
  const KEY = 'folder';
  const ID_KEY = 'layer2Id';
  const OLD_FILE_NAME = '_layer2.json';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveHandle(handle) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadHandle() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  // Minted once per install, reused forever after - this is what makes the
  // filename stable across restarts instead of a fresh name (and a fresh
  // orphaned file) every time this script runs.
  async function getOrCreateLayer2Id() {
    const db = await openDb();
    const existing = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(ID_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (existing) return existing;

    const id = crypto.randomUUID().slice(0, 8);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(id, ID_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return id;
  }

  async function verifyPermission(handle, requestIfNeeded) {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (!requestIfNeeded) return false;
    return (await handle.requestPermission(opts)) === 'granted';
  }

  function parseVivExtData(tab) {
    if (!tab.vivExtData) return {};
    try {
      return JSON.parse(tab.vivExtData);
    } catch {
      return {};
    }
  }

  function normalizeWorkspaceId(raw) {
    if (raw === undefined || raw === null) return 'default';
    const n = Math.round(Number(raw));
    if (Number.isNaN(n)) return 'default';
    return String(n);
  }

  function queryAllTabs() {
    return new Promise((resolve) => chrome.tabs.query({}, resolve));
  }

  let folderHandle = null;

  const btn = document.createElement('button');
  btn.style.position = 'fixed';
  btn.style.bottom = '12px';
  btn.style.right = '12px';
  btn.style.zIndex = '999999';
  btn.style.padding = '6px 10px';
  btn.style.fontSize = '11px';
  btn.style.cursor = 'pointer';
  btn.style.transition = 'opacity 0.6s ease';
  document.body.appendChild(btn);

  // Success (✅) is transient: pop up to confirm, then fade out — this
  // button lives fixed in Vivaldi's own browser chrome, not a page or the
  // extension panel, so leaving it up forever after every 30s sync pulse
  // would mean a permanent "UU" (the synced folder's name) stuck in the
  // corner. Error/reconnect states (🔴/🟡) stay visible and clickable
  // since those need the user to act.
  let hideTimer = null;
  function setStatus(text, autoHide) {
    btn.textContent = text;
    clearTimeout(hideTimer);
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    if (autoHide) {
      hideTimer = setTimeout(() => {
        btn.style.opacity = '0';
        btn.style.pointerEvents = 'none';
      }, 2000);
    }
  }

  async function pickFolder() {
    try {
      const handle = await window.showDirectoryPicker({ id: 'workspacesync-layer2', mode: 'readwrite' });
      await saveHandle(handle);
      folderHandle = handle;
      setStatus(`✅ WorkspaceSync: ${handle.name}`, true);
      await writeSnapshot();
    } catch (err) {
      console.warn('[WorkspaceSync UI mod] folder pick failed', err);
      setStatus('🔴 WorkspaceSync: click to connect');
    }
  }

  btn.addEventListener('click', pickFolder);

  async function writeSnapshot() {
    if (!folderHandle || !(await verifyPermission(folderHandle, false))) return;
    if (!window.vivaldi?.prefs?.get || !chrome?.tabs?.query) return;

    try {
      const [tabs, workspacesPref, layer2Id] = await Promise.all([
        queryAllTabs(),
        window.vivaldi.prefs.get('vivaldi.workspaces.list'),
        getOrCreateLayer2Id()
      ]);

      const workspaceNames = {};
      for (const ws of workspacesPref?.value || []) {
        workspaceNames[normalizeWorkspaceId(ws.id)] = ws.name;
      }

      const mappedTabs = tabs.map((tab) => ({
        id: tab.id,
        url: tab.url,
        title: tab.title || tab.url,
        pinned: !!tab.pinned,
        favIconUrl: tab.favIconUrl || '',
        index: tab.index,
        workspaceId: normalizeWorkspaceId(parseVivExtData(tab).workspaceId)
      }));

      const fileHandle = await folderHandle.getFileHandle(`_layer2-${layer2Id}.json`, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify({ updatedAt: Date.now(), tabs: mappedTabs, workspaceNames }, null, 2));
      await writable.close();

      // One-time cleanup: the old shared filename, if a previous version of
      // this script left one behind, no longer gets written to and would
      // otherwise sit there as stale, misleading data indefinitely.
      try {
        await folderHandle.removeEntry(OLD_FILE_NAME);
      } catch {
        // already gone, or never existed - fine either way
      }

      setStatus(`✅ WorkspaceSync: ${folderHandle.name}`, true);
    } catch (err) {
      console.warn('[WorkspaceSync UI mod] failed to write snapshot', err);
    }
  }

  async function init() {
    const handle = await loadHandle();
    if (!handle) {
      setStatus('🔴 WorkspaceSync: click to connect');
      return;
    }
    folderHandle = handle;
    if (await verifyPermission(handle, false)) {
      setStatus(`✅ WorkspaceSync: ${handle.name}`, true);
      await writeSnapshot();
    } else {
      setStatus('🟡 WorkspaceSync: click to reconnect');
    }
  }

  init();
  setInterval(writeSnapshot, 30000);
})();
