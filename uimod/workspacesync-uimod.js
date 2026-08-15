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
