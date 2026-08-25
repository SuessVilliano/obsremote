# OBS Remote Command Center V5

OBS Remote is a responsive stream-operations console for OBS Studio. It is designed to let a creator run the show from a phone, tablet, or browser while OBS remains the production engine.

V5 is a **local/studio release candidate**. It is substantially hardened compared with the early prototype, but it is deliberately not described as a finished public SaaS product yet. See `PRODUCT_READINESS.md` and `STREAMING_DESTINATIONS_MUSIC.md` for the hosted-product architecture and remaining platform-scale work.

## What V5 includes

- Main command dashboard with Program confidence viewer, Stream/Record, scenes, quick sounds, Now Playing, audio, sources, destination summary, and stream-health data.
- Desktop/tablet collapsible navigation and mobile off-canvas navigation.
- Dark/light appearance.
- Shared persistent OBS connection per configured target instead of one OBS connection per browser client.
- Connection/reconnect state machine with exponential retry behavior.
- Scene/source/audio/stream/record control.
- Smart scene builder and repair flow.
- Favorite quick sounds plus full sound library.
- Private sound/media storage and authenticated local previews.
- Music library, playlists, shuffle/loop, volume, previous/next/play/pause, persistent playback state, and scene-linked playlist rules.
- Music Browser Source deployment across all OBS scenes so changing scenes does not restart the music engine.
- Saved RTMP/RTMPS destinations with encrypted stream keys at rest.
- Destination activation that refuses to rewrite OBS output while a stream is already live.
- Studio AI workspace plus floating, movable, minimizable assistant.
- AI context for OBS state, sounds, music/playlists, and configured destinations; stream/record actions require explicit wording.
- Preflight checks for OBS, current Program scene, camera, microphone, disk space, and music bus.
- Program health information from OBS where available.
- PWA cache strategy that deliberately excludes API/private media responses.
- Automated unit, static UI, server smoke, dependency-audit, security-shape, and desktop/mobile browser tests.

## Install / update

```bash
npm install
npm start
```

For an existing checkout:

```bash
git pull
npm install
npm start
```

If a previous server is running, stop that process before starting a second copy on port 3000.

## OBS WebSocket

In OBS Studio, open **Tools → WebSocket Server Settings**.

- Enable WebSocket server.
- Default port: `4455`.
- If OBS authentication is enabled, put its password in the local `.env`.
- If OBS shows `[Auth Disabled]`, leave `OBS_WS_PASSWORD=` empty.

Example local environment:

```env
PORT=3000
REMOTE_PIN=choose_a_private_pin
OBS_NAME=Mac mini OBS
OBS_WS_URL=ws://127.0.0.1:4455
OBS_WS_PASSWORD=

OPENAI_API_KEY=your_api_key_here
AI_MODEL=gpt-5-mini
```

Never commit `.env`.

## Storage and secrets

Runtime data lives under `data/`, which is ignored by Git.

V5 moves uploaded sound/music files out of the public static web root and into private runtime media storage. Older `public/uploads/sounds` and `public/uploads/music` files are migrated when possible.

V5 also creates persistent local secrets under `data/` for Browser Source playback and destination-secret encryption. Existing RTMP destination records containing a plaintext `streamKey` are migrated to encrypted storage on load.

This protects against accidental browser/API disclosure. It does **not** protect secrets from an attacker who already controls the Mac and can read the local secret files. A public desktop agent should move long-term secrets into the operating-system credential store.

## Sounds

Sounds are short one-shot clips such as stingers, drops, effects, and voice clips.

- Upload supported audio from **Sounds**.
- Star sounds to pin favorites to the main dashboard.
- Preview uses an authenticated endpoint instead of a public upload URL.
- Playing a sound ensures the OBS soundboard Browser Source exists in the active scene.

Uploads are size-limited and basic audio file signatures are checked server-side before storage.

## Music

Music is intentionally separate from the soundboard.

- Upload tracks.
- Create playlists.
- Ordered or shuffle playback.
- Loop or stop at playlist end.
- Assign a default volume.
- Link playlists to exact OBS scene names.
- Install the Music bus in all OBS scenes.
- Scene changes can automatically select the associated playlist without starting duplicate players.

The authoritative playback state belongs to the local server/OBS Browser Source rather than a phone tab.

Creators are responsible for having the rights to music they broadcast. OBS Remote does not infer or certify licensing status.

## Streaming destinations

V5 can save RTMP/RTMPS destinations and configure OBS to use one selected destination.

Supported saved destination labels include Twitch, Kick, YouTube, TikTok, Instagram, Viloud, and generic custom RTMP. A named platform only works when that account/platform actually provides encoder credentials or a supported integration.

Stream keys are encrypted locally and are never returned by the destination-list API.

**Current local-build limit:** OBS output is switched to one destination at a time. True simultaneous multistream requires the planned relay/cloud layer rather than multiplying OBS/home-upload sessions from the browser app.

## AI assistant

The API key remains server-side. Studio AI receives a compact operational context rather than arbitrary filesystem access.

The allow-listed action layer can work with scenes, smart modes, mute/volume, sounds, music, scene repair, streaming, and recording. Stream/record require an explicit user request.

For the public product, AI permissions should be further separated into safe, confirm, and critical tiers with an audit log and reversible configuration snapshots.

## Viewer

The current Program viewer uses compressed OBS screenshots. It is a confidence monitor, not a zero-latency video return.

The hosted/pro version should add a cached low-FPS mode and ultimately a WebRTC low-latency monitor so multiple viewers do not independently hammer OBS with screenshot requests.

## Public access

Never expose raw OBS WebSocket port 4455 to the public internet.

For a private installation, publish only the command-center server behind HTTPS/WSS and an identity layer such as Cloudflare Access.

```text
Phone / Tablet / Browser
          |
      HTTPS / WSS
          |
 Identity / Tunnel
          |
   OBS Remote :3000
          |
  Shared local OBS connection
          |
 ws://127.0.0.1:4455
          |
         OBS
```

The commercial architecture should replace manual tunnels and a shared PIN with accounts, paired local agents, per-device sessions, roles, and an outbound agent connection to the hosted control plane.

## Multiple OBS computers

```env
OBS_TARGETS_JSON=[{"id":"mac-mini","name":"Mac mini OBS","url":"ws://127.0.0.1:4455","password":""},{"id":"studio","name":"Studio PC","url":"ws://192.168.1.50:4455","password":"your-password"}]
```

V5 maintains one manager/connection per target and multiplexes browser clients through it.

## Quality assurance

Run the local automated gate:

```bash
npm run qa
npm run audit:prod
```

Browser tests require Playwright Chromium:

```bash
npx playwright install chromium
npm run test:e2e
```

GitHub Actions runs:

- Node 20, 22, and 24 syntax/unit/static regression tests.
- Production dependency vulnerability audit.
- Server startup/health smoke test.
- PIN-protected API behavior checks.
- RTMP key non-disclosure/encryption behavior.
- Invalid audio-upload rejection.
- Secret/runtime-file Git checks.
- Desktop Chromium UI flow.
- Mobile Chromium navigation flow.

See `QA_RELEASE_CHECKLIST.md` for release gates and the final hardware acceptance pass.

## macOS auto-start

`scripts/install-macos-launchagent.sh` can keep the local server running after login. Review the script before installing it.

## Product documents

- `PRODUCT_READINESS.md` — public-product/security/architecture review.
- `STREAMING_DESTINATIONS_MUSIC.md` — destination, multistream, playlist, music, and cue architecture.
- `QA_RELEASE_CHECKLIST.md` — release-quality gates.

## Technology

- Node.js 20+
- Express
- `obs-websocket-js` / OBS WebSocket 5.x
- native WebSocket relay
- OpenAI Responses API for optional Studio AI
- vanilla HTML/CSS/JavaScript PWA
- Playwright for browser regression testing
- Node built-in test runner for deterministic core tests
