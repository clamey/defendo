// Terrain tiles in the same rough brush-ink style as the units: jagged inked asteroids with
// spot blacks and craters, and billowing nebula clouds crackling with black-dot cosmic
// energy (the 70s Marvel "Kirby krackle").
// Functions draw centered at (0,0); `s` is the hex size in pixels.

import { INK, type Pt, type Rng, brush, ellipsePts, feather, fill, raggedOutline, resample, rng, rough, shade, wrinkles } from './ink';

const ROCK = '#8a6646';
const ROCK_LIGHT = '#b08a5e';
const ROCK_SHADOW = '#4a3220';
const NEBULA = '#a8457a';
const NEBULA_GLOW = '#e07ab0';
const NEBULA_COOL = '#4a6a8a';
const NEBULA_DEEP = '#6a3a7a';
const CREAM = '#f3e7c9';

/** Stable seed for a hex so its art never changes between redraws. */
export const hexSeed = (q: number, r: number): number => ((q * 73856093) ^ (r * 19349663)) >>> 0;

/** A lumpy rock outline with jagged facets. */
function rockShape(cx: number, cy: number, radius: number, r: Rng): Pt[] {
  const n = 9;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const rr = radius * (0.72 + r() * 0.4);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85] as Pt;
  });
}

function drawRock(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, s: number, r: Rng, detail: boolean): void {
  const pts = rough(rockShape(cx, cy, radius, r), s, r, 0.05);
  fill(ctx, pts, ROCK);
  // Lit facet on the upper left.
  fill(ctx, rough(ellipsePts(cx - radius * 0.3, cy - radius * 0.3, radius * 0.38, radius * 0.28, 7), s, r, 0.04), ROCK_LIGHT);
  shade(ctx, pts, s, r, ROCK_SHADOW, 0.95);
  if (detail) {
    // Craters: dark bowl with a lit lower-right rim.
    for (let i = 0; i < 2; i++) {
      const x = cx + (r() - 0.5) * radius * 0.8;
      const y = cy + (r() - 0.6) * radius * 0.6;
      const cr = radius * (0.14 + r() * 0.1);
      fill(ctx, rough(ellipsePts(x, y, cr, cr * 0.75, 8), s, r, 0.02), ROCK_SHADOW);
      brush(ctx, [[x - cr * 0.6, y + cr * 0.6], [x, y + cr * 0.85], [x + cr * 0.8, y + cr * 0.3]], cr * 0.35, r, ROCK_LIGHT);
    }
    // Cracks.
    wrinkles(
      ctx,
      [
        [[cx - radius * 0.1, cy - radius * 0.65], [cx + radius * 0.05, cy - radius * 0.3], [cx - radius * 0.05, cy]],
        [[cx + radius * 0.6, cy + radius * 0.1], [cx + radius * 0.3, cy + radius * 0.2]],
      ],
      s * 0.03,
      r,
    );
    feather(ctx, pts, radius * 0.4, s * 0.035, r);
  }
  raggedOutline(ctx, pts, s * 0.06, r);
}

/** Asteroid: a big jagged rock with a couple of smaller ones and drifting pebbles. */
export function drawAsteroid(ctx: CanvasRenderingContext2D, s: number, seed: number): void {
  const r = rng(seed);
  // Cast shadow on the map.
  fill(ctx, rough(ellipsePts(s * 0.12, s * 0.18, s * 0.62, s * 0.5, 10), s, r, 0.06), 'rgba(10, 6, 20, 0.5)');
  drawRock(ctx, s * 0.38, -s * 0.38, s * 0.2, s, r, false);
  drawRock(ctx, -s * 0.05, 0, s * 0.62, s, r, true);
  drawRock(ctx, -s * 0.42, s * 0.42, s * 0.18, s, r, false);
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    const d = s * (0.6 + r() * 0.2);
    fill(ctx, rough(ellipsePts(Math.cos(a) * d, Math.sin(a) * d, s * 0.05, s * 0.04, 5), s, r, 0.01), INK);
  }
}

/** A puffy, scalloped cloud outline. */
function cloudShape(cx: number, cy: number, rad: number, r: Rng): Pt[] {
  const n = 28;
  const bumps = 5 + Math.floor(r() * 3);
  const phase = r() * Math.PI;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const puff = 0.82 + 0.22 * Math.abs(Math.sin(a * bumps * 0.5 + phase));
    return [cx + Math.cos(a) * rad * puff, cy + Math.sin(a) * rad * puff * 0.8] as Pt;
  });
}

/** Kirby krackle: a cluster of solid black dots of varied sizes. */
function krackle(ctx: CanvasRenderingContext2D, cx: number, cy: number, spread: number, r: Rng): void {
  ctx.fillStyle = INK;
  const n = 6 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = spread * Math.sqrt(r());
    const dot = spread * (0.06 + r() * r() * 0.3);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, dot, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Nebula: a billowing cosmic cloud with swirling ink currents and crackling energy.
 * The caller clips to the hex; lobes spill to the edges so tiles read as a filled field.
 */
export function drawNebula(ctx: CanvasRenderingContext2D, s: number, seed: number): void {
  const r = rng(seed);
  // Glowing haze filling the hex.
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
  g.addColorStop(0, 'rgba(224, 122, 176, 0.55)');
  g.addColorStop(1, 'rgba(90, 138, 106, 0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(-s, -s, s * 2, s * 2);

  // Billowing cloud lobes, back to front.
  const lobes: [number, number, number, string][] = [
    [-s * 0.45, -s * 0.35, s * 0.45, NEBULA_COOL],
    [s * 0.45, s * 0.3, s * 0.45, NEBULA_DEEP],
    [s * 0.35, -s * 0.35, s * 0.42, NEBULA],
    [-s * 0.4, s * 0.38, s * 0.42, NEBULA_DEEP],
    [0, 0, s * 0.42, NEBULA_GLOW],
  ];
  for (const [x, y, rad, color] of lobes) {
    const lobe = rough(cloudShape(x + (r() - 0.5) * s * 0.1, y + (r() - 0.5) * s * 0.1, rad, r), s, r, 0.03);
    ctx.globalAlpha = 0.85;
    fill(ctx, lobe, color);
    ctx.globalAlpha = 1;
    shade(ctx, lobe, s, r, 'rgba(43, 37, 64, 0.5)', 1.0, false);
    feather(ctx, lobe, rad * 0.3, s * 0.02, r, 4);
    raggedOutline(ctx, lobe, s * 0.025, r);
  }

  // Swirling current through the core.
  const swirl: Pt[] = [];
  for (let a = 0; a < Math.PI * 2.4; a += 0.3) {
    const rad = (a / (Math.PI * 2.4)) * s * 0.42;
    swirl.push([Math.cos(a + seed) * rad, Math.sin(a + seed) * rad * 0.8]);
  }
  brush(ctx, resample(swirl, false, s * 0.08), s * 0.05, r, CREAM);

  // Crackling cosmic energy.
  krackle(ctx, -s * 0.42, -s * 0.05, s * 0.26, r);
  krackle(ctx, s * 0.38, -s * 0.42, s * 0.22, r);
  krackle(ctx, s * 0.15, s * 0.5, s * 0.24, r);
  krackle(ctx, s * 0.55, s * 0.1, s * 0.16, r);

  // A few hot pinpoint stars inside the cloud.
  for (let i = 0; i < 5; i++) {
    const x = (r() - 0.5) * s * 1.4;
    const y = (r() - 0.5) * s * 1.2;
    brush(ctx, [[x - s * 0.06, y], [x + s * 0.06, y]], s * 0.03, r, CREAM);
    brush(ctx, [[x, y - s * 0.06], [x, y + s * 0.06]], s * 0.03, r, CREAM);
  }
}
