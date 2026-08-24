#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "Node.js not found. Install Node 20+ first."
  exit 1
fi

mkdir -p "$ROOT/logs" "$HOME/Library/LaunchAgents"
PLIST="$HOME/Library/LaunchAgents/com.obsremote.commandcenter.plist"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.obsremote.commandcenter</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$ROOT/server.js</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ROOT/logs/obsremote.log</string>
  <key>StandardErrorPath</key><string>$ROOT/logs/obsremote-error.log</string>
</dict></plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/com.obsremote.commandcenter"

echo "OBS Remote will now start automatically when you log into this Mac."
echo "Logs: $ROOT/logs/"
