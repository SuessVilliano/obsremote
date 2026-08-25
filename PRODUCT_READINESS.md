# OBS Remote — Streamer-Grade Product Readiness Review

## Product vision

OBS Remote can become more than a remote control. The strongest version is a **stream operations console**: one place to plan a show, verify the studio, control OBS, monitor output, fire sounds, manage cues, and let an AI copilot safely assist with setup and live production.

The current prototype proves the core idea, but it is **not yet ready for public multi-user release**. This document separates what already works from the blockers that should be solved before treating it like a product for creators beyond one trusted studio.

## What the prototype already proves

- Browser-based control from phone, tablet, or desktop.
- OBS WebSocket scene, source, audio, stream, and recording control.
- Remote access through a secure tunnel without exposing OBS WebSocket directly.
- Smart scene creation and repair.
- Custom sound uploads and browser-recorded voice clips.
- AI-assisted OBS operations through an allow-listed server action layer.
- PWA-style installability and remembered-device behavior.
- A low-bandwidth confidence-monitor concept.
- Multiple OBS target configuration.

## P0 — must solve before a public beta

### 1. Replace the shared PIN with real accounts and sessions

A four-digit PIN is acceptable for a private LAN prototype but not for a public creator product.

Public version should support:

- Email/OAuth login.
- Per-user accounts and organizations/studios.
- Secure HTTP-only session cookies or short-lived access tokens.
- Device/session management and revocation.
- Optional MFA/passkeys.
- Roles: Owner, Producer, Operator, View-only.
- Rate limiting and brute-force protection.

Never put reusable authentication secrets in WebSocket query strings.

### 2. Move from “one Node server beside OBS” to a local agent + hosted control plane

For the public, customers should not need to configure Cloudflare Tunnels manually.

Recommended architecture:

```text
Phone / Tablet / Browser
        |
   HTTPS / WSS
        |
Hosted OBS Remote Cloud
        |
Authenticated outbound connection
        |
Local OBS Remote Agent
        |
127.0.0.1:4455
        |
       OBS
```

The local agent should make only outbound connections. OBS WebSocket remains local/private.

### 3. Use one shared OBS connection per target

The current architecture can create a separate OBS connection for each browser client. A public-grade agent should maintain **one persistent OBS connection per target** and multiplex browser clients through a broker. This avoids duplicate event subscriptions, excess load, race conditions, and reconnect storms.

### 4. Make connection state a state machine

Do not flash Offline/Reconnecting. Track explicit states:

- App loading
- Cloud connected
- Agent connected
- OBS connecting
- OBS connected
- OBS authentication failed
- OBS unavailable
- Network unavailable

Expose the last error and a human-readable recovery action.

### 5. Fix soundboard token lifecycle

The soundboard browser-source token is currently generated at server startup. Existing OBS Browser Sources can retain the old token after a server restart, which can break sound playback.

Use one of:

- A persistent locally stored secret.
- A signed short path that the agent can refresh in OBS automatically.
- A loopback-only endpoint with no externally useful bearer token.

### 6. Harden uploads

Do not trust MIME type or file extension alone.

Public release needs:

- Server-side file signature/type validation.
- Audio decode validation.
- Upload quotas per user/studio.
- Duration/size limits.
- Safe generated filenames only.
- Storage outside the public static web root, served through authenticated routes.
- Optional malware scanning for hosted storage.

### 7. AI must use a permissioned command system

The AI should never have broad implicit control over a live show.

Use three action tiers:

- **Safe:** inspect state, explain, plan, change non-destructive layout settings.
- **Confirm:** scene rebuilds, deleting sources, changing output settings, mass mute, overwrites.
- **Critical:** start/stop stream, start/stop recording, destructive deletes, account changes.

Critical actions should require an explicit UI confirmation, not merely wording in the user prompt.

Every AI action should produce an audit entry and ideally an undo/recovery path.

### 8. Add tests and CI before public distribution

At minimum:

- Unit tests for action validation, auth, uploads, target selection, scene planning, and AI action parsing.
- Integration tests with a mocked OBS WebSocket server.
- Browser tests for mobile/tablet/desktop navigation.
- Regression tests for reconnect behavior.
- CI lint/test/build checks on every pull request.

## P1 — features serious streamers will expect

### Main control surface

The Control dashboard should be customizable and contain the operator’s most-used items:

- Program Viewer.
- Start/stop stream and record.
- Scene buttons.
- Favorite macros.
- Favorite sounds.
- Mic controls.
- Stream health.
- Current/next cue.

Users should be able to reorder, resize, hide, and pin modules.

### Collapsible navigation

Desktop/tablet: collapsible side rail.

Mobile: hamburger/drawer or compact navigation that does not consume permanent vertical space.

Navigation state should be remembered per device.

### Favorite sounds

Sounds need:

- Star/pin favorite sounds.
- A configurable number of quick pads on the dashboard.
- Categories/folders.
- Search.
- Drag-and-drop ordering.
- Hotkeys.
- Per-sound volume.
- Fade in/out and stop-all.
- Optional ducking of music/game audio while a clip plays.

### Program Viewer

The screenshot monitor is useful as a fallback but is not a full confidence monitor for professional use.

Product tiers:

1. Snapshot mode — lowest bandwidth.
2. Low-FPS monitor — 2–10 FPS for remote confidence checking.
3. WebRTC low-latency monitor — preferred long-term option for serious live production.

Do not request separate screenshots from OBS for every connected browser. Cache/distribute one current frame stream per studio.

### Audio

Serious creators will expect:

- Live audio meters.
- Mono/stereo state.
- Monitoring state.
- Gain and mute.
- Audio sync delay.
- Noise suppression/compressor/limiter filter status.
- A “mic check” workflow.
- Routing presets.

### Stream health

Show live:

- Streaming status.
- Bitrate.
- Dropped frames.
- Render/encoding lag if obtainable.
- Recording status.
- Remaining disk space on recording volume.
- OBS reconnect/error state.

Create a large warning banner only when operator action is needed.

### Studio Mode

Support Preview/Program workflows:

- Preview scene.
- Program scene.
- Transition button.
- Transition type and duration.
- Take/Cut controls.

This matters for producers and higher-end streams.

### Macro engine

Move beyond hard-coded smart modes. A macro should support:

- Multiple OBS actions.
- Delays.
- Conditions.
- Scene/source/audio changes.
- Sound cues.
- Confirmation rules.
- Reusable variables.
- Optional platform actions later.

Example:

```text
“Go to BRB”
1. Fade music to 35%
2. Mute mic
3. Switch to BRB
4. Play sting
5. Wait 500 ms
6. Start BRB timer
```

### Run of show / cue sheet

The product should understand an entire stream as a show.

A Show can contain:

- Title and goal.
- Script / notes.
- Segments.
- Expected duration.
- Scene per segment.
- Sound cue per segment.
- Links/media needed.
- Sponsor reads.
- Calls to action.
- Breaks.
- Closing checklist.

The operator should have **Previous Cue / Current Cue / Next Cue** on the dashboard.

### Teleprompter / presenter mode

Allow a script or outline to be displayed as a clean presenter view on a phone/tablet, with AI-generated short cue cards and adjustable text size/scroll speed.

### Preflight checker

Before going live, one button should verify:

- OBS connected.
- Correct scene selected.
- Camera source available.
- Main mic available and not accidentally muted.
- Desktop/game audio state.
- Green-screen scene/source presence if configured.
- Recording destination has adequate free space.
- Stream output configured.
- Optional test recording completed.

The AI should explain failures and offer a repair action.

### Undo / snapshots

Before AI or smart setup makes structural changes, capture a lightweight scene/source configuration snapshot when possible. Allow “Undo last studio change” for operations we can safely reverse.

### Profiles and templates

Creators need profiles such as:

- Gaming.
- Podcast/interview.
- Just Chatting.
- Tutorial/screen share.
- Reaction.
- Vertical/short-form.
- Dual-PC production.

Templates should map to the creator’s existing named sources instead of forcing source names.

## AI copilot — what it should become

The AI should be available as both a dedicated workspace and a **floating, dismissible assistant** from any screen.

It should help with three separate jobs:

### Before the stream

- Turn an idea into a run-of-show.
- Review a pasted/uploaded script.
- Suggest scenes and transitions.
- Build a cue sheet.
- Identify missing assets.
- Perform preflight checks.
- Repair source mappings.
- Create safe macros from natural language.

### During the stream

- Answer “what scene am I on?”
- Move to the next planned segment.
- Surface the next talking point.
- Fire a favorite sound.
- Fix a muted source.
- Switch scenes after confirmation rules are satisfied.
- Track elapsed/remaining segment time.

### After the stream

- Summarize the run.
- Record operator notes/issues.
- Suggest scene/macro improvements.
- Create a checklist for the next show.

The assistant should maintain a **show context** separate from raw chat history so important information survives page refreshes and device changes.

## P2 — differentiation opportunities

- Remote producer mode for a trusted second person.
- Stream Deck / MIDI / keyboard integration.
- Twitch / YouTube / Kick chat and event integration.
- Clip markers and replay-buffer controls.
- Sponsor/read timers.
- Guest check-in workflows.
- Multi-camera shot presets.
- Vertical and horizontal simultaneous layouts.
- Creator template marketplace.
- Community macro packs.
- White-label/team studio edition.

## Current prototype limitations to communicate clearly

- Viewer is snapshot-based, not true low-latency video.
- AI actions are limited to implemented server actions; it cannot magically change arbitrary OBS settings.
- Browser microphone recording varies by browser/device codec support.
- Camera/mic auto-detection based on source names is heuristic and can choose the wrong source.
- Local app must remain running for remote control to work.
- A manually configured Cloudflare Tunnel is appropriate for this private installation, not scalable onboarding for the public product.
- PWA/service-worker caching can make releases appear stale unless cache/version strategy is carefully managed.

## Recommended product architecture

Split the code into four logical layers:

1. **OBS Agent** — connects to OBS and exposes a typed command/event protocol.
2. **Cloud API** — accounts, studios, devices, templates, shows, sounds metadata, auth, audit log.
3. **Realtime Gateway** — authenticated routing between web clients and agents.
4. **Web App** — responsive command center, AI, viewer, soundboard, docs, setup.

Within the agent, use a command registry with typed input validation rather than a large switch statement.

## Recommended public-beta milestone

A credible public beta should include:

- Installer for macOS and Windows.
- Account login.
- Pair-agent flow using a one-time code.
- No manual tunnels.
- Stable reconnect and clear connection diagnostics.
- Dashboard customization.
- Favorite sounds.
- Floating AI assistant.
- Run-of-show + script context.
- Preflight checker.
- Snapshot viewer.
- Scene/source/audio control.
- Safe macro engine.
- Audit log.
- Automatic updates for the local agent.
- Basic telemetry/crash reporting with clear privacy controls.
- Tests + CI.

## Product principle

The product should not feel like “OBS in a browser.” It should feel like **the operator layer above OBS**.

OBS remains the production engine. OBS Remote should reduce the number of things a creator has to remember, click, troubleshoot, and manually coordinate while live.
