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
