# WorkspaceSync

Browse your Vivaldi workspaces and open tabs across devices, from a
sidepanel — and optionally keep a workspace's tabs in sync between two
machines. No cloud account, no server: it just uses a folder you already
sync (Dropbox, iCloud Drive, Syncthing, ...).

## What it does

- **Browse** — see every other device's workspaces and open tabs in the
  sidepanel, click one to open it here.
- **Sync** — publish a workspace's tab list into the shared folder so other
  devices can browse it. Read-only: it doesn't open or close anything by
  itself.
- **Mirror** — for a specific workspace, actively keep both devices'
  open tabs converged (opens what's missing, closes what got removed).
  Opt-in per workspace, on both sides.

## Install

No Chrome/Vivaldi Web Store listing — load it unpacked:

1. `git clone` this repo.
2. `vivaldi://extensions` → enable **Developer mode** (top right) → **Load
   unpacked** → select this folder.

No build step, no `npm install` — plain JS/HTML/CSS.

## Setup

### 1. Device name and sync folder

Open the extension's **Options** page (gear icon in the sidepanel, or
`vivaldi://extensions` → WorkspaceSync → Details → Extension options).

- **Device name** — pre-filled with something generic and not very useful
  (there's no browser API that exposes your machine's real name to an
  extension). Rename it to something you'll recognize, e.g. "MacBook Pro"
  or "Mac Studio".
- **Sync folder** — click **Choose sync folder…** and pick a folder inside
  whatever you already sync across your devices (a Dropbox/iCloud Drive
  subfolder, a Syncthing share, ...). Pick the exact same folder on every
  device.

This alone gets you **Browse** and **Sync** — enough to see other devices'
tabs. For real workspace *names* (instead of just "unlabeled" tab piles)
and for **Mirror**, you need step 2.

### 2. Workspace detection (Layer 2) — macOS only, one-time per device

Vivaldi only exposes which workspace a tab belongs to from its own
privileged UI process — never to a regular extension, and there's no
messaging channel between that process and this extension either
(confirmed by testing, not assumed). So a small script gets patched
directly into Vivaldi's own UI and writes the tab-to-workspace mapping
into your sync folder instead, which the extension already has access to.

```bash
cd /path/to/WorkspaceSync
bash scripts/inject-uimod.sh
```

Expected output: `injected into: .../window.html`. If it says `already
injected`, it ran before — safe, it always refreshes the copied script
from this repo either way.

Optional but recommended — a LaunchAgent that re-runs the injector
automatically (a Vivaldi update replaces `window.html` and silently wipes
the patch):

```bash
cp scripts/com.workspacesync.uimod-injector.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.workspacesync.uimod-injector.plist
```

> The `.plist` has your repo path baked in. If you cloned somewhere other
> than where it currently points, edit the path in the `.plist` file
> before loading it.

Then:

1. **Quit Vivaldi completely (⌘Q, not just closing windows) and reopen
   it.** `window.html` is only read once at process start — a reload
   inside Vivaldi doesn't pick up the newly injected script.
2. A small status button appears in the bottom-right corner of the window
   — click it and pick the **same sync folder** from step 1. Success
   flashes green and fades; a permanent 🔴/🟡 there means it needs your
   attention (click it again).

Repeat this whole step on every device you want workspace names and
Mirror on. Windows/Linux: only Layer 1 (Browse/Sync with unlabeled
workspaces) works right now — the injector script is macOS-specific.

## Using it

**Browse other devices:** sidepanel → *Other devices*. Click a tab to open
it here, or *Open all* for a whole workspace.

**Name a workspace / turn Sync off:** sidepanel → *This device's
workspaces*. Each card shows the tab count and a **Sync** checkbox
(unchecking excludes that workspace from what gets published — handy for
something like "Banking"). The name field pre-fills with the real Vivaldi
workspace name once Layer 2 is active; overwrite it if you want something
different.

**Turn on Mirror:**

1. The workspace's name on **both** devices must match **exactly**
   (case-sensitive — "Coding" and "coding" are different labels).
2. Once both sides have a workspace under that same name, a **Mirror**
   checkbox appears next to Sync. Check it **on both devices**.
3. Within about a minute, new tabs opened/closed in that workspace on
   either device propagate to the other.

**Mirror does not retroactively merge.** Turning it on for the first time
does *not* open the other device's pre-existing tabs here (or vice versa)
— it only starts tracking changes from that point forward, deliberately,
so flipping the checkbox can never surprise-close tabs you already have
open. If device A has 11 tabs in "Coding" and device B has 7, that gap
stays until you close/reopen something — there's no "merge now" button
yet.

## Troubleshooting

- **A workspace looks empty / everything piled into one "unlabeled"
  group:** Layer 2 isn't currently reporting fresh data (either never set
  up on this device — see Setup step 2 — or it stopped: check for the
  status button pulsing green every ~30s in the bottom-right corner; if
  it's not there or stuck, quit and reopen Vivaldi).
- **Just made a code change / pulled an update and nothing changed:**
  `vivaldi://extensions` → reload the extension. Simply closing and
  reopening the sidepanel isn't always enough — the extension's own
  module cache needs the explicit reload.
- **Changed anything under `uimod/`:** re-run `inject-uimod.sh`, then
  fully quit and reopen Vivaldi (see Setup step 2) — the sidepanel/options
  reload doesn't touch this part at all, it lives outside the extension.
- **Sync folder permission banner keeps appearing:** File System Access
  permissions can lapse after a browser restart. Reconnect from Options
  (the sidepanel can't reliably show that native picker dialog itself,
  confirmed by testing).

## Support

Free. If it's useful: [buy the developer a coffee on Polar.sh](https://buy.polar.sh/polar_cl_DrOMaecRuEdvn8seYYegzMt0jEDbuY92X4zMd2NkGD8).
