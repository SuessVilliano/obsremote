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
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$LOG_DIR/cloudflared.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/cloudflared-error.log</string>
</dict></plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$TUNNEL_LABEL"
sleep 3

if launchctl print "gui/$(id -u)/$TUNNEL_LABEL" >/dev/null 2>&1; then
  ok "Persistent Cloudflare tunnel LaunchAgent is loaded"
else
  fail "Cloudflare LaunchAgent failed to load. Check $LOG_DIR/cloudflared-error.log"
  exit 5
fi

say "4. Public hostname test"
if curl -fsS --max-time 12 "https://$HOSTNAME/" >/dev/null 2>&1; then
  ok "https://$HOSTNAME is reachable"
else
  warn "Tunnel is running, but the public hostname is not reachable yet."
  echo "Likely causes: Cloudflare DNS/public-hostname mapping, tunnel credentials, or ingress mismatch."
  echo "Logs: $LOG_DIR/cloudflared-error.log"
  exit 6
fi

say "Repair complete"
echo "OBS Remote and its Cloudflare tunnel will now restart automatically after login/reboot."
