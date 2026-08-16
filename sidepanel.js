'use strict';

import { getLocalWorkspaces, isLayer2Active, getLayer2WorkspaceNames } from './lib/workspace.js';
import { getLabels, setLabel } from './lib/labels.js';
import { isMirrored, setMirrored } from './lib/mirrorState.js';
import { getExcludedWorkspaces, setSyncExcluded } from './lib/syncFlags.js';
import { getColors, setColor } from './lib/workspaceColors.js';
import { getOrCreateDevice } from './lib/device.js';
import { loadHandle } from './lib/handleStore.js';
import { verifyPermission, scanSyncFolder } from './lib/syncFolder.js';

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function formatRelativeSync(isoString) {
  if (!isoString) return '';
  const diffMin = Math.round((new Date(isoString).getTime() - Date.now()) / 60000);
  if (Math.abs(diffMin) < 1) return 'just now';
  if (Math.abs(diffMin) < 60) return relativeTimeFormatter.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return relativeTimeFormatter.format(diffHour, 'hour');
  return relativeTimeFormatter.format(Math.round(diffHour / 24), 'day');
}

document.getElementById('optionsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

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
  const [workspaces, labels, remoteLabels, suggestedNames, excludedWorkspaces, colors, layer2Active] = await Promise.all([
    getLocalWorkspaces(),
    getLabels(),
    collectRemoteLabels(),
    getLayer2WorkspaceNames(),
    getExcludedWorkspaces(),
    getColors(),
    isLayer2Active()
  ]);
  localList.innerHTML = '';

  if (!layer2Active) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.style.fontSize = '11px';
    note.style.margin = '0 0 8px';
    note.textContent = 'Workspace detection needs setup — see Options. Until then, every tab shows up as one workspace.';
    localList.append(note);
  }

  for (const ws of workspaces) {
    const row = document.createElement('div');
    row.className = 'ws-row';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.style.width = '20px';
    colorPicker.style.height = '20px';
    colorPicker.style.padding = '0';
    colorPicker.style.border = 'none';
    const currentColor = colors[ws.workspaceId] || '';
    colorPicker.value = currentColor || '#cccccc';
    colorPicker.title = currentColor ? 'Workspace color' : 'Set a workspace color';
    colorPicker.addEventListener('change', async () => {
      await setColor(ws.workspaceId, colorPicker.value);
      renderLocalWorkspaces();
    });

    const isDefault = ws.workspaceId === 'default';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = isDefault ? 'Not in a Vivaldi workspace…' : 'Name this workspace…';
    const currentLabel = labels[ws.workspaceId] || '';
    input.value = currentLabel || suggestedNames[ws.workspaceId] || '';

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${ws.tabs.length} tab${ws.tabs.length === 1 ? '' : 's'}`;

    input.addEventListener('change', async () => {
      await setLabel(ws.workspaceId, input.value.trim());
      renderLocalWorkspaces();
    });

    row.append(colorPicker, input, count);

    const isExcluded = !!excludedWorkspaces[ws.workspaceId];

    const syncLabel = document.createElement('label');
    const syncCheckbox = document.createElement('input');
    syncCheckbox.type = 'checkbox';
    syncCheckbox.checked = !isExcluded;
    syncCheckbox.addEventListener('change', async () => {
      await setSyncExcluded(ws.workspaceId, !syncCheckbox.checked);
      renderLocalWorkspaces();
    });
    syncLabel.append(syncCheckbox, ' Sync');
    row.append(syncLabel);

    if (isExcluded) {
      const notSyncedNote = document.createElement('span');
      notSyncedNote.className = 'count';
      notSyncedNote.textContent = '(not synced)';
      row.append(notSyncedNote);
    } else if (currentLabel && remoteLabels.has(currentLabel)) {
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

    if (isDefault) {
      const hint = document.createElement('div');
      hint.className = 'muted';
      hint.style.fontSize = '10px';
      hint.style.margin = '0 0 8px';
      hint.textContent = 'Tabs Vivaldi doesn\'t assign to any workspace (extension panels, internal pages, etc.)';
      localList.append(hint);
    }
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
    deviceHeader.style.fontWeight = '600';
    deviceHeader.style.marginTop = '8px';
    const deviceNameSpan = document.createElement('span');
    deviceNameSpan.textContent = device.deviceName || device.deviceId;
    const syncedSpan = document.createElement('span');
    syncedSpan.className = 'muted';
    syncedSpan.style.fontWeight = 'normal';
    syncedSpan.style.fontSize = '11px';
    syncedSpan.textContent = device.updatedAt ? ` · ${formatRelativeSync(device.updatedAt)}` : '';
    deviceHeader.append(deviceNameSpan, syncedSpan);
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

      if (ws.color) {
        const dot = document.createElement('span');
        dot.style.display = 'inline-block';
        dot.style.width = '8px';
        dot.style.height = '8px';
        dot.style.borderRadius = '50%';
        dot.style.marginRight = '4px';
        dot.style.border = '1px solid var(--border)';
        dot.style.background = ws.color;
        wsHeader.append(dot);
      }
      wsHeader.append(`${label} `, openAllBtn);
      remoteList.append(wsHeader);

      for (const tab of ws.tabs || []) {
        const tabRow = document.createElement('div');
        tabRow.className = 'tab-link';
        tabRow.style.marginLeft = '16px';
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
    // The side panel can't reliably show native permission/picker dialogs
    // (confirmed by testing - clicking a requestPermission()/
    // showDirectoryPicker() trigger here does nothing visible, while the
    // identical call from the Options tab works). Route to Options instead
    // of attempting it here.
    folderBanner.textContent = 'Sync folder permission was lost. ';
    const btn = document.createElement('button');
    btn.textContent = 'Reconnect in Options';
    btn.addEventListener('click', () => chrome.runtime.openOptionsPage());
    folderBanner.append(btn);
    folderBanner.style.display = 'block';
  }
}

renderFolderBanner();
setInterval(renderFolderBanner, 15000);
