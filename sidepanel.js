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

const syncNowBtn = document.getElementById('syncNowBtn');
const syncIcon = document.getElementById('syncIcon');

async function triggerManualSync() {
  if (!syncNowBtn) return;
  syncNowBtn.disabled = true;
  syncIcon?.classList.add('sync-spin');

  try {
    await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
  } catch (err) {
    console.warn('[DeckMirror] manual sync error:', err);
  } finally {
    setTimeout(async () => {
      syncIcon?.classList.remove('sync-spin');
      syncNowBtn.disabled = false;
      await renderLocalWorkspaces();
      await renderRemoteDevices();
      await renderFolderBanner();
    }, 600);
  }
}

if (syncNowBtn) {
  syncNowBtn.addEventListener('click', triggerManualSync);
}

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
    note.textContent = 'Workspace detection needs setup — see Options. Until then, tabs appear in one group.';
    localList.append(note);
  }

  for (const ws of workspaces) {
    const card = document.createElement('div');
    card.className = 'ws-card';

    const header = document.createElement('div');
    header.className = 'ws-card-header';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'ws-color';
    const currentColor = colors[ws.workspaceId] || '';
    colorPicker.value = currentColor || '#cccccc';
    colorPicker.title = currentColor ? 'Workspace color' : 'Set a workspace color';
    colorPicker.addEventListener('change', async () => {
      await setColor(ws.workspaceId, colorPicker.value);
      chrome.runtime.sendMessage({ type: 'SYNC_NOW' }).catch(() => {});
      renderLocalWorkspaces();
    });

    const isDefault = ws.workspaceId === 'default';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ws-name';
    input.placeholder = isDefault ? 'Not in a Vivaldi workspace…' : 'Name this workspace…';
    const currentLabel = labels[ws.workspaceId] || '';
    const effectiveLabel = currentLabel || suggestedNames[ws.workspaceId] || '';
    input.value = effectiveLabel;
    input.addEventListener('change', async () => {
      await setLabel(ws.workspaceId, input.value.trim());
      chrome.runtime.sendMessage({ type: 'SYNC_NOW' }).catch(() => {});
      renderLocalWorkspaces();
    });

    header.append(colorPicker, input);
    card.append(header);

    const footer = document.createElement('div');
    footer.className = 'ws-card-footer';

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${ws.tabs.length} tab${ws.tabs.length === 1 ? '' : 's'}`;
    footer.append(count);

    const syncLabel = document.createElement('label');
    syncLabel.className = 'ws-toggle';
    const syncCheckbox = document.createElement('input');
    syncCheckbox.type = 'checkbox';
    const isExcluded = !!excludedWorkspaces[ws.workspaceId];
    syncCheckbox.checked = !isExcluded;
    syncCheckbox.addEventListener('change', async () => {
      await setSyncExcluded(ws.workspaceId, !syncCheckbox.checked);
      chrome.runtime.sendMessage({ type: 'SYNC_NOW' }).catch(() => {});
      renderLocalWorkspaces();
    });
    syncLabel.append(syncCheckbox, ' Sync');
    footer.append(syncLabel);

    if (isExcluded) {
      const notSyncedNote = document.createElement('span');
      notSyncedNote.className = 'count';
      notSyncedNote.textContent = '(not synced)';
      footer.append(notSyncedNote);
    } else if (effectiveLabel && remoteLabels.has(effectiveLabel)) {
      const mirrorLabel = document.createElement('label');
      mirrorLabel.className = 'ws-toggle';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = await isMirrored(ws.workspaceId);
      checkbox.addEventListener('change', async () => {
        await setMirrored(ws.workspaceId, checkbox.checked);
        chrome.runtime.sendMessage({ type: 'SYNC_NOW' }).catch(() => {});
      });
      mirrorLabel.append(checkbox, ' Mirror');
      footer.append(mirrorLabel);
    }

    card.append(footer);

    if (isDefault) {
      const hint = document.createElement('div');
      hint.className = 'ws-hint';
      hint.textContent = 'Tabs Vivaldi doesn\'t assign to any workspace (extension panels, internal pages, etc.)';
      card.append(hint);
    }

    localList.append(card);
  }

  if (workspaces.length === 0) {
    localList.textContent = 'No open tabs found.';
  }
}

renderLocalWorkspaces();
chrome.tabs.onCreated.addListener(renderLocalWorkspaces);
chrome.tabs.onRemoved.addListener(renderLocalWorkspaces);

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
    p.className = 'pending-device';
    p.textContent = `${name}: syncing…`;
    remoteList.append(p);
  }

  for (const device of devices) {
    const deviceCard = document.createElement('div');
    deviceCard.className = 'device-card';

    const deviceHeader = document.createElement('div');
    deviceHeader.className = 'device-header';
    const deviceNameSpan = document.createElement('span');
    deviceNameSpan.textContent = device.deviceName || device.deviceId;
    const syncedSpan = document.createElement('span');
    syncedSpan.className = 'device-synced';
    syncedSpan.textContent = device.updatedAt ? `· ${formatRelativeSync(device.updatedAt)}` : '';
    deviceHeader.append(deviceNameSpan, syncedSpan);
    deviceCard.append(deviceHeader);

    for (const ws of device.workspaces || []) {
      const wsBlock = document.createElement('div');
      wsBlock.className = 'device-ws';

      const wsHeader = document.createElement('div');
      wsHeader.className = 'device-ws-header';

      if (ws.color) {
        const dot = document.createElement('span');
        dot.className = 'ws-dot';
        dot.style.background = ws.color;
        wsHeader.append(dot);
      }

      const labelSpan = document.createElement('span');
      labelSpan.textContent = ws.label || '(unlabeled)';
      wsHeader.append(labelSpan);

      const openAllBtn = document.createElement('button');
      openAllBtn.className = 'btn-open-all';
      openAllBtn.textContent = `Open all (${(ws.tabs || []).length})`;
      openAllBtn.addEventListener('click', () => {
        chrome.windows.create({ url: (ws.tabs || []).map((t) => t.url) });
      });
      wsHeader.append(openAllBtn);

      wsBlock.append(wsHeader);

      const tabsBox = document.createElement('div');
      tabsBox.className = 'device-ws-tabs';
      for (const tab of ws.tabs || []) {
        const tabRow = document.createElement('div');
        tabRow.className = 'tab-link';
        tabRow.title = tab.title || tab.url;
        tabRow.textContent = tab.title || tab.url;
        tabRow.addEventListener('click', () => {
          chrome.tabs.create({ url: tab.url });
        });
        tabsBox.append(tabRow);
      }
      wsBlock.append(tabsBox);

      deviceCard.append(wsBlock);
    }

    remoteList.append(deviceCard);
  }

  if (devices.length === 0 && pending.length === 0) {
    remoteList.textContent = 'No other devices found in the sync folder yet.';
  }
}

renderRemoteDevices();
setInterval(renderRemoteDevices, 10000);

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
    btn.textContent = 'Reconnect in Options';
    btn.addEventListener('click', () => chrome.runtime.openOptionsPage());
    folderBanner.append(btn);
    folderBanner.style.display = 'block';
  }
}

renderFolderBanner();
setInterval(renderFolderBanner, 10000);
