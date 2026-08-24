# OBS Remote Command Center

A free, mobile-friendly OBS controller that turns an Amazon Fire tablet, phone, or spare browser into a Stream Deck-style command center.

## What it controls

- Switch OBS scenes
- Mute/unmute OBS audio inputs
- Start/stop streaming
- Start/stop recording
- Show live OBS connection state
- Show the current live scene
- Switch between multiple OBS computers
- Install to a phone/tablet home screen as a PWA

The browser never needs to know the OBS WebSocket password. A small Node.js relay runs on the computer hosting OBS and talks to OBS locally.

## 1. Enable OBS WebSocket

In OBS Studio:

1. Open **Tools → WebSocket Server Settings**.
2. Turn on **Enable WebSocket server**.
3. Keep the port at **4455**.
4. Keep authentication enabled and copy/remember the OBS WebSocket password.

## 2. Install on the Mac mini

You need Node.js 20 or newer.

```bash
git clone https://github.com/SuessVilliano/obsremote.git
cd obsremote
npm install
cp .env.example .env
```

Open `.env` and set at minimum:

```env
REMOTE_PIN=2468
OBS_NAME=Mac mini OBS
OBS_WS_URL=ws://127.0.0.1:4455
OBS_WS_PASSWORD=YOUR_OBS_WEBSOCKET_PASSWORD
```

Use a different `REMOTE_PIN`; it is the PIN your tablet/phone will enter.

Then run:

```bash
npm start
```

The terminal will print your local network address. On the setup discussed for this project it may look like:

```text
http://192.168.1.96:3000
```

Open that address in Silk on the Amazon Fire tablet, Safari/Chrome on a phone, or any other browser connected to the same network.

## 3. Make it feel like a real Stream Deck

On the tablet/phone, add the page to the home screen. The included PWA manifest makes it open like a standalone app instead of a normal browser tab.

Scene and audio buttons are created automatically from whatever currently exists in OBS, so renaming or adding scenes does not require editing the web app.

## Multiple OBS computers

Instead of the single `OBS_*` settings, set `OBS_TARGETS_JSON` in `.env`:

```env
OBS_TARGETS_JSON=[{"id":"mac-mini","name":"Mac mini OBS","url":"ws://127.0.0.1:4455","password":"password-one"},{"id":"gaming-pc","name":"Gaming PC OBS","url":"ws://192.168.1.50:4455","password":"password-two"}]
```

Each target must be reachable from the computer running this command-center server.

## Access from anywhere on the internet

**Do not port-forward OBS port 4455 to the public internet.** Keep OBS WebSocket private.

For remote access, expose the command-center web server (`3000`) through a secure private-network/tunnel product such as Tailscale or Cloudflare Tunnel. Both can provide HTTPS/WSS so the same controller works away from home while OBS remains private.

Recommended architecture:

```text
Phone / Fire tablet
        │
   HTTPS / WSS
        │
Secure tunnel or private VPN
        │
OBS Remote :3000 on Mac mini
        │
 ws://127.0.0.1:4455
        │
      OBS Studio
```

Always set `REMOTE_PIN` before exposing the app beyond your home LAN. For stronger internet-facing security, put authentication from the tunnel/VPN provider in front of the app as well.

## Troubleshooting

### Tablet opens the page but OBS says offline

- Confirm OBS is open.
- Confirm OBS WebSocket is enabled on port 4455.
- Confirm `OBS_WS_PASSWORD` matches the password shown in OBS.
- If the relay runs on the same Mac as OBS, keep `OBS_WS_URL=ws://127.0.0.1:4455`.

### Tablet cannot open the page

- Make sure the Mac and tablet are on the same Wi-Fi/LAN.
- Make sure `npm start` is still running.
- Try the LAN URL printed when the server starts.
- macOS Firewall may ask whether Node is allowed to accept incoming connections; allow it on the private network.

### Audio input is missing

The controller only shows OBS inputs that support mute state. Make sure the microphone/audio source is added to OBS first.

## Security notes

- `.env` is ignored by Git and should never be committed.
- OBS passwords stay on the relay computer, not in the tablet browser.
- The remote PIN is checked before a browser can send OBS commands.
- Starting/stopping a stream requires confirmation in the UI.
- Do not expose raw OBS WebSocket directly to the internet.

## Tech

- Node.js + Express
- `obs-websocket-js` for OBS WebSocket 5.x
- Native browser WebSocket for the remote UI
- Vanilla HTML/CSS/JavaScript
- PWA/service worker for tablet/phone home-screen use
