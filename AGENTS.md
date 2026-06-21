# Agent Instructions

## Project Shape

This is a zero-dependency HTML5 Canvas badminton game. Keep it lightweight: no build step, no framework, and no runtime dependency unless the user explicitly asks for a larger architecture change.

The main playable surface is:

- `index.html` for markup and controls.
- `styles.css` for page, HUD, menu, and touch-control styling.
- `game.js` for gameplay state, physics, AI, drawing, assets, and input.
- `verify-game.js` for the baseline self-check.

Supporting docs:

- `README.md`
- `CHANGELOG.md`
- `docs/GAME_DIRECTION.md`
- `docs/PROGRESS.md`
- `docs/ITERATION_PLAN.md`

## Product Priorities

- Preserve "open and play": opening `index.html` directly should remain viable.
- Prioritize readability: shuttlecock, players, racket, net, score, serve state, and win condition must be clear at a glance.
- Prioritize feel over feature count: hit timing, jump height, smash speed, drop shots, bounces, and AI difficulty matter more than adding systems.
- Keep both keyboard play and mobile touch controls working.
- Maintain a fast iteration loop with small, understandable changes.

## Gameplay Changes

When changing court size, ground position, net position, player reach, ball physics, or visual court layout, check the related gameplay constants too. Visual court changes should not drift away from collision, landing, player bounds, AI prediction, or scoring behavior.

Important areas in `game.js`:

- Canvas dimensions and layout constants near the top.
- `sideBounds`, `updatePlayer`, `racketPoint`, `hitBird`, `updateBird`, and `predictLandingX`.
- `drawCourt`, `drawPlayer`, `drawBird`, HUD/message drawing, and particle drawing.

Keep gameplay parameters easy to tune. If a change introduces several related magic numbers, prefer naming or grouping them close to existing constants.

## Visual Changes

Gameplay readability comes first. Backgrounds should support the action, not compete with it.

- Keep background contrast, saturation, and detail lower than players, shuttlecock, and active feedback.
- Be careful with bright white court lines, net lines, and background lights; they can hide the shuttlecock and racket.
- Preserve team color clarity: blue left player, red right player.
- Avoid UI or court elements that cover the shuttlecock during normal play.
- Check mobile and desktop proportions when touching layout or text.

For generated assets under `assets/generated/`, keep existing fallbacks intact unless the user asks to remove them.

## Verification

Run this after code changes:

```bash
node verify-game.js
```

For visual, layout, or interaction changes, also open the game in a browser or local static server and inspect the result:

```bash
python3 -m http.server 5173
```

Then visit `http://localhost:5173/`.

If a server is already using that port, use another available port.

## Documentation

When changing gameplay rules, controls, modes, visual feedback, assets, publishing flow, or current project status, check whether these need updates:

- `README.md`
- `CHANGELOG.md`
- `docs/PROGRESS.md`
- `docs/ITERATION_PLAN.md`

Keep docs concise and factual. Do not update docs for tiny internal refactors unless the user-facing behavior or project status changed.

## Editing Style

- Keep changes scoped and sympathetic to the existing single-file Canvas structure.
- Do not introduce unrelated refactors while tuning gameplay or visuals.
- Prefer clear names over comments; add comments only when a drawing or physics block is not obvious.
- Keep files ASCII unless there is already a clear reason to use non-ASCII text.
- Do not revert unrelated user changes in the worktree.
