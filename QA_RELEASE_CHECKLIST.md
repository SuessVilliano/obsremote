# OBS Remote V5 — QA & Release Gate

This document defines when the V5 local/studio release candidate is allowed to move to `main` and when a person should be asked to test it on real streaming hardware.

## Rule

Do **not** treat a green browser or unit test as proof that a live production system is flawless. Automated QA can validate deterministic code paths; only a final hardware acceptance pass can validate OBS, capture devices, browser-source audio, real stream services, and device/network behavior together.

The goal is to make the human acceptance pass short, deliberate, and late.

## Gate A — repository integrity

Required:

- No `.env` committed.
- No runtime `data/` committed.
- No uploaded user media committed.
- No API keys or obvious stream keys in tracked source.
- Dependencies install cleanly on supported Node versions.
- Production dependency audit has no high/critical vulnerability.
- V5 package/app/cache versions are coherent.

Automated in `.github/workflows/qa.yml` where possible.

## Gate B — deterministic core behavior

Required unit coverage:

- Numeric clamping.
- input text normalization.
- RTMP/RTMPS validation.
- rejection of embedded RTMP credentials.
- audio extension allow-list.
- audio header/signature checks.
- AES-GCM secret encryption/decryption.
- timing-safe PIN comparison helper.
- playlist reference validation.
- ordered playlist wrapping.
- non-loop stop semantics.
- shuffle non-repeat behavior.
- playlist edit/index recovery.
- OBS target pool selection safety.

## Gate C — static UI wiring

Required:

- every statically queried DOM id exists.
- dynamically generated modal ids are known/intentional.
- every navigation tab maps to a view.
- app/CSS/service-worker release references agree.
- private API/media routes are excluded from PWA caching.
- stream-key UI uses a password input.
- floating AI includes minimize + drag behavior.
- three sound actions fit a three-column action row.

## Gate D — server behavior without OBS

The process must boot and remain healthy even when OBS is unavailable.

Required:

- `/api/health` responds.
- command-center HTML is served.
- protected API rejects missing PIN.
- protected API accepts correct PIN.
- saved RTMP key is not returned by the list API.
- saved RTMP plaintext is not present in `data/destinations.json`.
- fake audio payload with a claimed audio MIME is rejected.
- graceful process shutdown works.

## Gate E — browser end-to-end

Run Chromium against the actual server process at desktop and phone viewport profiles.

Required:

- shell renders.
- dashboard becomes visible.
- Music tab works.
- Destinations tab works.
- AI tab works.
- theme toggles.
- floating AI opens, minimizes, restores, closes.
- mobile menu starts off-canvas.
- mobile menu opens on demand and closes after navigation.

## Gate F — code review risks

Review every changed file for:

- accidental secret exposure.
- duplicate authoritative state.
- reconnect storms.
- stale events from previous OBS sockets.
- unsafe deletion/path traversal.
- browser cache of private data.
- destructive AI actions without guardrails.
- RTMP configuration mutation while live.
- playlist references to deleted/nonexistent tracks.
- multiple music engines for one studio.
- loss of playback state on a phone refresh.

## Gate G — final real-hardware acceptance

Only after Gates A–F are green should the creator be asked to test.

Run this once on the real Mac/OBS setup:

1. **Cold start** — restart OBS Remote, then OBS, and verify the UI settles into one clear Connected state.
2. **Reconnect** — quit/reopen OBS while the dashboard stays open; verify it recovers without refreshing the browser.
3. **Two clients** — open phone + tablet simultaneously; switch a scene on one and verify both update without duplicate behavior.
4. **Program viewer** — confirm a real Program frame appears and updates after scene changes.
5. **Audio** — mute/unmute and change main mic volume; verify UI and OBS agree.
6. **Scenes/sources** — switch scenes and hide/show a source; verify state remains synchronized.
7. **Sound** — play a favorite sound and confirm it reaches OBS/stream audio exactly once.
8. **Music** — install Music bus across scenes, start a playlist, change scenes, and verify uninterrupted single-instance playback.
9. **Scene music rule** — map one playlist to BRB, enter BRB, verify the correct playlist policy is applied once.
10. **RTMP destination** — save a non-production test destination, select it in OBS Remote, and verify OBS output settings update while not live.
11. **Live guard** — while a test stream is active, verify destination mutation is blocked.
12. **Preflight** — run preflight and verify camera/mic/scene/disk/music checks describe actual studio state.
13. **AI inspect** — ask Studio AI what scene is live; verify it reports actual state.
14. **AI safe action** — ask AI to switch to a known test scene; verify one action occurs.
15. **Critical AI wording** — confirm AI does not start/stop stream or recording unless explicitly requested.
16. **Mobile UI** — rotate phone/tablet, open/close the drawer, move/minimize AI on desktop, and verify no controls become unreachable.
17. **PWA refresh** — close and reopen the installed/home-screen app and verify current V5 assets load instead of a stale release.
18. **Cloudflare path** — repeat connection check through the public HTTPS hostname after local LAN path passes.

## Public-product blockers that are not disguised as local bugs

The following are separate product architecture projects, not reasons to pretend the local V5 is broken:

- Real customer accounts, passkeys/MFA, organizations, sessions, roles, and revocation.
- Signed/paired local desktop agent and outbound-only cloud connection.
- OS keychain/credential-store integration.
- True simultaneous multistream relay/fanout.
- Native platform OAuth/API integrations where platforms permit them.
- WebRTC low-latency Program monitor.
- Hosted sound/music storage and quotas.
- Audit log and AI safe/confirm/critical permission tiers.
- Run-of-show persistence across devices and cloud accounts.
- Automatic desktop agent updates, telemetry/crash reporting, and support tooling.

These should be built before calling the service a public commercial launch, even if the local studio build is excellent.

## Release decision

`main` should only receive this release candidate when all automated checks are green and no unresolved P0/P1 code-review defect remains.

The final hardware acceptance pass is the last step before calling V5 stable for the private studio.
