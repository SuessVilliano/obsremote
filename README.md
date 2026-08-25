# OBS Remote Command Center v3

Turn an Amazon Fire tablet, phone, or spare browser into a free Stream Deck-style OBS command center.

## V3 highlights

- Persistent menu tabs for **Control, Viewer, Sounds, AI, Docs, and Setup**
- Low-bandwidth **Viewer** screen showing the current OBS Program scene
- Custom soundboard: upload MP3, WAV, M4A, OGG, or WebM audio
- Record short voice clips from a supported phone/tablet/browser microphone and save them as sound pads
- Custom sounds route through an OBS Browser Source so the stream can hear them
- Built-in AI assistant that can inspect live OBS state and carry out approved OBS actions
- In-app documentation explaining scenes, green screen, audio, remote access, soundboard, and AI
- Existing V2 features: smart scenes, scene/source control, audio mixer, backgrounds, reconnect, PWA, multiple OBS targets, and panic mute

## Install / update

```bash
git pull
npm install
npm start
```

If the server is already running, stop it first with **Control+C**, then pull and restart it.

## OBS WebSocket

In OBS Studio open **Tools → WebSocket Server Settings**.

- Enable WebSocket server
- Port: `4455`
- If OBS authentication is enabled, put that password in `.env`
- If OBS shows **[Auth Disabled]**, leave `OBS_WS_PASSWORD=` blank

Example:

```env
PORT=3000
REMOTE_PIN=2468
OBS_NAME=Mac mini OBS
OBS_WS_URL=ws://127.0.0.1:4455
OBS_WS_PASSWORD=
```

## Enable the AI assistant

The AI key stays on the Mac server. It is never sent to the tablet/browser.

Add these lines to your local `.env`:

```env
OPENAI_API_KEY=your_api_key_here
AI_MODEL=gpt-5-mini
```

Then restart `npm start`.

The AI assistant uses the OpenAI Responses API and receives a compact snapshot of the current OBS scenes, sources, audio inputs, and custom sound names/IDs. It can execute only the allow-listed OBS operations implemented by the server. Stream/record actions require an explicit request in the user's message.

## Viewer screen

Open the **Viewer** tab. The browser requests a compressed screenshot of the current OBS Program scene about every two seconds. This is intended as a confidence monitor, not a zero-latency video monitor.

## Custom sounds and voice clips

Open **Sounds**.

1. Give the sound a name.
2. Upload an audio file, or press **Start recording** to record a voice clip from the current browser device.
3. The new pad appears in the soundboard.
4. Tap the large pad to play the sound through OBS.
5. Use **Preview** to audition it locally on the device, or **Delete** to remove it.

Runtime sound files are stored under `public/uploads/sounds/` and metadata under `data/`. Both are ignored by Git, so personal recordings are not committed to the public repository.

The first time a sound is played in a scene, OBS Remote automatically adds the hidden `OBSRemote • Custom Soundboard` Browser Source. The Smart Scene Builder also adds it to every smart scene in advance.

## Smart scene pack

Tap **Build / Repair Smart Scenes** to create/repair:

- Starting Soon
- Game + Facecam
- Xbox Fullscreen
- Full Camera
- Just Chatting
- BRB
- Ending

The builder attempts to reuse sources named like Logitech/webcam/camera, Xbox/capture card, and Mini Mic/microphone.

## Public access

Keep raw OBS WebSocket port `4455` private. Publish only the command-center server through a secure HTTPS tunnel such as Cloudflare Tunnel.

Example architecture:

```text
Phone / Fire tablet / laptop
          │
      HTTPS / WSS
          │
   Cloudflare Tunnel
          │
   OBS Remote :3000
          │
 ws://127.0.0.1:4455
          │
        OBS
```

Use `REMOTE_PIN` and, for a public hostname, put Cloudflare Access or equivalent authentication in front of the app.

## Multiple OBS computers

```env
OBS_TARGETS_JSON=[{"id":"mac-mini","name":"Mac mini OBS","url":"ws://127.0.0.1:4455","password":""},{"id":"gaming-pc","name":"Gaming PC OBS","url":"ws://192.168.1.50:4455","password":"your-password"}]
```

Each target must be reachable from the Mac/server running OBS Remote.

## macOS auto-start

The repo includes `scripts/install-macos-launchagent.sh` to keep OBS Remote running after login. Review it first, then run it from the repo if you want the command center to start automatically.

## Security notes

- `.env` is ignored by Git
- User sound uploads and voice recordings are ignored by Git
- OBS credentials remain on the relay server
- The OpenAI API key remains on the relay server
- Sensitive HTTP endpoints require the Remote PIN
- Raw OBS WebSocket should never be exposed directly to the internet

## Tech

- Node.js 20+
- Express
- `obs-websocket-js` / OBS WebSocket 5.x
- Native WebSocket relay
- OpenAI Responses API for the optional AI assistant
- Vanilla HTML/CSS/JavaScript
- MediaRecorder for supported in-browser voice recording
- PWA service worker
