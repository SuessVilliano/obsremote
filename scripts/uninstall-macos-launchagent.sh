#!/bin/bash
set -euo pipefail
PLIST="$HOME/Library/LaunchAgents/com.obsremote.commandcenter.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "OBS Remote auto-start removed. The repo and settings were not deleted."
