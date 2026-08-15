# WorkspaceSync — Design

Date: 2026-08-15
Status: approved, pre-implementation

## Problem

Vivaldi has native Sync (its own account, not Google), but it does not sync
workspace structure — only individual tabs get grouped for *display* under a
workspace label in the Windows Panel; the workspace containers themselves
must be recreated by hand on each device. Goal: a Vivaldi extension that
syncs workspaces and their open tabs across devices, with a browse-and-pick
default and an opt-in live-mirror mode for workspaces that exist (by label)
on both sides.

## Constraint that shapes everything

Vivaldi's privileged `vivaldi.*` API namespace (needed to read a workspace's
*real* display name, or reliably create/target a workspace) is walled off
from third-party extensions — confirmed accessible only from Vivaldi's own
browser-UI JS context. A standard extension only gets, per tab, an
undocumented-but-stable `vivExtData.workspaceId` field via
`chrome.tabs.query` (read-only, no name attached, and the id shows up as
either an int or a float for the same workspace — normalize to string).

This is why the design has two independently-useful layers:

- **Layer 1 (standard extension only)**: works with just `workspaceId`,
  self-assigned labels, no name/creation API needed. This is the whole
  product if Layer 2 never pans out.
- **Layer 2 (Custom UI Modification, optional)**: a local script registered
  via Vivaldi's Settings → Appearance → Custom UI Modifications (Vivaldi's
  own supported local JS/CSS injection point). Runs in the privileged UI
  context, so it *can* read `vivaldi.prefs.get('vivaldi.workspaces.list')`
  for real names and relay them to the extension. **First implementation
  task: verify the extension↔UI-mod message bridge
  (`externally_connectable` + the UI's actual origin) works at all before
  building anything else on top of it.** Layer 1 must function completely
  standalone regardless of the outcome.

## Components

1. **Extension** (Manifest V3): background service worker, sidepanel UI,
   options page. New standalone repo, `Extensions/WorkspaceSync/`, loaded
   unpacked — no build step, matching the convention already used by the
   other extensions in `Extensions/`.
2. **UI Modification script** (Layer 2): `workspacesync-uimod.js`, generated
   by the extension, manually pointed to once in Vivaldi settings. Reads
   real workspace names, best-effort triggers native workspace
   switch/creation. Never a hard dependency.
3. **Sync folder**: a subfolder inside the user's existing iCloud
   Drive/Dropbox, chosen once via the File System Access directory picker
   in the options page. Same shape as `missionctl`'s `data_dir` pattern
   (`SYNC.md`) — no server, no subscription.

## Data model

One JSON file per device in the sync folder, named `<deviceId>.json`:

```json
{
  "deviceId": "uuid-v4, generated once, stored in chrome.storage.local",
  "deviceName": "user-editable, e.g. MacBook Pro",
  "updatedAt": "ISO-8601 timestamp",
  "workspaces": [
    {
      "localId": "vivExtData.workspaceId, normalized to string",
      "label": "user-assigned; auto-suggested from Layer 2 if available",
      "mirror": false,
      "tabs": [
        { "url": "...", "title": "...", "pinned": false, "favIconUrl": "...", "index": 0 }
      ],
      "recentEvents": [
        { "op": "open", "url": "...", "ts": 1234567890000 }
      ]
    }
  ]
}
```

`recentEvents` caps at ~50 entries (oldest dropped) and is only populated /
consumed for workspaces with `mirror: true`. A device reads every other
`*.json` file in the folder (skips its own) to build the "other devices"
view.

## Workspace identity & labeling

- Background script periodically groups `chrome.tabs.query({})` results by
  `vivExtData.workspaceId`.
- Any `workspaceId` without a stored label prompts the user in the sidepanel
  to name it (pre-filled with the real Vivaldi name if Layer 2's bridge is
  live).
- Cross-device matching is by exact `label` string.
  `ponytail: exact-match only, breaks on rename — upgrade path is a manual
  re-link action if this becomes annoying.`

## Browse & pick (sidepanel, default mode)

- Tree: device → workspace → tabs (favicon + title).
- Click a tab → opens it in the current window.
- "Open all" on a workspace → opens its tabs as a new browser window
  (`chrome.windows.create` with a `urls` array). This sidesteps the
  undocumented, unreliable "create a tab directly inside a specific
  workspace" write path entirely — that path is a Layer-2 bonus action, not
  a dependency of core browse-and-pick.

## Live mirror (opt-in, per matched label)

- A toggle appears only where a local workspace's label matches a remote
  one. Mirroring for that pairing only activates once **both** sides have
  the toggle on — no one-sided surprise tab opening.
- Driven by `chrome.alarms`, ticking every 1 minute (MV3's minimum
  reliable period — "live" means within about a minute, not instant).
- Each tick: read local tabs for the mirrored workspace, read the latest
  remote snapshot(s) for the same label, and replay `recentEvents` newer
  than the last-applied timestamp that aren't already reflected in local
  state — open tabs that were opened remotely and are missing locally,
  close tabs that were closed remotely and are still open locally. This
  event-log replay (not full-snapshot diffing) avoids reopening a tab the
  user just deliberately closed.
  `ponytail: last-write-wins on genuine concurrent edits, no CRDT — fine
  for 2-3 personal devices, upgrade path is a proper CRDT/vector-clock
  merge if conflicts start happening in practice.`

## Setup UX

Options page: pick sync folder (directory picker, persisted
`FileSystemDirectoryHandle` via IndexedDB, re-requested via
`requestPermission` on each extension start since Chromium doesn't persist
grants across browser restarts indefinitely), set/confirm device name,
download link + one-line instructions for registering the Layer-2 UI mod
file (Vivaldi doesn't allow extensions to register UI mods programmatically
— this step is always manual).

## Error handling

- **Undownloaded iCloud placeholder files**: detect via the same signal
  `missionctl` already checks for (0-byte / placeholder marker) rather than
  silently treating it as an empty snapshot.
- **Lost directory permission** (OS-level revocation): sidepanel shows a
  "reconnect sync folder" prompt instead of failing silently.
- **Layer-2 bridge missing/broken**: degrade quietly to Layer-1 behavior —
  user-assigned labels, no native name suggestions, "open all" instead of
  native workspace targeting. Nothing in Layer 1 depends on Layer 2.

## Testing

One `assert`-based self-check script (plain Node, no framework) for the
event-log merge function — the only piece of this with real branching
logic. Everything else (manifest wiring, sidepanel rendering, options page)
is manually verified by loading unpacked in Vivaldi, matching how the other
projects in `Extensions/` are tested (no `npm test`, no build step).

## Out of scope (for this iteration)

- Any attempt to reliably *create* a new native Vivaldi workspace or target
  a `chrome.tabs.create()` call directly into one via `vivExtData` writes —
  undocumented, unreliable; "open all as a new window" is the fallback and
  is not being replaced.
- More than a handful of devices / true concurrent-edit conflict
  resolution — last-write-wins is accepted for now (see `ponytail:` note
  above).
- Chrome Web Store distribution — loaded unpacked, like the other
  extensions in this folder.
