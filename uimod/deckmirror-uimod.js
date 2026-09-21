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
  const EXTENSION_ID = 'cmjniggmemdcamengapegfpfhdinbejo';

  let extensionEnabled = true;
  let writeTimeout = null;

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
      return typeof tab.vivExtData === 'string' ? JSON.parse(tab.vivExtData) : tab.vivExtData;
    } catch {
      return {};
    }
  }

  function normalizeWorkspaceId(raw) {
    if (raw === undefined || raw === null || raw === '' || raw === 0 || raw === '0') return 'default';
    return String(raw);
  }

  function queryAllTabs() {
    return new Promise((resolve) => chrome.tabs.query({}, resolve));
  }

  function checkExtensionEnabled() {
    if (!chrome?.management?.get) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      try {
        chrome.management.get(EXTENSION_ID, (info) => {
          if (!chrome.runtime?.lastError && info) {
            resolve(!!info.enabled);
            return;
          }
          if (chrome.management.getAll) {
            chrome.management.getAll((all) => {
              if (chrome.runtime?.lastError || !all) {
                resolve(true); // Don't block if query fails
                return;
              }
              const ext = all.find((e) => e.id === EXTENSION_ID || e.name === 'DeckMirror' || e.name === 'WorkspaceSync');
              if (ext) {
                resolve(!!ext.enabled);
              } else {
                resolve(true);
              }
            });
          } else {
            resolve(true);
          }
        });
      } catch {
        resolve(true);
      }
    });
  }

  let folderHandle = null;

  const btn = document.createElement('button');
  btn.style.position = 'fixed';
  btn.style.bottom = '16px';
  btn.style.right = '16px';
  btn.style.zIndex = '9999999';
  btn.style.padding = '6px 12px';
  btn.style.fontSize = '11px';
  btn.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  btn.style.fontWeight = '600';
  btn.style.background = '#0F1118';
  btn.style.color = '#F1F5F9';
  btn.style.border = '1px solid #34D399';
  btn.style.borderRadius = '8px';
  btn.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.6), 0 0 10px rgba(52, 211, 153, 0.2)';
  btn.style.cursor = 'pointer';
  btn.style.transition = 'all 0.3s ease';
  btn.style.display = 'none';
  document.body.appendChild(btn);

  let hideTimer = null;
  function setStatus(text, autoHide) {
    if (!extensionEnabled) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = '';
    btn.textContent = text;
    clearTimeout(hideTimer);
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    if (autoHide) {
      hideTimer = setTimeout(() => {
        btn.style.opacity = '0';
        btn.style.pointerEvents = 'none';
      }, 2500);
    }
  }

  async function pickFolder() {
    try {
      const handle = await window.showDirectoryPicker({ id: 'workspacesync-layer2', mode: 'readwrite' });
      await saveHandle(handle);
      folderHandle = handle;
      setStatus(`✅ DeckMirror: ${handle.name}`, true);
      await writeSnapshot();
    } catch (err) {
      console.warn('[DeckMirror UI mod] folder pick failed', err);
      setStatus('🔴 DeckMirror: Klicke um Sync-Ordner zu verbinden');
    }
  }

  btn.addEventListener('click', pickFolder);

  async function writeSnapshot() {
    if (!extensionEnabled) return;
    if (!folderHandle || !(await verifyPermission(folderHandle, false))) return;
    if (!chrome?.tabs?.query) return;

    try {
      const [tabs, workspacesPref, layer2Id] = await Promise.all([
        queryAllTabs(),
        window.vivaldi?.prefs?.get ? window.vivaldi.prefs.get('vivaldi.workspaces.list') : Promise.resolve({ value: [] }),
        getOrCreateLayer2Id()
      ]);

      const workspaceNames = {};
      for (const ws of workspacesPref?.value || []) {
        workspaceNames[normalizeWorkspaceId(ws.id)] = ws.name;
      }

      const mappedTabs = tabs.map((tab) => {
        const ext = parseVivExtData(tab);
        return {
          id: tab.id,
          url: tab.url,
          title: tab.title || tab.url,
          pinned: !!tab.pinned,
          favIconUrl: tab.favIconUrl || '',
          index: tab.index,
          workspaceId: normalizeWorkspaceId(ext.workspaceId)
        };
      });

      const fileHandle = await folderHandle.getFileHandle(`_layer2-${layer2Id}.json`, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify({ updatedAt: Date.now(), tabs: mappedTabs, workspaceNames }, null, 2));
      await writable.close();

      try {
        await folderHandle.removeEntry(OLD_FILE_NAME);
      } catch {
        // Ignored
      }

      setStatus(`✅ DeckMirror: ${folderHandle.name}`, true);
    } catch (err) {
      console.warn('[DeckMirror UI mod] failed to write snapshot', err);
    }
  }

  function scheduleWriteSnapshot(delayMs = 1000) {
    if (!extensionEnabled) return;
    clearTimeout(writeTimeout);
    writeTimeout = setTimeout(() => {
      writeSnapshot().catch((err) => console.warn('[DeckMirror UI mod] snapshot failed:', err));
    }, delayMs);
  }

  async function updateEnabledState(enabled) {
    extensionEnabled = enabled;
    if (!extensionEnabled) {
      btn.style.display = 'none';
    } else {
      btn.style.display = '';
      await init();
    }
  }

  async function init() {
    extensionEnabled = await checkExtensionEnabled();
    if (!extensionEnabled) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = '';

    const handle = await loadHandle();
    if (!handle) {
      setStatus('🔴 DeckMirror: Klicke um Sync-Ordner zu verbinden');
      return;
    }
    folderHandle = handle;
    if (await verifyPermission(handle, false)) {
      setStatus(`✅ DeckMirror: ${handle.name}`, true);
      await writeSnapshot();
    } else {
      setStatus('🟡 DeckMirror: Klicke um Berechtigung zu erneuern');
    }
  }

  // Management listeners
  if (chrome?.management?.onEnabled) {
    chrome.management.onEnabled.addListener((info) => {
      if (info.id === EXTENSION_ID || info.name === 'DeckMirror' || info.name === 'WorkspaceSync') {
        updateEnabledState(true);
      }
    });
  }

  if (chrome?.management?.onDisabled) {
    chrome.management.onDisabled.addListener((info) => {
      if (info.id === EXTENSION_ID || info.name === 'DeckMirror' || info.name === 'WorkspaceSync') {
        updateEnabledState(false);
      }
    });
  }

  if (chrome?.management?.onUninstalled) {
    chrome.management.onUninstalled.addListener((id) => {
      if (id === EXTENSION_ID) {
        updateEnabledState(false);
      }
    });
  }

  if (chrome?.management?.onInstalled) {
    chrome.management.onInstalled.addListener((info) => {
      if (info.id === EXTENSION_ID || info.name === 'DeckMirror' || info.name === 'WorkspaceSync') {
        updateEnabledState(!!info.enabled);
      }
    });
  }

  // Real-time tab events in Vivaldi UI
  if (chrome?.tabs) {
    chrome.tabs.onCreated?.addListener(() => scheduleWriteSnapshot(1000));
    chrome.tabs.onRemoved?.addListener(() => scheduleWriteSnapshot(800));
    chrome.tabs.onActivated?.addListener(() => scheduleWriteSnapshot(1000));
    chrome.tabs.onMoved?.addListener(() => scheduleWriteSnapshot(1000));
    chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'complete' || changeInfo.url) {
        scheduleWriteSnapshot(1200);
      }
    });
  }

  init();

  // Periodic heartbeat
  setInterval(async () => {
    const enabled = await checkExtensionEnabled();
    if (enabled !== extensionEnabled) {
      await updateEnabledState(enabled);
    } else if (extensionEnabled) {
      await writeSnapshot();
    }
  }, 30000);
})();
