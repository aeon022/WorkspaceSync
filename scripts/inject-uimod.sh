#!/bin/bash
# Injects uimod/workspacesync-uimod.js into Vivaldi's own privileged UI
# context by patching the browser's installed window.html - this is the
# only way to get JS execution there; Vivaldi's official "Custom UI
# Modifications" setting only supports CSS, not JS (verified, not assumed).
#
# Vivaldi's version-numbered Resources directory changes on every browser
# update, which wipes this patch - that's why this script exists, and why
# it's meant to be re-run periodically (see the paired LaunchAgent) rather
# than as a one-off. Safe to re-run: it no-ops if already injected, and
# always refreshes the copied JS file so source edits propagate.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_JS="$REPO_DIR/uimod/workspacesync-uimod.js"
SCRIPT_TAG='<script src="workspacesync-uimod.js"></script>'
VIVALDI_APP="/Applications/Vivaldi.app"

if [ ! -f "$SOURCE_JS" ]; then
  echo "error: $SOURCE_JS not found" >&2
  exit 1
fi

WINDOW_HTML=$(find "$VIVALDI_APP/Contents/Frameworks/Vivaldi Framework.framework/Versions" \
  -maxdepth 4 -iname "window.html" -path "*/Resources/vivaldi/*" 2>/dev/null | head -1)

if [ -z "$WINDOW_HTML" ]; then
  echo "error: window.html not found under $VIVALDI_APP - is Vivaldi installed at the default location?" >&2
  exit 1
fi

TARGET_DIR="$(dirname "$WINDOW_HTML")"
TARGET_JS="$TARGET_DIR/workspacesync-uimod.js"

# Always refresh the copy (relative src, not file://, to avoid CSP issues
# loading a script from outside window.html's own origin/directory) so
# source edits in this repo propagate on the next re-run.
cp "$SOURCE_JS" "$TARGET_JS"

if grep -qF "$SCRIPT_TAG" "$WINDOW_HTML"; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') already injected: $WINDOW_HTML"
  exit 0
fi

cp "$WINDOW_HTML" "$WINDOW_HTML.workspacesync-backup"
sed -i '' "s#</body>#  ${SCRIPT_TAG}\n</body>#" "$WINDOW_HTML"

echo "$(date '+%Y-%m-%d %H:%M:%S') injected into: $WINDOW_HTML"
echo "backup saved at: $WINDOW_HTML.workspacesync-backup"
