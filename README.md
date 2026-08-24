# OBS Remote Command Center v2

Turn an Amazon Fire tablet, phone, or spare browser into a free Stream Deck-style command center for OBS.

## What v2 does

- Remembers the tablet/phone and reconnects automatically
- Switches scenes with large touch buttons
- Start/stop stream and recording
- Mute/unmute every OBS audio input
- Adjust audio volume from the tablet
- Show/hide individual sources in the current scene
- One-tap streaming macros for Starting, Game, Xbox Fullscreen, Full Camera, Just Chatting, BRB and Ending
- Emergency **PANIC MUTE** for all OBS audio
- One-tap Smart Scene Builder that creates/repairs a starter streaming scene pack
- Attempts to auto-detect Logitech/webcam, Xbox/capture-card and main microphone sources
- Built-in animated browser backgrounds plus Studio, Neon and Minimal looks
- Multiple OBS computer support
- PWA/home-screen support for tablets and phones

The tablet does **not** connect directly to OBS. A small Node.js relay runs on the computer hosting OBS and talks to OBS locally. Your OBS WebSocket password never needs to be stored on the tablet.

## Install / update

For a fresh install:

```bash
git clone https://github.com/SuessVilliano/obsremote.git
cd obsremote
npm install
cp .env.example .env
```

For an existing install:

```bash
git pull
npm install
npm start
```

If the server is already running, stop it first with **Control+C**, then pull and restart it.

## OBS WebSocket settings

In OBS Studio open **Tools → WebSocket Server Settings**.

- Enable WebSocket server
- Port: `4455`
- If OBS authentication is enabled, put that password in `.env`
- If OBS shows **[Auth Disabled]**, leave `OBS_WS_PASSWORD=` blank

Example `.env`:

```env
PORT=3000
REMOTE_PIN=2468
OBS_NAME=Mac mini OBS
OBS_WS_URL=ws://127.0.0.1:4455
OBS_WS_PASSWORD=
```

Use your own `REMOTE_PIN` if the command center will ever be reachable beyond your private LAN.

## Open it on the tablet

Run:

```bash
npm start
```

The server prints local/LAN addresses. Open the Mac's LAN address in Silk, Safari, Chrome, etc. Example:

```text
http://192.168.1.96:3000
```

Keep the Terminal/server process running while using the remote.

## Build the smart scene pack

Tap **Build / Repair Smart Scenes** once. It creates:

- Starting Soon
- Game + Facecam
- Xbox Fullscreen
- Full Camera
- Just Chatting
- BRB
- Ending

It also creates built-in browser backgrounds and tries to reuse existing OBS sources that look like your camera, Xbox/capture card and microphone.

The builder is intentionally non-destructive: if a scene already exists, it keeps it and adds missing smart pieces instead of deleting the scene.

### Smart macros

After the scene pack exists:

- **Starting** → Starting Soon + main mic muted
- **Game** → Game + Facecam + main mic live
- **Xbox Full** → Xbox Fullscreen + main mic live
- **Full Cam** → Full Camera + main mic live
- **Just Chatting** → studio/chat scene + main mic live
- **BRB** → BRB + main mic muted
- **Ending** → Ending + main mic muted
- **PANIC MUTE** → mutes every OBS audio input

## Background library

The repo ships browser-source backgrounds under `public/backgrounds/`:

- `studio.html`
- `neon.html`
- `minimal.html`
- `starting.html`
- `brb.html`
- `ending.html`

The remote can add these directly to the current OBS scene. They are HTML/CSS browser sources, so they stay lightweight and require no downloaded video files.

## Multiple OBS computers

Use `OBS_TARGETS_JSON` instead of the single `OBS_*` settings:

```env
OBS_TARGETS_JSON=[{"id":"mac-mini","name":"Mac mini OBS","url":"ws://127.0.0.1:4455","password":""},{"id":"gaming-pc","name":"Gaming PC OBS","url":"ws://192.168.1.50:4455","password":"your-password"}]
```

Each OBS target must be reachable from the computer running this command-center server.

## Internet access

**Never port-forward OBS port 4455 directly to the public internet.**

For away-from-home control, expose only the command-center web server through a private VPN or authenticated HTTPS tunnel such as Tailscale or Cloudflare Tunnel.

```text
Phone / Fire tablet
        │
   HTTPS / WSS
        │
Secure tunnel / private VPN
        │
OBS Remote :3000 on Mac mini
        │
 ws://127.0.0.1:4455
        │
      OBS Studio
```

Set `REMOTE_PIN` before exposing the app outside the home LAN, and prefer provider-level authentication in front of it too.

## Troubleshooting

### Old interface still appears after `git pull`

The app is a PWA and may have cached the previous version. Reload the page once or close/reopen the home-screen app. v2 uses a new service-worker cache and will replace v1 automatically.

### OBS says offline

- OBS must be open
- WebSocket server must be enabled
- Port should be `4455`
- If OBS says `[Auth Disabled]`, `.env` should contain `OBS_WS_PASSWORD=`
- If authentication is enabled, the `.env` password must match OBS
- When the relay runs on the same Mac as OBS, use `OBS_WS_URL=ws://127.0.0.1:4455`

### Tablet cannot open the page

- Tablet and Mac must be on the same LAN/Wi-Fi for local use
- Keep `npm start` running
- Open the LAN URL printed by the server
- Allow Node through macOS Firewall if prompted

### Camera/Xbox/mic was not auto-detected

The smart builder matches source names heuristically. Rename OBS sources to clear names such as `Logitech Webcam`, `Xbox Capture`, and `Mini Mic`, then tap **Build / Repair Smart Scenes** again.

## Security

- `.env` is ignored by Git and should never be committed
- OBS credentials stay on the relay computer
- The browser only receives OBS state, not the OBS password
- Start/stop stream requires confirmation
- Raw OBS WebSocket should remain private

## Tech

- Node.js 20+
- Express
- `obs-websocket-js` / OBS WebSocket 5.x
- Native WebSocket UI relay
- Vanilla HTML/CSS/JavaScript
- PWA service worker
