'use strict';

import { getLocalWorkspaces, isLayer2Active, getLayer2WorkspaceNames } from './lib/workspace.js';
import { getLabels, setLabel } from './lib/labels.js';
import { isMirrored, setMirrored } from './lib/mirrorState.js';
import { getExcludedWorkspaces, setSyncExcluded } from './lib/syncFlags.js';
import { getColors, setColor } from './lib/workspaceColors.js';
import { getOrCreateDevice } from './lib/device.js';
import { loadHandle } from './lib/handleStore.js';
import { verifyPermission, scanSyncFolder, deleteDeviceFile } from './lib/syncFolder.js';

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

function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

document.getElementById('optionsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

const syncNowBtn = document.getElementById('syncNowBtn');
const syncIcon = document.getElementById('syncIcon');
const searchInput = document.getElementById('tabSearchInput');
const searchClearBtn = document.getElementById('searchClearBtn');
const localTabTotal = document.getElementById('localTabTotal');
const remoteDeviceCount = document.getElementById('remoteDeviceCount');

let searchQuery = '';
const collapsedWorkspaces = new Set();
let lastRemoteStateKey = '';
let lastLocalStateKey = '';

if (searchInput) {
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    searchClearBtn.style.display = searchQuery ? 'block' : 'none';
    lastRemoteStateKey = '';
    lastLocalStateKey = '';
    renderLocalWorkspaces();
    renderRemoteDevices();
  });
}

if (searchClearBtn) {
  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClearBtn.style.display = 'none';
    lastRemoteStateKey = '';
    lastLocalStateKey = '';
    renderLocalWorkspaces();
    renderRemoteDevices();
    searchInput.focus();
  });
}

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
      lastRemoteStateKey = '';
      lastLocalStateKey = '';
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

  let totalTabs = 0;
  for (const ws of workspaces) {
    totalTabs += ws.tabs.length;
  }
  if (localTabTotal) localTabTotal.textContent = `${totalTabs} tab${totalTabs === 1 ? '' : 's'}`;

  const stateKey = JSON.stringify({ workspaces, labels, excludedWorkspaces, colors, layer2Active, searchQuery });
  if (stateKey === lastLocalStateKey) return;
  lastLocalStateKey = stateKey;

  localList.innerHTML = '';

  if (!layer2Active) {
    const note = document.createElement('div');
    note.className = 'empty-state';
    note.style.border = '1px dashed rgba(52, 211, 153, 0.3)';
    note.style.background = 'rgba(52, 211, 153, 0.04)';
    note.style.borderRadius = '6px';
    note.style.marginBottom = '8px';
    note.style.padding = '8px 10px';
    note.style.textAlign = 'left';
    note.innerHTML = '<div style="color:var(--accent); font-weight:600; margin-bottom:2px;">⚡ Workspace-Namen aktivieren:</div><div style="color:var(--fg-secondary); font-size:10px;">Klicke unten rechts in Vivaldi auf den 🔴 DeckMirror-Button und wähle den Sync-Ordner aus.</div>';
    localList.append(note);
  }

  let renderedCount = 0;

  for (const ws of workspaces) {
    const currentLabel = labels[ws.workspaceId] || '';
    const effectiveLabel = currentLabel || suggestedNames[ws.workspaceId] || '';
    const isDefault = ws.workspaceId === 'default';

    const matchesWorkspaceName = effectiveLabel.toLowerCase().includes(searchQuery);
    const matchingTabs = ws.tabs.filter((t) => {
      if (!searchQuery) return true;
      return (t.title && t.title.toLowerCase().includes(searchQuery)) ||
             (t.url && t.url.toLowerCase().includes(searchQuery));
    });

    if (searchQuery && !matchesWorkspaceName && matchingTabs.length === 0) {
      continue;
    }

    renderedCount++;
    const card = document.createElement('div');
    card.className = 'ws-card';

    const header = document.createElement('div');
    header.className = 'ws-card-header';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'ws-color';
    const currentColor = colors[ws.workspaceId] || '#34D399';
    colorPicker.value = currentColor;
    colorPicker.title = 'Workspace color';
    colorPicker.addEventListener('change', async () => {
      await setColor(ws.workspaceId, colorPicker.value);
      lastLocalStateKey = '';
      chrome.runtime.sendMessage({ type: 'SYNC_NOW' }).catch(() => {});
      renderLocalWorkspaces();
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ws-name';
    input.placeholder = isDefault ? 'Not in a Vivaldi workspace…' : 'Name this workspace…';
    input.value = effectiveLabel;
    input.addEventListener('change', async () => {
      await setLabel(ws.workspaceId, input.value.trim());
      lastLocalStateKey = '';
      chrome.runtime.sendMessage({ type: 'SYNC_NOW' }).catch(() => {});
      renderLocalWorkspaces();
    });

    header.append(colorPicker, input);
    card.append(header);

    const footer = document.createElement('div');
    footer.className = 'ws-card-footer';

    const count = document.createElement('span');
    count.className = 'count-pill';
    count.textContent = `${ws.tabs.length} tab${ws.tabs.length === 1 ? '' : 's'}`;
    footer.append(count);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '10px';
    controls.style.alignItems = 'center';

    const syncLabel = document.createElement('label');
    syncLabel.className = 'ws-toggle';
    const syncCheckbox = document.createElement('input');
    syncCheckbox.type = 'checkbox';
    const isExcluded = !!excludedWorkspaces[ws.workspaceId];
    syncCheckbox.checked = !isExcluded;
    syncCheckbox.addEventListener('change', async () => {
      await setSyncExcluded(ws.workspaceId, !syncCheckbox.checked);
      lastLocalStateKey = '';
      chrome.runtime.sendMessage({ type: 'SYNC_NOW' }).catch(() => {});
      renderLocalWorkspaces();
    });
    syncLabel.append(syncCheckbox, ' Sync');
    controls.append(syncLabel);

    if (isExcluded) {
      const notSyncedNote = document.createElement('span');
      notSyncedNote.className = 'count-pill';
      notSyncedNote.style.color = '#EF4444';
      notSyncedNote.textContent = 'excluded';
      controls.append(notSyncedNote);
    } else if (effectiveLabel && remoteLabels.has(effectiveLabel)) {
      const mirrorLabel = document.createElement('label');
      mirrorLabel.className = 'ws-toggle';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = await isMirrored(ws.workspaceId);
      checkbox.addEventListener('change', async () => {
        await setMirrored(ws.workspaceId, checkbox.checked);
        lastLocalStateKey = '';
        chrome.runtime.sendMessage({ type: 'SYNC_NOW' }).catch(() => {});
      });
      mirrorLabel.append(checkbox, ' Mirror');
      controls.append(mirrorLabel);
    }

    footer.append(controls);
    card.append(footer);

    if (isDefault) {
      const hint = document.createElement('div');
      hint.className = 'ws-hint';
      hint.textContent = 'Tabs outside Vivaldi workspaces (extensions, speed dials)';
      card.append(hint);
    }

    localList.append(card);
  }

  if (renderedCount === 0) {
    localList.innerHTML = `<div class="empty-state">${searchQuery ? 'No matching workspaces found.' : 'No open tabs found.'}</div>`;
  }
}

renderLocalWorkspaces();
chrome.tabs.onCreated.addListener(() => {
  lastLocalStateKey = '';
  renderLocalWorkspaces();
});
chrome.tabs.onRemoved.addListener(() => {
  lastLocalStateKey = '';
  renderLocalWorkspaces();
});

const remoteList = document.getElementById('remoteDevices');

async function renderRemoteDevices() {
  const handle = await loadHandle();
  if (!handle) {
    remoteList.innerHTML = '<div class="empty-state">No sync folder configured — set one up in Options.</div>';
    return;
  }
  if (!(await verifyPermission(handle, false))) {
    remoteList.innerHTML = '<div class="empty-state">Sync folder permission lost — reconnect it in Options.</div>';
    return;
  }

  const { devices, pending } = await scanSyncFolder(handle, (await getOrCreateDevice()).id);

  if (remoteDeviceCount) {
    remoteDeviceCount.textContent = `${devices.length} device${devices.length === 1 ? '' : 's'}`;
  }

  const stateKey = JSON.stringify({ devices, pending, searchQuery });
  if (stateKey === lastRemoteStateKey) return;
  lastRemoteStateKey = stateKey;

  remoteList.innerHTML = '';

  for (const name of pending) {
    const p = document.createElement('div');
    p.className = 'pending-device';
    p.textContent = `⏳ ${name}: syncing from cloud…`;
    remoteList.append(p);
  }

  let totalRemoteRendered = 0;

  for (const device of devices) {
    const deviceCard = document.createElement('div');
    deviceCard.className = 'device-card';

    const deviceHeader = document.createElement('div');
    deviceHeader.className = 'device-header';
    
    const ownDevice = await getOrCreateDevice();
    const isOldSessionOfCurrentDevice = device.deviceName && ownDevice.name && (device.deviceName === ownDevice.name);

    const deviceTitle = document.createElement('div');
    deviceTitle.className = 'device-title';
    deviceTitle.innerHTML = `<span>💻</span> <span>${device.deviceName || device.deviceId}</span>` + 
      (isOldSessionOfCurrentDevice ? ` <span class="count-pill" style="color:#F59E0B; border:1px solid rgba(245,158,11,0.3); font-size:9px;">(Alte Sitzung)</span>` : '');

    const headerRight = document.createElement('div');
    headerRight.style.display = 'flex';
    headerRight.style.alignItems = 'center';
    headerRight.style.gap = '6px';

    const syncedSpan = document.createElement('span');
    syncedSpan.className = 'device-synced';
    syncedSpan.textContent = device.updatedAt ? formatRelativeSync(device.updatedAt) : '';
    headerRight.append(syncedSpan);

    let deleteConfirming = false;
    let confirmTimer = null;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-header';
    deleteBtn.style.padding = '2px 6px';
    deleteBtn.style.fontSize = '10px';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Diesen alten Snapshot aus dem Sync-Ordner löschen';
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!deleteConfirming) {
        deleteConfirming = true;
        deleteBtn.textContent = 'Löschen?';
        deleteBtn.style.background = '#EF4444';
        deleteBtn.style.color = '#FFFFFF';
        deleteBtn.style.borderColor = '#DC2626';
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => {
          deleteConfirming = false;
          deleteBtn.textContent = '🗑️';
          deleteBtn.style.background = '';
          deleteBtn.style.color = '';
          deleteBtn.style.borderColor = '';
        }, 4000);
        return;
      }

      deleteBtn.textContent = '⏳';
      deleteBtn.disabled = true;
      try {
        await deleteDeviceFile(handle, device.deviceId);
      } catch (err) {
        console.warn('[DeckMirror] delete error:', err);
      }
      lastRemoteStateKey = '';
      await renderRemoteDevices();
    });
    headerRight.append(deleteBtn);

    deviceHeader.append(deviceTitle, headerRight);
    deviceCard.append(deviceHeader);

    let deviceHasMatchingWs = false;

    for (const ws of device.workspaces || []) {
      const wsLabel = ws.label || '(unlabeled)';
      const wsKey = `${device.deviceId}-${wsLabel}`;

      const matchesWs = wsLabel.toLowerCase().includes(searchQuery);
      const matchingTabs = (ws.tabs || []).filter((t) => {
        if (!searchQuery) return true;
        return (t.title && t.title.toLowerCase().includes(searchQuery)) ||
               (t.url && t.url.toLowerCase().includes(searchQuery));
      });

      if (searchQuery && !matchesWs && matchingTabs.length === 0) {
        continue;
      }

      deviceHasMatchingWs = true;
      totalRemoteRendered++;

      const wsBlock = document.createElement('div');
      wsBlock.className = 'device-ws';

      const isCollapsed = collapsedWorkspaces.has(wsKey) && !searchQuery;

      const wsHeader = document.createElement('div');
      wsHeader.className = 'device-ws-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'ws-title-group';

      const arrow = document.createElement('span');
      arrow.className = `accordion-arrow ${isCollapsed ? 'collapsed' : ''}`;
      arrow.textContent = '▼';
      titleGroup.append(arrow);

      if (ws.color) {
        const dot = document.createElement('span');
        dot.className = 'ws-dot';
        dot.style.background = ws.color;
        titleGroup.append(dot);
      }

      const labelSpan = document.createElement('span');
      labelSpan.className = 'ws-label-text';
      labelSpan.textContent = wsLabel;
      titleGroup.append(labelSpan);

      const countBadge = document.createElement('span');
      countBadge.className = 'count-pill';
      countBadge.textContent = `${(ws.tabs || []).length}`;
      titleGroup.append(countBadge);

      const actionsGroup = document.createElement('div');
      actionsGroup.className = 'ws-actions-group';

      const openAllBtn = document.createElement('button');
      openAllBtn.className = 'btn-open-all';
      openAllBtn.textContent = 'Open all';
      openAllBtn.title = `Open all ${(ws.tabs || []).length} tabs in a new window`;
      openAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.windows.create({ url: (ws.tabs || []).map((t) => t.url) });
      });
      actionsGroup.append(openAllBtn);

      wsHeader.append(titleGroup, actionsGroup);
      wsBlock.append(wsHeader);

      const tabsBox = document.createElement('div');
      tabsBox.className = `device-ws-tabs ${isCollapsed ? 'collapsed' : ''}`;

      const tabsToDisplay = searchQuery ? matchingTabs : (ws.tabs || []);

      for (const tab of tabsToDisplay) {
        const tabRow = document.createElement('a');
        tabRow.className = 'tab-item';
        tabRow.href = tab.url;
        tabRow.title = `${tab.title || tab.url}\n${tab.url}`;

        if (tab.favIconUrl && tab.favIconUrl.startsWith('http')) {
          const img = document.createElement('img');
          img.className = 'tab-favicon';
          img.src = tab.favIconUrl;
          img.onerror = () => {
            img.style.display = 'none';
          };
          tabRow.append(img);
        } else {
          const ph = document.createElement('span');
          ph.className = 'tab-favicon-placeholder';
          ph.textContent = '🌐';
          tabRow.append(ph);
        }

        const titleSpan = document.createElement('span');
        titleSpan.className = 'tab-title';
        titleSpan.textContent = tab.title || tab.url;
        tabRow.append(titleSpan);

        const domain = extractDomain(tab.url);
        if (domain) {
          const domainSpan = document.createElement('span');
          domainSpan.className = 'tab-domain';
          domainSpan.textContent = domain;
          tabRow.append(domainSpan);
        }

        tabRow.addEventListener('click', (e) => {
          e.preventDefault();
          chrome.tabs.create({ url: tab.url });
        });

        tabsBox.append(tabRow);
      }

      wsHeader.addEventListener('click', () => {
        if (collapsedWorkspaces.has(wsKey)) {
          collapsedWorkspaces.delete(wsKey);
          tabsBox.classList.remove('collapsed');
          arrow.classList.remove('collapsed');
        } else {
          collapsedWorkspaces.add(wsKey);
          tabsBox.classList.add('collapsed');
          arrow.classList.add('collapsed');
        }
      });

      wsBlock.append(tabsBox);
      deviceCard.append(wsBlock);
    }

    if (deviceHasMatchingWs || !searchQuery) {
      remoteList.append(deviceCard);
    }
  }

  if (devices.length === 0 && pending.length === 0) {
    remoteList.innerHTML = '<div class="empty-state">No other devices found in the sync folder yet.</div>';
  } else if (totalRemoteRendered === 0 && searchQuery) {
    remoteList.innerHTML = '<div class="empty-state">No matching remote tabs found.</div>';
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
    folderBanner.textContent = 'No sync folder configured yet.';
    const btn = document.createElement('button');
    btn.textContent = 'Open Settings';
    btn.addEventListener('click', () => chrome.runtime.openOptionsPage());
    folderBanner.append(btn);
    folderBanner.style.display = 'block';
    return;
  }

  if (!(await verifyPermission(handle, false))) {
    folderBanner.textContent = 'Sync folder permission was lost after restart.';
    const btn = document.createElement('button');
    btn.textContent = 'Reconnect Folder';
    btn.addEventListener('click', () => chrome.runtime.openOptionsPage());
    folderBanner.append(btn);
    folderBanner.style.display = 'block';
  }
}

renderFolderBanner();
setInterval(renderFolderBanner, 10000);
