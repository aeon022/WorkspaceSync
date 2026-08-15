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
