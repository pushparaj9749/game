# 🔥 FIRE ZONE — Battle Royale

A **Free Fire inspired top-down battle royale** that runs entirely in the browser.
No build step, no dependencies, no assets — just HTML5 Canvas + plain JavaScript (ES modules).

![30 players · one winner](https://img.shields.io/badge/players-30-red) ![no dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

## Play

```bash
npm start          # serves on http://localhost:3000
```

or simply open `index.html` with any static file server (ES modules need http://, not file://):

```bash
python3 -m http.server 8080
```

## What's inside

| Feature | Details |
| --- | --- |
| **Battle royale loop** | You + 29 bots drop into a 4200×4200 island, last one standing wins a **BOOYAH!** |
| **Shrinking safe zone** | 5 phases, damage over time outside, live timer + next-circle preview on the minimap |
| **Loot** | 6 weapons (M500 pistol, MP40 SMG, AK47, SCAR, M1014 shotgun, AWM sniper), ammo, medkits, shields |
| **Weapons feel** | Per-gun fire rate, spread, pellets, recoil, reload, screen shake, muzzle flash, tracers, damage numbers |
| **Combat** | Bullets with travel time, wall collisions, line-of-sight checks, hit sparks, blood particles |
| **Bots AI** | Loot hunting, zone rotation, target acquisition, strafing, lead prediction, aim jitter, medkit use, weapon upgrades |
| **World** | Procedural districts, buildings with doors and interior walls, roads, forests, bushes, crates, rocks |
| **HUD** | Minimap, alive/kill counters, kill feed, health + shield bars, ammo card, zone warnings, toasts |
| **Audio** | Fully procedural WebAudio SFX (gunfire per weapon, hits, reloads, footsteps, Booyah jingle) — no audio files |
| **Screens** | Main menu with name entry, end screen with rank / kills / damage / survival time |

## Controls

| Key | Action |
| --- | --- |
| `W A S D` | Move |
| `Mouse` | Aim |
| `Left Click` | Shoot |
| `Shift` | Sprint |
| `R` | Reload |
| `F` | Use medkit |
| `1` / `2` | Switch weapon slot |
| `M` | Mute / unmute |

Walk over loot to pick it up automatically — weapons replace your current slot if it's a better tier.

## Project layout

```
index.html        markup: canvas, HUD, menu, end screen
styles.css        HUD + menu styling
server.js         zero-dependency static server (npm start)
src/config.js     weapons, zone phases, names, tuning
src/world.js      procedural map generation, collision grid, raycasts
src/entities.js   Fighter / Player / Bot / Bullet logic
src/zone.js       shrinking safe-zone state machine
src/render.js     canvas renderer (world, fighters, effects, post FX)
src/hud.js        DOM HUD + minimap
src/audio.js      procedural WebAudio sound engine
src/input.js      keyboard / mouse / touch input
src/main.js       game loop, combat resolution, pickups, scoring
test/             headless smoke + autoplay balance tests (node, no browser needed)
```

## Tests

```bash
node test/smoke.mjs        # single match, prints per-second stats
MATCHES=5 node test/autoplay.mjs   # autopilot plays full matches, prints win rate / avg placement
```

Both run headless in Node with a stubbed DOM/canvas — useful for catching crashes and checking balance.

## Tuning

Most difficulty/balance knobs live in `src/config.js` (`WEAPONS`, `ZONE_PHASES`, `BOT_COUNT`) and in
`src/entities.js` (`aimJitter`, reaction timers). Player damage taken from bots is scaled by `0.7` in
`src/main.js → damageFighter` — raise it to 1 for full bot damage.
