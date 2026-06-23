# Changelog

## Unreleased

- Initial playable Canvas prototype for a stickman badminton game.
- Added single-player AI, local two-player mode, scoring, serve flow, difficulty presets, play style presets, mobile controls, landing assist, sound toggle, and local preference persistence.
- Improved procedural art direction: richer court rendering, team-colored stickman accents, racket swing trails, shuttlecock motion trails, refreshed HUD/menu styling, and polished mobile touch controls.
- Added AIART-generated pixel art assets for the court backdrop, shuttlecock sprite, and smash burst VFX with Canvas fallbacks.
- Tuned play feel with swing timing quality, contact-point-based shot variation, tighter drop shots, smash recovery, hit-stop feedback, and more varied AI shot choices.
- Added short input buffering for jump/swing/smash and mobile swipe-down drop shots from the swing buttons.
- Added a standalone start screen with polished mode cards, match settings, and a formal preview treatment using generated court art.
- Added a lightweight multiplayer mode using manual WebRTC room-code exchange, with host-authoritative scoring and remote red-team input sync.
- Added a room-code flow for same-origin room play while preserving the manual WebRTC pairing fallback.
- Reworked room mode around a refreshable room list with create/join actions, optional WebSocket room service, and local same-origin fallback.
- Added a zero-dependency `room-server.js` for cross-device rooms and `build-single-html.js` for generating a distributable single HTML frontend.
- Renamed the game to `一拍定胜负`.
- Lowered the gameplay net height by another 20% so rallies and serves have more clearance.
- Changed the strong-action key so ground presses scoop/lift the shuttle while airborne presses still attempt smashes.
- Lowered the net collision/drawing height and raised long-serve arcs so standard serves clear the net more reliably.
- Added rally heat milestones, visible multi-hit counters, and stronger feedback for extended exchanges.
- Improved AI shot planning with pressure escapes, net pulls, back-court pushes, and more varied serve choices.
- Added short serves and fast long serves while keeping standard high serves available.
- Kept saved online preferences from taking over the default start screen, so returning players land back on quick solo/local play.
- Smoothed guest-side multiplayer snapshots with rally reset snapping, remote player extrapolation, and restored guest-side hit, net, and scoring sound feedback.
- Tuned shot feel so high attacks become clearer downward smashes, low attacks fall back to drives, drop shots land tighter, and mobile swipe-down drop inputs no longer stick.
