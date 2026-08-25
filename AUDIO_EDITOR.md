# Audio clip editing — V5.1 RC

V5.1 adds non-destructive clip editing for both soundboard audio and playlist music.

## Soundboard

Each uploaded sound can define:

- clip start
- clip end
- fade in
- fade out

The editor renders a browser-decoded waveform and draggable start/end handles. Saving the clip stores timing metadata only; the original audio file is not rewritten. The OBS soundboard player seeks to the saved start, stops at the saved end, and applies fades in real time. A Stop control can immediately stop active soundboard playback.

## Music

Music tracks use the same trim metadata. The persistent OBS music player honors the saved start/end range and fades whenever the track is played manually, from a playlist, or through a scene-linked playlist. The dashboard includes a dedicated Stop button in addition to play/pause/previous/next.

## Controller interaction

The dashboard retains a tactile remote-console feel. Scene, source, sound, stream, record, music, and audio controls use short press travel, confirmation glow, on-air state illumination, hover feedback, and optional device vibration where the browser supports the Vibration API. Reduced-motion preferences disable the motion effects.
