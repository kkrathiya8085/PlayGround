# Neon Serpent

A precision neon arcade snake game built as a single-page, dependency-free web app.

![Neon Serpent](https://img.shields.io/badge/status-playable-b7ff62?style=flat-square&labelColor=08120f)

**Eat the light. Own the grid.**

Neon Serpent is a polished take on the classic snake formula: a 24 × 24 neon grid, escalating velocity, a four-second Flow chain multiplier, and rare Pulse Cores that appear every five nodes and expire if you hesitate. The whole experience is rendered on a hand-tuned canvas with procedural glow, particles, screen shake, and synthesized arcade audio.

## Features

- Responsive arcade cabinet UI with desktop telemetry panels and a compact mobile HUD
- Smooth grid-stepped movement, rounded/serpentine body rendering, and expressive head animation
- Flow multiplier up to ×5, Pulse Cores, persistent local best score, and a live local record
- Procedural Web Audio sound effects with a persistent mute setting
- Keyboard, WASD, swipe, and on-screen D-pad controls
- Pause/resume, restart, help overlay, reduced-motion support, and accessible live status messages
- No runtime dependencies, no build step, bundled open-source fonts

## Run

The project is static. From the repository root:

```sh
./start.sh
```

Or serve it with any static file server:

```sh
python3 -m http.server 3002
```

Then open `http://localhost:3002`.

## Controls

| Action | Input |
| --- | --- |
| Steer | Arrow keys / WASD / swipe / D-pad |
| Pause or resume | `P`, `Esc`, `Space`, or the pause control |
| Restart | `R` from the game-over or pause screen |
| Mute | `M` or the sound toggle |

## Project files

- `index.html` — app shell, HUD, overlays, and game screen structure
- `styles.css` — responsive layout, visual system, motion, and overlay styling
- `game.js` — canvas renderer, game loop, input, audio, effects, and persistence
- `assets/fonts/` — bundled Space Grotesk and IBM Plex Mono typefaces with their OFL licenses

## Typefaces

Space Grotesk and IBM Plex Mono are licensed under the SIL Open Font License 1.1. License texts are included in `assets/fonts/`.

---

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://go.ondev.store/).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://go.ondev.store/kkrathiya8085/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/kkrathiya8085/PlayGround)

- 🎮 [Open the project](https://go.ondev.store/kkrathiya8085/PlayGround).
- ✨ [Remix this project](https://go.ondev.store/kkrathiya8085/PlayGround?remix=1).
- 💻 [Explore the source](https://github.com/kkrathiya8085/PlayGround).
- 🛠️ [Check build runs](https://github.com/kkrathiya8085/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/kkrathiya8085/PlayGround/issues).
- 👤 [Explore the creator's projects](https://go.ondev.store/kkrathiya8085).
- 🌍 [Create with OMGithub](https://go.ondev.store/).
<!-- omgithub:readme:end -->
