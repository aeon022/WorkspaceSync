'use strict';

// Confirmed by direct testing (not just undocumented forum claims): a tab's
// Vivaldi workspace membership (vivExtData.workspaceId) is only readable
// from Vivaldi's own privileged UI context - never from a standard
// extension's chrome.tabs.query, which always reports vivExtData as
// undefined. This script runs IN that privileged context (registered via
// Vivaldi Settings -> Appearance -> Custom UI Modifications) and is the
// only source of tab-to-workspace mapping the extension has. Without it
// registered, the extension falls back to one undifferentiated 'default'
// workspace bucket (see lib/workspace.js).
(function () {
  const EXTENSION_ID = 'cmjniggmemdcamengapegfpfhdinbejo';

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

  async function relayTabSnapshot() {
    if (!window.vivaldi?.prefs?.get || !chrome?.tabs?.query) return;
    try {
      const [tabs, workspacesPref] = await Promise.all([
        queryAllTabs(),
        window.vivaldi.prefs.get('vivaldi.workspaces.list')
      ]);

      // vivaldi.prefs.get resolves to {defaultValue, store, value} - the
      // workspace list itself is in .value, not the top-level result.
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

      chrome.runtime.sendMessage(EXTENSION_ID, {
        type: 'tabSnapshot',
        tabs: mappedTabs,
        workspaceNames
      });
    } catch (err) {
      console.warn('[WorkspaceSync UI mod] failed to relay tab snapshot', err);
    }
  }

  relayTabSnapshot();
  setInterval(relayTabSnapshot, 30000);
})();
