'use strict';

import { getLocalWorkspaces } from './lib/workspace.js';
import { getLabels, setLabel } from './lib/labels.js';
import { isMirrored, setMirrored } from './lib/mirrorState.js';
import { getOrCreateDevice } from './lib/device.js';
import { loadHandle, saveHandle } from './lib/handleStore.js';
import { verifyPermission, scanSyncFolder, pickSyncFolder } from './lib/syncFolder.js';

const localList = document.getElementById('localWorkspaces');

async function collectRemoteLabels() {
  const handle = await loadHandle();
  if (!handle || !(await verifyPermission(handle, false))) return new Set();
  const { devices } = await scanSyncFolder(handle, (await getOrCreateDevice()).id);
  const labels = new Set();
  for (const device of devices) {
    for (const ws of device.workspaces || []) {
      if (ws.label) labels.add(ws.label);
    }
  }
  return labels;
}

async function renderLocalWorkspaces() {
  const [workspaces, labels, remoteLabels, suggestedNamesResult] = await Promise.all([
    getLocalWorkspaces(),
    getLabels(),
    collectRemoteLabels(),
    chrome.storage.local.get('suggestedNames')
  ]);
  const suggestedNames = suggestedNamesResult.suggestedNames || {};
  localList.innerHTML = '';

  for (const ws of workspaces) {
    const row = document.createElement('div');
    row.className = 'ws-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Name this workspace…';
    const currentLabel = labels[ws.workspaceId] || '';
    input.value = currentLabel || suggestedNames[ws.workspaceId] || '';

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

renderLocalWorkspaces();
chrome.tabs.onCreated.addListener(renderLocalWorkspaces);
chrome.tabs.onRemoved.addListener(renderLocalWorkspaces);
// Deliberately no chrome.tabs.onUpdated listener here: it fires many times
// per page load for every tab (status/title/favicon), and renderLocalWorkspaces
// does a full sync-folder disk scan plus a DOM rebuild — that would wipe the
// label input's focus while the user is typing, on any background tab load.
// onCreated/onRemoved cover the thing that actually matters (workspace tab
// counts), and the 15s polling below covers eventual title/favicon drift.

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

  const { devices, pending } = await scanSyncFolder(handle, (await getOrCreateDevice()).id);
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
      openAllBtn.textContent = `Open all (${(ws.tabs || []).length})`;
      openAllBtn.addEventListener('click', () => {
        chrome.windows.create({ url: (ws.tabs || []).map((t) => t.url) });
      });

      wsHeader.textContent = `${label} `;
      wsHeader.append(openAllBtn);
      remoteList.append(wsHeader);

      for (const tab of ws.tabs || []) {
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

renderRemoteDevices();
setInterval(renderRemoteDevices, 15000);

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
      // Re-granting permission on the already-saved handle is a single
      // click; only fall back to a full new folder picker if that fails.
      if (await verifyPermission(handle, true)) {
        await renderFolderBanner();
        await renderRemoteDevices();
        return;
      }
      let newHandle;
      try {
        newHandle = await pickSyncFolder();
      } catch (err) {
        if (err?.name === 'AbortError') return; // user cancelled the picker
        throw err;
      }
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
