#!/bin/bash
set -euo pipefail

HOSTNAME="${OBSREMOTE_PUBLIC_HOSTNAME:-obsremote.liv8.co}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_PORT="${PORT:-3000}"
APP_LABEL="com.obsremote.commandcenter"
TUNNEL_LABEL="com.obsremote.cloudflared"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

say() { printf '\n==> %s\n' "$*"; }
ok() { printf '✅ %s\n' "$*"; }
warn() { printf '⚠️  %s\n' "$*"; }
fail() { printf '❌ %s\n' "$*"; }

find_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then command -v cloudflared; return; fi
  for p in /opt/homebrew/bin/cloudflared /usr/local/bin/cloudflared; do
    [[ -x "$p" ]] && { echo "$p"; return; }
  done
  return 1
}

find_config() {
  for p in "$HOME/.cloudflared/config.yml" "$HOME/.cloudflared/config.yaml"; do
    [[ -f "$p" ]] && { echo "$p"; return; }
  done
  return 1
}

public_up() {
  curl -fsS --max-time "${1:-12}" "https://$HOSTNAME/" >/dev/null 2>&1
}

say "OBS Remote public-access diagnosis"
echo "App: $ROOT"
echo "Public host: https://$HOSTNAME"

say "1. Local OBS Remote server"
if curl -fsS --max-time 4 "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1; then
  ok "OBS Remote is responding locally on port $APP_PORT"
else
  warn "OBS Remote is not responding locally. Reinstalling/restarting its LaunchAgent."
  bash "$ROOT/scripts/install-macos-launchagent.sh"
  sleep 2
  if curl -fsS --max-time 4 "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1; then
    ok "OBS Remote restarted successfully"
  else
    fail "OBS Remote still is not responding locally. Check $LOG_DIR/obsremote-error.log"
    exit 1
  fi
fi

say "2. Cloudflare tunnel prerequisites"
CF="$(find_cloudflared || true)"
if [[ -z "$CF" ]]; then
  fail "cloudflared is not installed. Install it first with: brew install cloudflared"
  exit 2
fi
ok "cloudflared found at $CF"

CFG="$(find_config || true)"
if [[ -z "$CFG" ]]; then
  fail "No ~/.cloudflared/config.yml or config.yaml exists. The public tunnel was likely temporary/manual."
  echo "Create or restore a named Cloudflare Tunnel for $HOSTNAME, then rerun this script."
  echo "Expected origin: http://127.0.0.1:$APP_PORT"
  exit 3
fi
ok "Cloudflare config found: $CFG"

if grep -q "$HOSTNAME" "$CFG"; then
  ok "Tunnel config contains $HOSTNAME"
else
  fail "Cloudflare config does not contain hostname $HOSTNAME"
  echo "Add an ingress rule for $HOSTNAME -> http://127.0.0.1:$APP_PORT, then rerun."
  exit 4
fi

say "3. Install persistent cloudflared LaunchAgent"
PLIST="$HOME/Library/LaunchAgents/$TUNNEL_LABEL.plist"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$TUNNEL_LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$CF</string>
    <string>tunnel</string>
    <string>--config</string><string>$CFG</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$LOG_DIR/cloudflared.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/cloudflared-error.log</string>
</dict></plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$TUNNEL_LABEL"
launchctl kickstart -k "gui/$(id -u)/$TUNNEL_LABEL" >/dev/null 2>&1 || true
sleep 3

if launchctl print "gui/$(id -u)/$TUNNEL_LABEL" >/dev/null 2>&1; then
  ok "Persistent Cloudflare tunnel LaunchAgent is loaded"
else
  fail "Cloudflare LaunchAgent failed to load. Check $LOG_DIR/cloudflared-error.log"
  exit 5
fi

say "4. Verify connector stays online"
if public_up 12; then
  ok "https://$HOSTNAME is reachable"
else
  warn "Public hostname is still offline; restarting connector once more"
  launchctl kickstart -k "gui/$(id -u)/$TUNNEL_LABEL" >/dev/null 2>&1 || true
  sleep 5
  if public_up 12; then
    ok "https://$HOSTNAME recovered after connector restart"
  else
    fail "Cloudflare connector did not become publicly reachable"
    echo "--- launchctl status ---"
    launchctl print "gui/$(id -u)/$TUNNEL_LABEL" 2>/dev/null | head -80 || true
    echo "--- cloudflared errors ---"
    tail -80 "$LOG_DIR/cloudflared-error.log" 2>/dev/null || true
    echo "--- cloudflared output ---"
    tail -80 "$LOG_DIR/cloudflared.log" 2>/dev/null || true
    exit 6
  fi
fi

say "Repair complete"
echo "OBS Remote and its Cloudflare tunnel will now restart automatically after login/reboot, and liv8-start will self-heal the tunnel if it drops."
