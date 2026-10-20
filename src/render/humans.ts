// Human Space Warrior drawings: a ragtag colonial militia in 70s space-opera style —
// leather flight jackets, dusters, patched coveralls, scarves, goggles, berets and
// scavenged gear — inked in the same rough brush style as the monsters.
// Every trooper is assembled from mismatched parts, and varies in skin tone and hair.
// All functions draw centered at (0,0); `s` is the half-width in pixels.

import { INK, type Pt, type Rng, brush, ellipsePts, feather, fill, raggedOutline, resample, rng, rough, shade, wrinkles } from './ink';

const GOLD = '#e3b448';
const BRASS = '#c9a043';
const GUNMETAL = '#4a505c';
const GLASS = '#2f6f8f';
const GLINT = '#bfe3f0';
const OLIVE_DRAB = '#7b8250';
const PLATE = '#a89a72';
const RUST = '#9a4a2a';
const SANDBAG = '#c8b080';
const TAPE = '#e6dcc0';
const BOOT = '#3a2618';
/** Translucent shadow that reads over any garment color. */
const CLOTH_SHADOW = 'rgba(40, 28, 60, 0.45)';
/** Dark chit face behind the player's human pieces. */
export const HUMAN_CHIT = '#1d2c44';

// ---- Crew: skin and hair ----

interface Skin {
  base: string;
  shadow: string;
}

const SKINS: Skin[] = [
  { base: '#f1c9a5', shadow: '#c99872' },
  { base: '#d9a07a', shadow: '#a8714e' },
  { base: '#b07a4f', shadow: '#7d5133' },
  { base: '#8a5634', shadow: '#5e3720' },
  { base: '#5e3a22', shadow: '#3b2312' },
];
const HAIR_COLORS = ['#1d140e', '#4a2f1a', '#2a1d14', '#a8692e', '#c9a25a', '#7d3b1e'];
/** Darker skin tones draw from the darker hair colors (the first three) so pairings look natural. */
const DARK_HAIR = 3;

type HairStyle = 'crop' | 'afro' | 'ponytail' | 'bun' | 'braids' | 'long' | 'bald';
const HAIR_STYLES: HairStyle[] = ['crop', 'afro', 'ponytail', 'bun', 'braids', 'long', 'bald'];

type Headgear = 'none' | 'goggles' | 'headband' | 'beret' | 'aviator' | 'beanie' | 'helmet';
const HEADGEAR: Headgear[] = ['none', 'goggles', 'headband', 'beret', 'aviator', 'beanie', 'helmet'];
/** Big hair only gets headgear that sits on or around it. */
const BIG_HAIR_HEADGEAR: Headgear[] = ['none', 'goggles', 'headband'];

export interface Crew {
  skin: Skin;
  hair: string;
  style: HairStyle;
  beard: boolean;
  headgear: Headgear;
  headgearColor: string;
}

const pick = <T,>(r: Rng, items: readonly T[]): T => items[Math.floor(r() * items.length)];

const HEADGEAR_COLORS = ['#7a2e34', '#6b7a3a', '#d4a23a', '#3f7a7a', '#b0502a', '#4a6a8a'];

/** Deterministic crew member for a variant number (e.g. an enemy id). */
export function crewFor(variant: number): Crew {
  const r = rng(Math.abs(Math.floor(variant)) * 7919 + 11);
  const skinIndex = Math.floor(r() * SKINS.length);
  const style = pick(r, HAIR_STYLES);
  const bigHair = style === 'afro' || style === 'bun';
  return {
    skin: SKINS[skinIndex],
    hair: HAIR_COLORS[Math.floor(r() * (skinIndex >= 3 ? DARK_HAIR : HAIR_COLORS.length))],
    style,
    beard: (style === 'crop' || style === 'bald' || style === 'long') && r() < 0.5,
    headgear: pick(r, bigHair ? BIG_HAIR_HEADGEAR : HEADGEAR),
    headgearColor: pick(r, HEADGEAR_COLORS),
  };
}

// ---- Loadout: clothes, gear, weapon ----

type Coat = 'jacket' | 'vest' | 'duster' | 'coverall' | 'sweater';

const COAT_COLORS: Record<Coat, string[]> = {
  jacket: ['#7a4a2a', '#5a3a24', '#8a5a32'],
  vest: ['#c2a06a', '#6b7a3a', '#7a2e34', '#4a6a8a'],
  duster: ['#b89a6a', '#8a7050', '#6a5a48'],
  coverall: ['#6b7a3a', '#d4a23a', '#b0502a', '#3f7a7a'],
  sweater: ['#7a2e34', '#d4a23a', '#3f7a7a', '#c2a06a'],
};
const SHIRT_COLORS = ['#e6dcc0', '#d4a23a', '#3f7a7a', '#b0502a', '#4a6a8a'];
const PANTS_COLORS = ['#5a4632', '#4a5a3a', '#3e5470', '#8a7a5a'];
const SCARF_COLORS = ['#c8352b', '#d4a23a', '#3f7a7a', '#e6dcc0', '#7a2e34'];

interface Loadout {
  crew: Crew;
  coat: Coat;
  coatColor: string;
  shirt: string;
  pants: string;
  rolledSleeves: boolean;
  scarf: string | undefined;
  bandolier: boolean;
  pauldron: boolean;
  backpack: boolean;
  rifle: boolean;
}

function loadoutFor(variant: number): Loadout {
  const r = rng(Math.abs(Math.floor(variant)) * 104729 + 3);
  const coat = pick(r, Object.keys(COAT_COLORS) as Coat[]);
  return {
    crew: crewFor(variant),
    coat,
    coatColor: pick(r, COAT_COLORS[coat]),
    shirt: pick(r, SHIRT_COLORS),
    pants: pick(r, PANTS_COLORS),
    rolledSleeves: coat === 'vest' || coat === 'coverall',
    scarf: r() < 0.5 ? pick(r, SCARF_COLORS) : undefined,
    bandolier: r() < 0.35,
    pauldron: r() < 0.35,
    backpack: r() < 0.4,
    rifle: false,
  };
}

// ---- Drawing helpers ----

/** Two-tone limb: ink brush under a colored core. */
function limb(ctx: CanvasRenderingContext2D, pts: Pt[], width: number, r: Rng, color: string): void {
  const line = resample(pts, false, width * 0.6);
  brush(ctx, line, width * 1.5, r, INK);
  brush(ctx, line, width, r, color);
}

function glowAt(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, 'rgba(255, 220, 160, 0.95)');
  g.addColorStop(0.5, 'rgba(255, 106, 61, 0.6)');
  g.addColorStop(1, 'rgba(255, 106, 61, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** A shape filled, shaded, and ragged-outlined in one go. */
function inkedShape(ctx: CanvasRenderingContext2D, pts: Pt[], color: string, s: number, r: Rng, lw: number, featherIt = true): void {
  fill(ctx, pts, color);
  shade(ctx, pts, s, r, CLOTH_SHADOW, 1.0, false);
  if (featherIt) feather(ctx, pts, s * 0.12, s * 0.03, r, 3);
  raggedOutline(ctx, pts, lw, r);
}

// ---- Head: face, hair, headgear ----

/** `h` is the head radius; (cx, cy) is the face center. `sway` swings ponytails and braids. */
function drawHead(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, crew: Crew, r: Rng, sway = 0): void {
  const lw = h * 0.2;
  const { skin, hair, style } = crew;

  // Hair that sits behind the face.
  if (style === 'afro') {
    const afro = rough(ellipsePts(cx, cy - h * 0.45, h * 1.3, h * 1.15, 14), h, r, 0.18);
    fill(ctx, afro, hair);
    raggedOutline(ctx, afro, lw * 0.6, r);
  } else if (style === 'long') {
    const long = rough(
      [
        [cx - h * 0.95, cy - h * 0.7],
        [cx + h * 0.95, cy - h * 0.7],
        [cx + h * 1.15, cy + h * 1.3],
        [cx - h * 1.15, cy + h * 1.3],
      ],
      h,
      r,
      0.15,
    );
    fill(ctx, long, hair);
    raggedOutline(ctx, long, lw * 0.6, r);
  } else if (style === 'ponytail') {
    const tail = resample([[cx + h * 0.6, cy - h * 0.7], [cx + h * (1.15 + sway * 0.3), cy], [cx + h * (1.0 + sway * 0.5), cy + h * 1.1]], false, h * 0.2);
    brush(ctx, tail, h * 0.65, r, INK);
    brush(ctx, tail, h * 0.45, r, hair);
  } else if (style === 'braids') {
    for (const side of [-1, 1]) {
      const braid = resample([[cx + side * h * 0.8, cy - h * 0.4], [cx + side * h * (0.95 + sway * 0.1), cy + h * 0.6], [cx + side * h * 0.9, cy + h * 1.4]], false, h * 0.15);
      brush(ctx, braid, h * 0.42, r, INK);
      brush(ctx, braid, h * 0.28, r, hair);
      brush(ctx, [[cx + side * h * 0.82, cy + h * 1.2], [cx + side * h * 0.98, cy + h * 1.22]], h * 0.12, r, crew.headgearColor);
    }
  } else if (style === 'bun') {
    const bun = rough(ellipsePts(cx, cy - h * 1.25, h * 0.45, h * 0.4, 10), h, r, 0.1);
    fill(ctx, bun, hair);
    raggedOutline(ctx, bun, lw * 0.6, r);
  }

  // Face with soft skin-tone shading.
  const face = rough(ellipsePts(cx, cy, h * 0.8, h, 14), h, r, 0.08);
  fill(ctx, face, skin.base);
  shade(ctx, face, h, r, skin.shadow, 1.15, false);
  if (crew.beard) {
    const beard = rough(
      [
        [cx - h * 0.78, cy + h * 0.05],
        [cx - h * 0.4, cy + h * 0.45],
        [cx + h * 0.4, cy + h * 0.45],
        [cx + h * 0.78, cy + h * 0.05],
        [cx + h * 0.55, cy + h * 0.85],
        [cx, cy + h * 1.08],
        [cx - h * 0.55, cy + h * 0.85],
      ],
      h,
      r,
      0.1,
    );
    fill(ctx, beard, hair);
  }
  wrinkles(
    ctx,
    [
      [[cx - h * 0.55, cy - h * 0.28], [cx - h * 0.15, cy - h * 0.32]],
      [[cx + h * 0.15, cy - h * 0.32], [cx + h * 0.55, cy - h * 0.28]],
    ],
    h * 0.16,
    r,
  );
  for (const side of [-1, 1]) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(cx + side * h * 0.33, cy - h * 0.1, h * 0.12, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  brush(ctx, [[cx + h * 0.05, cy - h * 0.05], [cx + h * 0.12, cy + h * 0.2], [cx - h * 0.02, cy + h * 0.28]], h * 0.1, r, skin.shadow);
  brush(ctx, [[cx - h * 0.22, cy + h * 0.52], [cx, cy + h * 0.55], [cx + h * 0.22, cy + h * 0.51]], h * 0.07, r, crew.beard ? INK : skin.shadow);
  raggedOutline(ctx, face, lw * 0.7, r);

  // Hair on top of the head (afros and buns already cover it).
  if (style !== 'bald' && style !== 'afro') {
    const cap = rough(
      [
        [cx - h * 0.85, cy - h * 0.2],
        [cx - h * 0.92, cy - h * 0.75],
        [cx - h * 0.5, cy - h * 1.15],
        [cx + h * 0.5, cy - h * 1.15],
        [cx + h * 0.92, cy - h * 0.75],
        [cx + h * 0.85, cy - h * 0.2],
        [cx + h * 0.55, cy - h * 0.6],
        [cx - h * 0.55, cy - h * 0.55],
      ],
      h,
      r,
      0.08,
    );
    fill(ctx, cap, hair);
    raggedOutline(ctx, cap, lw * 0.5, r);
  }

  drawHeadgear(ctx, cx, cy, h, crew, r);
}

function drawGoggles(ctx: CanvasRenderingContext2D, cx: number, y: number, h: number, r: Rng): void {
  brush(ctx, [[cx - h * 0.95, y + h * 0.05], [cx, y - h * 0.05], [cx + h * 0.95, y + h * 0.05]], h * 0.16, r, INK);
  for (const side of [-1, 1]) {
    const lens = rough(ellipsePts(cx + side * h * 0.38, y, h * 0.26, h * 0.22, 8), h, r, 0.04);
    fill(ctx, lens, BRASS);
    fill(ctx, rough(ellipsePts(cx + side * h * 0.38, y, h * 0.17, h * 0.14, 8), h, r, 0.03), GLASS);
    brush(ctx, [[cx + side * h * 0.38 - h * 0.08, y - h * 0.05], [cx + side * h * 0.38 + h * 0.02, y - h * 0.09]], h * 0.06, r, GLINT);
    raggedOutline(ctx, lens, h * 0.08, r);
  }
}

function drawHeadgear(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, crew: Crew, r: Rng): void {
  const lw = h * 0.2;
  const color = crew.headgearColor;
  switch (crew.headgear) {
    case 'goggles':
      drawGoggles(ctx, cx, cy - h * (crew.style === 'afro' ? 0.75 : 0.62), h, r);
      break;
    case 'headband': {
      const y = cy - h * (crew.style === 'afro' ? 0.72 : 0.58);
      brush(ctx, resample([[cx - h * 0.9, y + h * 0.05], [cx, y - h * 0.05], [cx + h * 0.9, y + h * 0.05]], false, h * 0.2), h * 0.26, r, INK);
      brush(ctx, resample([[cx - h * 0.88, y + h * 0.05], [cx, y - h * 0.05], [cx + h * 0.88, y + h * 0.05]], false, h * 0.2), h * 0.16, r, color);
      brush(ctx, [[cx + h * 0.85, y], [cx + h * 1.2, y + h * 0.3], [cx + h * 1.3, y + h * 0.6]], h * 0.14, r, color);
      break;
    }
    case 'beret': {
      const beret = rough(ellipsePts(cx - h * 0.2, cy - h * 0.92, h * 1.05, h * 0.42, 12), h, r, 0.06);
      inkedShape(ctx, beret, color, h, r, lw, false);
      fill(ctx, rough(ellipsePts(cx - h * 0.1, cy - h * 1.3, h * 0.1, h * 0.08, 6), h, r, 0.02), INK);
      break;
    }
    case 'aviator': {
      const leather = '#6a4026';
      for (const side of [-1, 1]) {
        const flap = rough([[cx + side * h * 0.7, cy - h * 0.6], [cx + side * h * 1.0, cy - h * 0.5], [cx + side * h * 0.95, cy + h * 0.3], [cx + side * h * 0.7, cy + h * 0.25]], h, r, 0.05);
        inkedShape(ctx, flap, leather, h, r, lw * 0.7, false);
      }
      const cap = rough(
        [
          [cx - h * 0.95, cy - h * 0.45],
          [cx - h * 0.9, cy - h * 1.0],
          [cx - h * 0.45, cy - h * 1.3],
          [cx + h * 0.45, cy - h * 1.3],
          [cx + h * 0.9, cy - h * 1.0],
          [cx + h * 0.95, cy - h * 0.45],
        ],
        h,
        r,
        0.05,
      );
      inkedShape(ctx, cap, leather, h, r, lw, false);
      drawGoggles(ctx, cx, cy - h * 0.85, h, r);
      break;
    }
    case 'beanie': {
      const beanie = rough(
        [
          [cx - h * 0.95, cy - h * 0.45],
          [cx - h * 0.85, cy - h * 1.1],
          [cx - h * 0.3, cy - h * 1.45],
          [cx + h * 0.3, cy - h * 1.45],
          [cx + h * 0.85, cy - h * 1.1],
          [cx + h * 0.95, cy - h * 0.45],
        ],
        h,
        r,
        0.06,
      );
      inkedShape(ctx, beanie, color, h, r, lw, false);
      brush(ctx, resample([[cx - h * 0.92, cy - h * 0.62], [cx + h * 0.92, cy - h * 0.62]], false, h * 0.2), h * 0.3, r, INK);
      brush(ctx, resample([[cx - h * 0.9, cy - h * 0.62], [cx + h * 0.9, cy - h * 0.62]], false, h * 0.2), h * 0.2, r, color);
      break;
    }
    case 'helmet': {
      // Scavenged, dented olive half-dome with a chin strap.
      const helmet = rough(
        [
          [cx - h * 1.1, cy - h * 0.4],
          [cx - h * 1.0, cy - h * 1.05],
          [cx - h * 0.5, cy - h * 1.45],
          [cx + h * 0.3, cy - h * 1.4],
          [cx + h * 0.45, cy - h * 1.2],
          [cx + h * 0.95, cy - h * 1.1],
          [cx + h * 1.1, cy - h * 0.4],
        ],
        h,
        r,
        0.06,
      );
      inkedShape(ctx, helmet, OLIVE_DRAB, h, r, lw);
      brush(ctx, [[cx - h * 0.4, cy - h * 1.1], [cx - h * 0.1, cy - h * 0.95]], h * 0.08, r);
      brush(ctx, [[cx - h * 0.8, cy - h * 0.4], [cx - h * 0.6, cy + h * 0.6], [cx, cy + h * 0.95]], h * 0.08, r);
      break;
    }
    case 'none':
      break;
  }
}

// ---- Weapons ----

/** Chunky ray pistol pointing right, grip at (x, y). */
function rayPistol(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, r: Rng): void {
  const body = rough(
    [
      [x - u * 0.3, y - u * 0.25],
      [x + u * 0.55, y - u * 0.3],
      [x + u * 0.9, y - u * 0.12],
      [x + u * 0.55, y + u * 0.05],
      [x + u * 0.1, y + u * 0.05],
      [x + u * 0.05, y + u * 0.45],
      [x - u * 0.25, y + u * 0.45],
    ],
    u,
    r,
    0.05,
  );
  fill(ctx, body, GUNMETAL);
  for (const rx of [0.35, 0.55]) brush(ctx, [[x + u * rx, y - u * 0.32], [x + u * rx, y + u * 0.06]], u * 0.1, r, GOLD);
  raggedOutline(ctx, body, u * 0.1, r);
  glowAt(ctx, x + u * 0.95, y - u * 0.12, u * 0.35);
}

/** Long scavenged laser rifle from (x1, y1) (stock) toward (x2, y2) (muzzle), held across the body. */
function laserRifle(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, u: number, r: Rng): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(a);
  const stock = rough([[0, -u * 0.12], [len * 0.3, -u * 0.14], [len * 0.3, u * 0.14], [len * 0.05, u * 0.22], [0, u * 0.18]], u, r, 0.04);
  fill(ctx, stock, '#7a4a2a');
  raggedOutline(ctx, stock, u * 0.06, r);
  const body = rough([[len * 0.28, -u * 0.16], [len * 0.75, -u * 0.12], [len * 0.75, u * 0.1], [len * 0.42, u * 0.12], [len * 0.4, u * 0.32], [len * 0.33, u * 0.32], [len * 0.28, u * 0.12]], u, r, 0.04);
  fill(ctx, body, GUNMETAL);
  raggedOutline(ctx, body, u * 0.06, r);
  brush(ctx, [[len * 0.74, 0], [len, 0]], u * 0.12, r, INK);
  // Taped-on scope and a tape wrap.
  fill(ctx, rough([[len * 0.45, -u * 0.18], [len * 0.62, -u * 0.18], [len * 0.62, -u * 0.3], [len * 0.45, -u * 0.3]], u, r, 0.02), INK);
  brush(ctx, [[len * 0.52, -u * 0.16], [len * 0.52, u * 0.12]], u * 0.09, r, TAPE);
  glowAt(ctx, len, 0, u * 0.3);
  ctx.restore();
}

// ---- Figures ----

/**
 * Trooper: a militia fighter assembled from mismatched gear, striding forward.
 * `rifle` comes from the game (it decides the weapon); `recoil` (0..1) kicks the gun back after a shot.
 */
export function drawTrooper(ctx: CanvasRenderingContext2D, s: number, wobble: number, variant: number, rifle: boolean, recoil = 0): void {
  const L = { ...loadoutFor(variant), rifle };
  const { crew } = L;
  const r = rng(300 + variant * 13 + (Math.floor(wobble / 1.4) % 3));
  const stride = Math.sin(wobble);
  const lw = s * 0.06;
  const sleeve = L.coat === 'vest' ? L.shirt : L.coatColor;
  ctx.save();
  ctx.translate(-recoil * s * 0.06, Math.abs(stride) * -s * 0.04);

  // Bedroll pack peeking above the shoulders.
  if (L.backpack) {
    const pack = rough([[-s * 0.3, -s * 0.5], [s * 0.3, -s * 0.5], [s * 0.34, -s * 0.2], [-s * 0.34, -s * 0.2]], s, r, 0.04);
    inkedShape(ctx, pack, '#6a5a48', s, r, lw, false);
    const roll = rough(ellipsePts(0, -s * 0.55, s * 0.4, s * 0.09, 10), s, r, 0.03);
    inkedShape(ctx, roll, SANDBAG, s, r, lw * 0.7, false);
  }

  // Legs and boots.
  for (const side of [-1, 1]) {
    const k = side * stride * 0.08;
    const foot: Pt = [side * s * 0.18 + k * s, s * (0.95 - Math.max(0, side * stride) * 0.06)];
    limb(ctx, [[side * s * 0.13, s * 0.35], [side * s * 0.16 + k * s * 0.5, s * 0.66], foot], s * 0.15, r, L.pants);
    brush(ctx, [[foot[0], foot[1] - s * 0.18], [foot[0] + side * s * 0.02, foot[1] - s * 0.05], [foot[0] + side * s * 0.08, foot[1]]], s * 0.22, r, BOOT);
  }

  // Duster tails hang over the legs.
  if (L.coat === 'duster') {
    for (const side of [-1, 1]) {
      const tail = rough([[side * s * 0.05, s * 0.3], [side * s * 0.3, s * 0.3], [side * s * (0.38 + stride * side * 0.04), s * 0.78], [side * s * 0.08, s * 0.72]], s, r, 0.05);
      inkedShape(ctx, tail, L.coatColor, s, r, lw);
    }
  }

  // Back arm (rifle support hand, or hanging at the side).
  const backArm: Pt[] = L.rifle
    ? [[-s * 0.3, -s * 0.28], [-s * 0.18, s * 0.05], [s * 0.1, s * 0.0]]
    : [[-s * 0.3, -s * 0.28], [-s * 0.4, s * 0.0], [-s * 0.36, s * 0.24 + stride * s * 0.03]];
  drawArm(ctx, backArm, s, r, sleeve, L.rolledSleeves, crew.skin.base);

  // Torso: shirt underneath, garment on top.
  const torsoPts: Pt[] = [
    [-s * 0.33, -s * 0.33],
    [s * 0.33, -s * 0.33],
    [s * 0.25, s * 0.22],
    [s * 0.27, s * 0.42],
    [-s * 0.27, s * 0.42],
    [-s * 0.25, s * 0.22],
  ];
  const torso = rough(torsoPts, s, r, 0.04);
  const bodyColor = L.coat === 'coverall' || L.coat === 'sweater' ? L.coatColor : L.shirt;
  inkedShape(ctx, torso, bodyColor, s, r, lw);
  if (L.coat === 'jacket' || L.coat === 'duster' || L.coat === 'vest') {
    // Open-front garment panels on either side of the shirt.
    for (const side of [-1, 1]) {
      const panel = rough([[side * s * 0.33, -s * 0.33], [side * s * 0.08, -s * 0.3], [side * s * 0.1, s * 0.42], [side * s * 0.27, s * 0.42], [side * s * 0.25, s * 0.22]], s, r, 0.04);
      inkedShape(ctx, panel, L.coatColor, s, r, lw);
    }
  }
  if (L.coat === 'sweater') {
    brush(ctx, resample([[-s * 0.3, -s * 0.05], [s * 0.3, -s * 0.05]], false, s * 0.05), s * 0.1, r, TAPE);
    const plate = rough([[-s * 0.22, -s * 0.28], [s * 0.22, -s * 0.28], [s * 0.18, s * 0.12], [-s * 0.18, s * 0.12]], s, r, 0.04);
    inkedShape(ctx, plate, PLATE, s, r, lw, false);
    for (const [x, y] of [[-0.15, -0.22], [0.15, -0.22], [-0.12, 0.06], [0.12, 0.06]]) {
      fill(ctx, rough(ellipsePts(x * s, y * s, s * 0.025, s * 0.025, 5), s, r, 0.01), INK);
    }
  }
  if (L.coat === 'coverall') {
    // Patch on the chest and a zipper line.
    fill(ctx, rough([[-s * 0.22, -s * 0.2], [-s * 0.08, -s * 0.2], [-s * 0.08, -s * 0.08], [-s * 0.22, -s * 0.08]], s, r, 0.02), crew.headgearColor);
    brush(ctx, [[0, -s * 0.3], [0, s * 0.4]], s * 0.03, r);
  }
  // Belt with a brass buckle.
  brush(ctx, resample([[-s * 0.26, s * 0.27], [s * 0.26, s * 0.27]], false, s * 0.05), s * 0.09, r, INK);
  fill(ctx, rough(ellipsePts(0, s * 0.27, s * 0.05, s * 0.04, 6), s, r, 0.02), BRASS);
  if (L.coat === 'jacket') {
    // Shearling collar.
    const collar = rough([[-s * 0.34, -s * 0.36], [-s * 0.1, -s * 0.4], [0, -s * 0.22], [s * 0.1, -s * 0.4], [s * 0.34, -s * 0.36], [s * 0.3, -s * 0.24], [-s * 0.3, -s * 0.24]], s, r, 0.06);
    inkedShape(ctx, collar, TAPE, s, r, lw * 0.7, false);
  }
  if (L.bandolier) {
    const strap = resample([[-s * 0.3, -s * 0.3], [s * 0.26, s * 0.25]], false, s * 0.04);
    brush(ctx, strap, s * 0.12, r, '#5a3a24');
    for (let i = 1; i < strap.length - 1; i += 2) {
      fill(ctx, rough(ellipsePts(strap[i][0], strap[i][1], s * 0.025, s * 0.035, 5), s, r, 0.01), BRASS);
    }
  }
  if (L.pauldron) {
    const pad = rough(ellipsePts(-s * 0.33, -s * 0.28, s * 0.15, s * 0.11, 8), s, r, 0.04);
    inkedShape(ctx, pad, OLIVE_DRAB, s, r, lw * 0.7, false);
  }

  drawHead(ctx, 0, -s * 0.66, s * 0.23, crew, r, stride);

  // Scarf wrapped at the neck, tail flapping.
  if (L.scarf) {
    brush(ctx, resample([[-s * 0.2, -s * 0.38], [0, -s * 0.33], [s * 0.2, -s * 0.38]], false, s * 0.05), s * 0.16, r, INK);
    brush(ctx, resample([[-s * 0.19, -s * 0.38], [0, -s * 0.33], [s * 0.19, -s * 0.38]], false, s * 0.05), s * 0.1, r, L.scarf);
    const tail = resample([[-s * 0.15, -s * 0.36], [-s * (0.4 + stride * 0.05), -s * 0.3], [-s * (0.62 + stride * 0.08), -s * 0.36]], false, s * 0.05);
    brush(ctx, tail, s * 0.14, r, INK);
    brush(ctx, tail, s * 0.09, r, L.scarf);
  }

  // Weapon and front arm.
  if (L.rifle) {
    laserRifle(ctx, -s * 0.15, s * 0.1, s * 0.85, -s * 0.3, s * 0.35, r);
    drawArm(ctx, [[s * 0.3, -s * 0.28], [s * 0.42, -s * 0.02], [s * 0.45, -s * 0.12]], s, r, sleeve, L.rolledSleeves, crew.skin.base);
  } else {
    drawArm(ctx, [[s * 0.3, -s * 0.28], [s * 0.5, -s * 0.08], [s * 0.68, -s * 0.2]], s, r, sleeve, L.rolledSleeves, crew.skin.base);
    rayPistol(ctx, s * 0.7, -s * 0.28, s * 0.32, r);
  }

  ctx.restore();
}

/** Shoulder → elbow → hand. Rolled sleeves show the forearm. */
function drawArm(ctx: CanvasRenderingContext2D, pts: Pt[], s: number, r: Rng, sleeve: string, rolled: boolean, skin: string): void {
  const [shoulder, elbow, hand] = pts;
  if (rolled) {
    limb(ctx, [shoulder, elbow], s * 0.13, r, sleeve);
    limb(ctx, [elbow, hand], s * 0.11, r, skin);
    brush(ctx, [[elbow[0] - s * 0.06, elbow[1]], [elbow[0] + s * 0.06, elbow[1]]], s * 0.08, r, sleeve);
  } else {
    limb(ctx, pts, s * 0.13, r, sleeve);
  }
  fill(ctx, rough(ellipsePts(hand[0], hand[1], s * 0.07, s * 0.07, 6), s, r, 0.02), skin);
}

/** Laser Bastion: a sandbagged emplacement of patched, scavenged plating with twin cannons and a gunner. */
export function drawLaserBastion(ctx: CanvasRenderingContext2D, s: number): void {
  const r = rng(41);
  const lw = s * 0.06;

  // Twin laser cannons with tape wraps.
  for (const off of [-0.06, 0.08]) {
    limb(ctx, [[s * 0.2, -s * 0.05 + off * s], [s * 0.82, -s * (0.62 - off)]], s * 0.09, r, GUNMETAL);
    brush(ctx, [[s * 0.52, -s * (0.32 - off) - s * 0.05], [s * 0.56, -s * (0.32 - off) + s * 0.05]], s * 0.07, r, TAPE);
  }
  glowAt(ctx, s * 0.84, -s * 0.6, s * 0.22);

  // Bent mast with a tattered militia pennant.
  limb(ctx, [[-s * 0.45, s * 0.05], [-s * 0.5, -s * 0.4], [-s * 0.55, -s * 0.8]], s * 0.04, r, '#5a3a24');
  const flag = rough([[-s * 0.55, -s * 0.8], [-s * 0.12, -s * 0.7], [-s * 0.22, -s * 0.62], [-s * 0.1, -s * 0.52], [-s * 0.53, -s * 0.5]], s, r, 0.04);
  inkedShape(ctx, flag, '#c8352b', s, r, lw * 0.6, false);
  fill(ctx, rough(ellipsePts(-s * 0.4, -s * 0.65, s * 0.06, s * 0.06, 5), s, r, 0.02), GOLD);

  // Patched dome turret with the gunner under a glass canopy.
  const dome = rough(
    [
      [-s * 0.5, s * 0.2],
      [-s * 0.45, -s * 0.12],
      [-s * 0.25, -s * 0.34],
      [s * 0.25, -s * 0.34],
      [s * 0.45, -s * 0.12],
      [s * 0.5, s * 0.2],
    ],
    s,
    r,
    0.05,
  );
  fill(ctx, dome, OLIVE_DRAB);
  for (const [x, y, w, h, c] of [[-0.42, -0.05, 0.18, 0.2, RUST], [0.22, -0.2, 0.18, 0.14, PLATE], [0.25, 0.02, 0.2, 0.16, RUST]] as const) {
    const patch = rough([[x * s, y * s], [(x + w) * s, y * s], [(x + w) * s, (y + h) * s], [x * s, (y + h) * s]], s, r, 0.03);
    fill(ctx, patch, c);
    for (const [px, py] of patch.filter((_, i) => i % 3 === 0)) fill(ctx, rough(ellipsePts(px, py, s * 0.018, s * 0.018, 5), s, r, 0.005), INK);
  }
  shade(ctx, dome, s, r, CLOTH_SHADOW, 1.0, false);
  const canopy = rough(ellipsePts(-s * 0.02, -s * 0.06, s * 0.24, s * 0.18, 12), s, r, 0.04);
  fill(ctx, canopy, GLASS);
  ctx.save();
  ctx.beginPath();
  canopy.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.clip();
  drawHead(ctx, -s * 0.02, s * 0.02, s * 0.11, { ...crewFor(4), headgear: 'aviator', beard: false }, r);
  ctx.restore();
  brush(ctx, [[-s * 0.18, -s * 0.14], [-s * 0.06, -s * 0.19]], s * 0.04, r, GLINT);
  raggedOutline(ctx, canopy, lw * 0.6, r);
  feather(ctx, dome, s * 0.12, s * 0.03, r);
  raggedOutline(ctx, dome, lw, r);

  // Sandbag wall around the base.
  const rows: [number, number, number][] = [
    [s * 0.3, 5, 0.32],
    [s * 0.5, 4, 0.36],
  ];
  for (const [y, n, w] of rows) {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * s * w;
      const bag = rough(ellipsePts(x, y, s * w * 0.55, s * 0.11, 10), s, r, 0.03);
      fill(ctx, bag, SANDBAG);
      shade(ctx, bag, s, r, CLOTH_SHADOW, 1.0, false);
      raggedOutline(ctx, bag, lw * 0.7, r);
    }
  }
}

/** Sentry Gun: a scavenged auto-turret pod on a mismatched tripod, patched and taped. */
export function drawSentryGun(ctx: CanvasRenderingContext2D, s: number): void {
  const r = rng(57);
  const lw = s * 0.07;

  for (const [foot, color] of [[[-s * 0.6, s * 0.7], GUNMETAL], [[s * 0.55, s * 0.72], '#5a3a24'], [[0, s * 0.8], GUNMETAL]] as [Pt, string][]) {
    limb(ctx, [[0, s * 0.15], foot], s * 0.06, r, color);
  }
  limb(ctx, [[s * 0.25, -s * 0.05], [s * 0.85, -s * 0.35]], s * 0.1, r, GUNMETAL);
  glowAt(ctx, s * 0.87, -s * 0.36, s * 0.2);

  const pod = rough(ellipsePts(0, 0, s * 0.42, s * 0.3, 14), s, r, 0.05);
  fill(ctx, pod, OLIVE_DRAB);
  const patch = rough([[-s * 0.3, -s * 0.15], [-s * 0.05, -s * 0.18], [-s * 0.05, s * 0.05], [-s * 0.3, s * 0.08]], s, r, 0.03);
  fill(ctx, patch, RUST);
  for (const [px, py] of patch.filter((_, i) => i % 3 === 0)) fill(ctx, rough(ellipsePts(px, py, s * 0.02, s * 0.02, 5), s, r, 0.005), INK);
  brush(ctx, resample([[s * 0.05, -s * 0.28], [s * 0.3, s * 0.2]], false, s * 0.05), s * 0.1, r, TAPE);
  fill(ctx, rough(ellipsePts(s * 0.18, -s * 0.06, s * 0.07, s * 0.05, 6), s, r, 0.02), '#ff6a3d');
  shade(ctx, pod, s, r, CLOTH_SHADOW, 1.0, false);
  feather(ctx, pod, s * 0.15, s * 0.035, r);
  raggedOutline(ctx, pod, lw, r);

  limb(ctx, [[-s * 0.1, -s * 0.28], [-s * 0.15, -s * 0.48]], s * 0.04, r, GUNMETAL);
  const dish = rough([[-s * 0.42, -s * 0.62], [s * 0.1, -s * 0.5], [-s * 0.08, -s * 0.42], [-s * 0.32, -s * 0.48]], s, r, 0.03);
  fill(ctx, dish, PLATE);
  raggedOutline(ctx, dish, lw * 0.6, r);
}
