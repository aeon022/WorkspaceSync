# DeckMirror // Chrome Web Store Listing & Metadata Specification
> **PULSAR Matrix // ABTEILUNG83 Store Distribution Blueprint**

---

## 1. Store Header & Key Metadata

| Field | Value | Constraints |
| :--- | :--- | :--- |
| **Extension Name** | `DeckMirror — Vivaldi Workspaces & Tab Sync` | Max 45 chars (44 chars) |
| **Short Summary (EN)** | `Mirror and synchronize your Vivaldi browser workspaces and open tabs across devices via your private cloud folder.` | Max 132 chars (116 chars) |
| **Kurzbeschreibung (DE)** | `Synchronisiere und spiegle deine Vivaldi-Workspaces und Tabs geräteübergreifend über deinen privaten Cloud-Ordner.` | Max 132 chars (115 chars) |
| **Version** | `1.0.0` | SemVer |
| **Category** | `Productivity` / `Workflow & Planning` | Primary Store Category |
| **Language** | `English (United States)`, `German (Germany)` | Primary Locales |
| **Website** | `https://deckmirror.pulsar-ext.space` | Official Landing Page |
| **Support URL** | `https://github.com/aeon022/WorkspaceSync/issues` | GitHub Issues |
| **Tip Jar / Sponsor** | `https://buy.polar.sh/polar_cl_DrOMaecRuEdvn8seYYegzMt0jEDbuY92X4zMd2NkGD8` | Polar.sh Tip Jar |

---

## 2. Store Listing Description (English)

```markdown
⚡ Real-time workspace synchronization and tab mirroring for Vivaldi Browser across all your devices. Zero accounts. Zero servers. 100% private.

Vivaldi Workspaces keep your browsing organized — but keeping tabs synchronized across your Mac Studio, MacBook, or desktop PC has always required manual effort. DeckMirror bridges your active browser sessions in real-time using any local or cloud folder you already sync (Dropbox, iCloud Drive, Syncthing, Nextcloud, or Google Drive).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ KEY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ 🌐 01. BROWSE & RESTORE REMOTE TABS
View all workspaces and open tabs from any of your connected devices directly inside your Vivaldi sidepanel. Click any tab to launch it locally, or open entire workspaces with a single click.

▸ 🎯 02. SELECTIVE WORKSPACE PUBLISHING
You decide what gets shared. Opt-in or opt-out per workspace with single-click checkboxes. Keep sensitive or personal workspaces strictly on your local machine.

▸ ⚡ 03. ACTIVE TAB MIRRORING (LIVE CONVERGENCE)
Enable Mirror on matching workspace names across two or more devices. Open or close tabs on one machine and watch them instantly replicate across your other devices with zero manual intervention.

▸ 🚀 04. ONE-CLICK TAB DISPATCH (SEND TAB TO DEVICE)
Send any active tab instantly to a specific remote device via the sidepanel or native right-click context menu.

▸ 🛡️ 05. 100% PRIVATE & SERVERLESS
DeckMirror makes zero external API or network calls. All synchronization is performed peer-to-peer via timestamped JSON state files stored inside your private folder.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠️ HOW IT WORKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Layer 1 (MV3 Extension): Runs in your browser to monitor tab activity, manage File System sync handles, and render the sleek cyberpunk sidepanel.
• Layer 2 (Vivaldi Native Hook): An ultra-lightweight UI script for macOS that enables deep inspection of Vivaldi's internal workspace tree (`vivExtData`).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 PRIVACY & PERMISSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• No analytics, no telemetry, no remote servers.
• `storage`: Saves your local device name, mirror preferences, and sync state.
• `tabs`: Detects tab creation, updates, and removals for syncing.
• `sidePanel`: Displays your remote workspace dashboard.
• `contextMenus`: Adds the "Send Tab to Device" right-click shortcut.

Open-source project from the PULSAR Suite by ABTEILUNG83.
GitHub: https://github.com/aeon022/WorkspaceSync
```

---

## 3. Store Listing Description (Deutsch)

```markdown
⚡ Echtzeit-Synchronisation und Tab-Mirroring für Vivaldi Browser-Workspaces über alle deine Rechner. Ohne Account. Ohne Cloud-Server. 100% privat.

Vivaldi-Workspaces strukturieren deinen Arbeitsalltag — doch die Synchronisation von geöffneten Tabs zwischen Mac Studio, MacBook oder Desktop-PC war bisher umständlich. DeckMirror verbindet deine aktiven Browser-Sessions in Echtzeit über jeden beliebigen Ordner, den du bereits synchronisierst (Dropbox, iCloud Drive, Syncthing, Nextcloud oder Google Drive).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ HAUPTFUNKTIONEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ 🌐 01. REMOTE-TABS DURCHSUCHEN & ÖFFNEN
Sieh alle Workspaces und geöffneten Tabs deiner anderen Geräte direkt im Vivaldi-Seitenpaneel. Öffne einzelne Tabs mit einem Klick oder stelle komplette Workspaces sofort wieder her.

▸ 🎯 02. SELEKTIVE WORKSPACE-FREIGABE
Volle Kontrolle: Bestimme für jeden Workspace individuell, ob er geteilt werden soll. Private oder vertrauliche Workspaces bleiben garantiert lokal.

▸ ⚡ 03. LIVE TAB-MIRRORING
Aktiviere das Mirroring für gleichnamige Workspaces auf zwei Geräten: Öffnest oder schließt du einen Tab auf Rechner A, gleicht Rechner B den Workspace automatisch und unterbrechungsfrei ab.

▸ 🚀 04. TAB PER RECHTSKLICK SENDEN
Sende beliebige Webseiten mit einem Klick an ein bestimmtes Gerät — wahlweise über das Seitenpaneel oder das native Kontextmenü.

▸ 🛡️ 05. MAXIMALER DATENSCHUTZ (ZERO-SERVER)
DeckMirror sendet keine Daten an externe Server. Die Synchronisation erfolgt ausschließlich über versionierte JSON-Dateien in deinem gewählten Sync-Ordner.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠️ FUNKTIONSWEISE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Layer 1 (MV3 Erweiterung): Überwacht Tab-Events, verwaltet den Dateisystem-Zugriff und steuert das moderne Dark-Theme Seitenpaneel.
• Layer 2 (Vivaldi UI Hook): Leichtgewichtiges Skript für macOS, das die internen Vivaldi-Workspace-Strukturen nahtlos ausliest.

Open-Source Projekt aus der PULSAR Suite von ABTEILUNG83.
GitHub: https://github.com/aeon022/WorkspaceSync
```

---

## 4. Single Purpose & Permissions Justification (For Chrome Reviewers)

### Single Purpose Statement:
> "DeckMirror synchronizes and mirrors Vivaldi browser tabs and workspace sessions across multiple user devices using a user-selected local or shared file storage directory."

### Permission Justifications:
* **`tabs`**: Required to read the URL, title, favicon, and active state of open tabs in order to synchronize them to the user's shared folder and to open remote tabs requested by the user.
* **`storage`**: Required to store user preferences (such as selected device name, enabled mirror workspaces, and UI panel settings) locally in the browser.
* **`sidePanel`**: Required to display the companion sidepanel interface showing remote devices, workspaces, search filters, and quick tab actions.
* **`contextMenus`**: Required to provide quick context menu items to send the current active tab to a specific remote device.
* **`management`**: Required to detect when the extension is loaded or unloaded so that background UI status indicators dynamically attach/detach.

---

## 5. Visual Store Assets & Screenshots

| Asset Name | Resolution | Format | File Path |
| :--- | :--- | :--- | :--- |
| **Store Icon** | `128 x 128` | PNG | `icons/icon128.png` |
| **Promo Tile (Small)** | `440 x 280` | PNG/JPG | Generated from `landingpage/public/deckmirror-hero.png` |
| **Marquee Promo Tile** | `1400 x 560` | PNG/JPG | Generated from Hero Banner |
| **Screenshot 1 — Overview** | `1280 x 800` | PNG | `docs/screenshots/store-1-overview.png` |
| **Screenshot 2 — Multi-Device** | `1280 x 800` | PNG | `docs/screenshots/store-2-multidevice.png` |
| **Screenshot 3 — Sidepanel** | `1280 x 800` | PNG | `docs/screenshots/store-3-sidepanel.png` |

---

## 6. Keywords & Search Terms
`vivaldi`, `workspaces`, `tab sync`, `tab manager`, `multi device`, `tab mirror`, `dropbox sync`, `icloud sync`, `syncthing`, `privacy tab sync`, `pulsar`, `sidepanel tabs`
