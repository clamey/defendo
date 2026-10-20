# Defendo — Plan

A browser tower defense game with a 70s retro space-monster board game theme.

## Decisions
- **Stack:** Vite + TypeScript, HTML5 Canvas 2D (no engine), Web Audio API (all sounds synthesized), Vitest.
- **Board:** Hex grid (axial coords). Tower on the center hex; enemies spawn from edge hexes.
- **Terrain (M1):** Asteroid (impassable), Nebula (slows enemies). Placement recomputes a BFS flow field toward the tower; placements that fully wall off the tower are rejected.
- **Economy (M1):** None. One free pick per build step.

## Game flow
`Title → Biotype select → Wave (watch) → Build step 1: upgrade or place mechanism → Build step 2: place terrain → next wave … → Victory after wave 5 / Game over`

## Biotypes (enemies are the opposite side)
| | Human Space Warriors | Space Monsters |
|---|---|---|
| Starter tower | Laser Bastion | Brood Spire |
| Placeable mechanism | Sentry Gun | Spitter Pod |
| Enemy they send | Trooper (steady, medium HP) | Crawler (swarming, low HP) |

Build step 1 options: upgrade tower (fire rate / range / damage) or place one mechanism.

## Waves (M1: 5 waves, easy)
Wave *n*: `2 + 2n` enemies, 1.5–2s spawn interval, gentle HP scaling. A headless sim test asserts the starter tower alone clears waves 1–5.

## Visual style
Cream cardboard background, printed hex grid, harvest gold / avocado / burnt orange / brown palette, units as cardboard counters with pictograms, slight print misregistration, chunky 70s display font.

## Sound design (Web Audio synth)
| Event | Humans (clean, square-wave) | Monsters (warbly, triangle/saw + noise) |
|---|---|---|
| Fire | "pew" downward pitch sweep | wet "splorp" (filtered noise + wobbly drop) |
| Hit | short click-tick | squelch |
| Enemy death | 3-note descending arpeggio | gurgle → low growl |
| Wave start | radio chirp + two-tone klaxon | rising croak/howl |
| Wave clear | ascending fanfare arpeggio | triumphant chittering trill |
| Tower damaged | alarm buzz | pained low moan |
| Place/upgrade | relay "ka-chunk" | organic "blorp" |

The sound comes from whoever makes it: your tower uses your biotype's voice, enemies use theirs. Mute toggle; audio unlocked on first click.

## Code layout
```
src/
  main.ts            game loop (fixed timestep) + scene/state machine
  hex.ts             axial coords, neighbors, pixel<->hex
  board.ts           tiles, terrain, placement validation
  pathing.ts         flow field toward tower
  entities/          tower, mechanism, enemy, projectile
  waves.ts           wave generation
  biotypes.ts        per-side data (stats, colors, sounds)
  audio/synth.ts     Web Audio sound recipes
  render/            board, counters, HUD, retro styling
  ui/                title, biotype pick, build-phase panels
tests/               hex, pathing, waves, auto-sim
```

## Milestone 1 acceptance
1. Pick a biotype; the board loads with a few terrain tiles.
2. Wave 1 attacks; the tower auto-shoots every enemy.
3. The build phase works: upgrade or mechanism, then one terrain tile.
4. Victory screen after wave 5; each biotype sounds different.

## Later milestones (rough)
- **M2:** economy, more mechanisms, a second enemy type per side.
- **M3:** bosses, more terrain effects, map choice.
- **M4:** polish: saving progress, difficulty settings, music.
