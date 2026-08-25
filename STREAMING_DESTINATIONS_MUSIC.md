# OBS Remote — Streaming Destinations & Music Automation

## Goal

OBS Remote should become the control layer for **where the show goes** and **what audio plays during the show** — not just a scene remote.

The creator should be able to connect supported platforms directly where OAuth/API access exists, or add any service that accepts an RTMP/RTMPS destination and stream key.

## Streaming Destinations

### Destination types

Support two connection models:

1. **Native platform connections**
   - Twitch
   - YouTube Live
   - Kick where platform APIs/permissions allow
   - Other platforms with usable creator APIs

2. **Custom RTMP / RTMPS destinations**
   - Viloud
   - Instagram Live Producer when the account has access to an RTMP/RTMPS stream URL and key
   - TikTok LIVE when the creator has stream-key/encoder access
   - Private CDNs
   - Event platforms
   - Company livestream endpoints
   - Any service exposing an RTMP/RTMPS server + stream key

### Destination object

Each saved destination should include:

```json
{
  "id": "dest_123",
  "name": "Twitch Main",
  "type": "twitch | kick | youtube | instagram | tiktok | custom_rtmp",
  "enabled": true,
  "serverUrl": "rtmps://…",
  "streamKeySecretRef": "secret://…",
  "profile": "1080p60",
  "orientation": "horizontal | vertical",
  "titleTemplate": "{show_title}",
  "category": "",
  "tags": [],
  "autoStart": false
}
```

Never send reusable stream keys to browsers. Keys belong in the local agent secret store or encrypted cloud vault.

### Destination manager UI

Add a **Destinations** workspace with:

- Connect platform
- Add Custom RTMP
- Test connection
- Enable/disable destination
- Rename
- Rotate/update key
- Copy diagnostic information without revealing the key
- Resolution/FPS/bitrate profile
- Horizontal vs vertical output mapping
- Current live/offline/failed state
- Last error

The main dashboard should show compact destination chips such as:

```text
Twitch   ● LIVE
Kick     ● LIVE
TikTok   ○ OFF
Viloud   ● LIVE
```

### Multistream architecture

Do not make OBS encode separately for every platform if avoidable.

Recommended public-product architecture:

```text
OBS
 |
 | one high-quality contribution feed
 v
OBS Remote Agent / Relay
 |
 +--> Twitch
 +--> Kick
 +--> YouTube
 +--> Custom RTMP
 +--> Vertical pipeline -> TikTok / Instagram
```

For the private prototype, destination forwarding can initially be implemented locally through an FFmpeg-based relay or an OBS multiple-output integration. For public scale, a managed cloud restream layer is preferable so creators do not multiply their home upload bandwidth by the number of destinations.

### Platform limitations

The app must not promise that every account can stream to every named platform.

Platform access can depend on account eligibility and current platform policy. Therefore:

- Always offer **Custom RTMP/RTMPS** as the universal fallback when the platform provides encoder credentials.
- Detect and explain unavailable native integrations.
- Never scrape or bypass platform restrictions to obtain a stream key.
- Show platform-specific requirements before enabling a destination.
- Surface multistream-policy warnings where relevant.

### Per-platform metadata

Where APIs allow it, manage from OBS Remote:

- Stream title
- Description
- Category/game
- Tags
- Thumbnail
- Privacy
- Scheduled event
- Chat mode

Where APIs do not expose a function, provide a direct setup checklist instead of pretending it is automated.

## Output Profiles

Creators should save reusable profiles:

- 1080p60 Gaming
- 1080p30 Talk Show
- 720p Mobile-safe
- 9:16 Vertical Live
- Low-bandwidth backup

A Show can select one profile per destination.

Long-term, support simultaneous horizontal and vertical compositions rather than merely cropping one feed.

## Music Library

Create a first-class **Music** workspace separate from one-shot Sounds.

### Music library

Allow upload/import of creator-owned/licensed audio:

- MP3
- WAV
- M4A
- FLAC where decode support exists
- OGG

Metadata:

- Title
- Artist/label text entered by creator
- Duration
- BPM optional
- Tags
- Mood
- Energy
- Intro/outro suitability
- Default volume
- Fade-in duration
- Fade-out duration
- Loop allowed
- License/source notes

The product should clearly remind creators that they are responsible for music rights on the platforms they use.

## Playlists

Users should be able to build named playlists such as:

- Pre-show
- Gameplay Rotation
- Just Chatting
- BRB
- Podcast Bed
- Outro

Playlist behavior:

- Ordered
- Shuffle
- Loop playlist
- Loop current song
- Stop after playlist
- Start at a specific track
- Crossfade
- Gapless where possible
- Per-track volume override

## Scene-linked music

A scene or show segment can have a music policy:

```text
Starting Soon
  Playlist: Pre-show
  Shuffle: on
  Volume: 55%
  Fade in: 2 sec

Game + Facecam
  Playlist: Gameplay Rotation
  Continue existing track: yes
  Volume: 22%

BRB
  Playlist: BRB
  Restart playlist: no
  Fade from current track: 1.5 sec

Full Camera
  Music: pause
```

Scene changes should support these policies:

- Keep playing
- Pause
- Resume
- Stop
- Switch playlist
- Fade to target volume
- Duck while microphone is active
- Duck while a sound effect is playing

## Timed music / show cues

Music automation should work through the Run of Show.

Examples:

```text
00:00  Start pre-show playlist
05:00  Fade pre-show music to 20%
05:10  Switch to Full Camera
18:00  Play sponsor bumper
18:08  Resume background playlist
45:00  Move to BRB playlist
50:00  Return to gameplay music
End    Play outro playlist
```

Support both:

- Relative time from stream/show start
- Cue-triggered timing (when operator presses Next Cue)

Do not rely exclusively on wall-clock time because live shows frequently run long or short.

## Dashboard Music Widget

The main control dashboard should include a compact player:

```text
NOW PLAYING
Midnight Drive — 02:14 / 04:02
[Back] [Play/Pause] [Next]
Volume 24%      Playlist: Gameplay
```

Also include:

- Current track
- Next track
- Playlist
- Progress
- Volume
- Fade status
- Shuffle/loop indicator
- Stop music

The full Music tab handles library and playlist management.

## AI + Music

The AI assistant should be able to help plan music but should not invent licensing status.

Example requests:

- “Make a 20-minute pre-show playlist from my upbeat tracks.”
- “Use calmer music during Just Chatting and high-energy tracks during gameplay.”
- “Fade music down whenever I switch to Full Camera.”
- “Add my intro song at the beginning of every Gaming show.”
- “I have a 90-minute stream; arrange my saved playlists so songs do not repeat too quickly.”

AI actions that modify playlists should be previewable before applying large changes.

## Sounds vs Music

Keep these concepts separate:

**Sounds**
- One-shot effects
- Voice drops
- Stingers
- Alerts
- Short clips

**Music**
- Full tracks
- Playlists
- Continuous playback
- Scene policies
- Scheduling
- Crossfades

Favorite one-shot Sounds stay on the main dashboard as quick pads. Music gets its own compact Now Playing controller.

## Audio engine requirements

The current Browser Source soundboard approach is sufficient for a prototype but the public product should use a more deterministic audio playback layer.

Needed features:

- Dedicated music bus
- Dedicated effects bus
- Independent volume
- Fade/crossfade engine
- Queue
- Pause/resume state
- Persistent playback state
- Automatic recovery after agent restart
- Track completion events
- Ducking rules
- Accurate duration/progress

The agent should own playback state rather than a random browser tab.

## Reliability rules

- Never start music twice because two phones are connected.
- Only one authoritative playback engine per studio.
- UI clients subscribe to playback state.
- Scene-trigger automations must be idempotent.
- Reconnecting a phone must not restart the playlist.
- Restarting the agent should restore saved playlist state when configured.

## Public product opportunity

Streaming destinations + show planning + scenes + music + effects + AI makes OBS Remote much more than a remote.

The desired creator workflow becomes:

```text
Create Show
  -> choose destinations
  -> choose horizontal/vertical outputs
  -> load script/content
  -> choose scene template
  -> choose music playlists
  -> run preflight
  -> Go Live
  -> operate everything from one dashboard
```

That is the direction to optimize for.