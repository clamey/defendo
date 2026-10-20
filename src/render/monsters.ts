// Space Monster drawings in the style of late-70s Marvel horror villains (think the Dire
// Wraiths in ROM Spaceknight): gaunt, wrinkled, skull-faced things inked with a scratchy
// brush — broken tapered outlines, feathered shading, spot blacks, never a clean border.
// All functions draw centered at (0,0); `s` is the half-width in pixels.

import { INK, type Pt, type Rng, brush, ellipsePts, feather, fill, raggedOutline, resample, rng, rough, shade, wrinkles } from './ink';

const SKIN = '#8fa05a';
const SKIN_PALE = '#bcc382';
const SHADOW = '#4b3a5c';
const SINEW = '#6b5876';
const FLESH = '#9a5a6a';
const BONE = '#e6dcb8';
const EYE = '#ffd23f';
const EYE_HOT = '#ff5a1f';
const TONGUE = '#b0345a';
const ACID = '#b5e03a';

/** Dark chit face behind the player's monster pieces. */
export const MONSTER_CHIT = '#3a2236';

/** Glowing pinprick eye in a ragged black socket. */
function socketEye(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, slant: number, s: number, r: Rng): void {
  const socket = rough(
    [
      [x - rad * 1.4, y - rad * (0.6 + slant)],
      [x + rad * 1.4, y - rad * (0.6 - slant)],
      [x + rad * 1.1, y + rad * 0.7],
      [x - rad * 1.1, y + rad * 0.7],
    ],
    s,
    r,
    0.04,
  );
  fill(ctx, socket, INK);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, rad * 1.6);
  glow.addColorStop(0, 'rgba(255, 210, 63, 0.9)');
  glow.addColorStop(0.4, 'rgba(255, 90, 31, 0.5)');
  glow.addColorStop(1, 'rgba(255, 90, 31, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, rad * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = EYE;
  ctx.beginPath();
  ctx.ellipse(x, y, rad * 0.45, rad * 0.3, slant, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = EYE_HOT;
  ctx.beginPath();
  ctx.arc(x, y, rad * 0.15, 0, Math.PI * 2);
  ctx.fill();
}

/** Uneven little teeth along a line. dir 1 = pointing down. */
function teeth(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, n: number, len: number, dir: 1 | -1, r: Rng): void {
  const w = (x2 - x1) / n;
  for (let i = 0; i < n; i++) {
    const x = x1 + i * w + (r() - 0.5) * w * 0.3;
    const l = len * (0.5 + r() * 0.7);
    fill(ctx, [[x, y], [x + w * (0.3 + r() * 0.4), y + l * dir], [x + w * 0.9, y]], BONE);
  }
}

// ---- Monsters ----

/** Crawler: a hunched, skull-faced wraith dragging itself forward on taloned arms, tongue lolling. */
export function drawCrawler(ctx: CanvasRenderingContext2D, s: number, wobble: number): void {
  // Cycle through three drawings so the ink "boils" like hand-drawn animation.
  const r = rng(101 + (Math.floor(wobble / 1.4) % 3));
  const lw = s * 0.08;
  const reach = Math.sin(wobble) * 0.12;

  // Taloned arms clawing forward.
  for (const side of [-1, 1]) {
    const k = side * reach;
    const arm: Pt[] = [
      [side * s * 0.45, -s * 0.05],
      [side * s * 0.95, s * (0.15 + k)],
      [side * s * 0.75, s * (0.65 - k)],
    ];
    brush(ctx, resample(arm, false, s * 0.1), s * 0.3, r, INK);
    brush(ctx, resample(arm, false, s * 0.1), s * 0.17, r, SKIN);
    const [hx, hy] = arm[2];
    for (let t = -1; t <= 1; t++) {
      brush(ctx, [[hx, hy], [hx + t * s * 0.1 + side * s * 0.05, hy + s * 0.15], [hx + t * s * 0.16 + side * s * 0.08, hy + s * 0.32]], s * 0.08, r);
    }
  }

  // Hunched back, bristling with ragged spines.
  const back: Pt[] = [];
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * 0.95 + (i / 13) * Math.PI * 1.1;
    const spike = i % 3 === 1 ? 1.35 : 1;
    back.push([Math.cos(a) * s * 0.62 * spike, -s * 0.05 + Math.sin(a) * s * 0.5 * spike]);
  }
  back.push([s * 0.45, s * 0.3], [-s * 0.45, s * 0.3]);
  const backPts = rough(back, s, r, 0.08);
  fill(ctx, backPts, SINEW);
  shade(ctx, backPts, s, r, SHADOW, 0.8);
  feather(ctx, backPts, s * 0.25, s * 0.05, r);
  raggedOutline(ctx, backPts, lw, r);

  // Elongated skull head with swept-back fin ears.
  const head: Pt[] = [
    [0, -s * 0.38],
    [s * 0.22, -s * 0.34],
    [s * 0.62, -s * 0.55],
    [s * 0.36, -s * 0.12],
    [s * 0.3, s * 0.2],
    [s * 0.16, s * 0.58],
    [0, s * 0.66],
    [-s * 0.16, s * 0.58],
    [-s * 0.3, s * 0.2],
    [-s * 0.36, -s * 0.12],
    [-s * 0.62, -s * 0.55],
    [-s * 0.22, -s * 0.34],
  ];
  const headPts = rough(head, s, r, 0.05);
  fill(ctx, headPts, SKIN);
  // Pale highlight on the lit side of the brow.
  fill(ctx, rough(ellipsePts(-s * 0.08, -s * 0.15, s * 0.16, s * 0.12, 10), s, r, 0.05), SKIN_PALE);
  shade(ctx, headPts, s, r, SHADOW, 0.9);
  feather(ctx, headPts, s * 0.2, s * 0.04, r);
  wrinkles(
    ctx,
    [
      [[-s * 0.18, -s * 0.25], [0, -s * 0.21], [s * 0.18, -s * 0.25]],
      [[-s * 0.13, -s * 0.31], [s * 0.13, -s * 0.31]],
      [[-s * 0.28, s * 0.15], [-s * 0.2, s * 0.3]],
      [[s * 0.28, s * 0.15], [s * 0.2, s * 0.3]],
      [[s * 0.42, -s * 0.38], [s * 0.3, -s * 0.22]],
      [[-s * 0.42, -s * 0.38], [-s * 0.3, -s * 0.22]],
    ],
    s * 0.035,
    r,
  );

  socketEye(ctx, -s * 0.15, -s * 0.05, s * 0.1, 0.35, s, r);
  socketEye(ctx, s * 0.15, -s * 0.05, s * 0.1, -0.35, s, r);

  // Slack jaw with uneven teeth.
  const jaw = rough(
    [
      [-s * 0.16, s * 0.3],
      [s * 0.16, s * 0.3],
      [s * 0.1, s * 0.5],
      [-s * 0.1, s * 0.5],
    ],
    s,
    r,
    0.04,
  );
  fill(ctx, jaw, INK);
  teeth(ctx, -s * 0.15, s * 0.15, s * 0.31, 5, s * 0.09, 1, r);
  teeth(ctx, -s * 0.1, s * 0.1, s * 0.49, 4, s * 0.07, -1, r);

  // The long barbed tongue, swaying.
  const sway = Math.sin(wobble * 0.8) * s * 0.18;
  const tongue: Pt[] = [
    [0, s * 0.45],
    [sway * 0.4, s * 0.7],
    [sway, s * 0.88],
    [sway * 0.6 + s * 0.08, s * 1.02],
  ];
  const tongueLine = resample(tongue, false, s * 0.06);
  brush(ctx, tongueLine, s * 0.15, r, INK);
  brush(ctx, tongueLine, s * 0.09, r, TONGUE);
  const [bx, by] = tongue[3];
  fill(ctx, [[bx - s * 0.08, by - s * 0.04], [bx + s * 0.1, by + s * 0.1], [bx + s * 0.02, by - s * 0.08]], INK);

  raggedOutline(ctx, headPts, lw, r);
}

/** Brood Spire: a gnarled hive of twisted sinew spires, a wraith face snarling from its trunk. */
export function drawBroodSpire(ctx: CanvasRenderingContext2D, s: number): void {
  const r = rng(7);
  const lw = s * 0.06;

  // Root tendrils spreading at the base.
  for (const [dx, dy] of [[-0.75, 0.55], [-0.5, 0.75], [0.5, 0.75], [0.78, 0.5]] as const) {
    const root = resample([[dx * s * 0.3, s * 0.45], [dx * s * 0.7, s * (dy - 0.05)], [dx * s, s * dy]], false, s * 0.08);
    brush(ctx, root, s * 0.18, r, INK);
    brush(ctx, root, s * 0.09, r, SINEW);
  }

  // Three crooked spires.
  const spire = (x: number, top: number, w: number, lean: number): Pt[] => [
    [x - w, s * 0.5],
    [x - w * 0.8, s * 0.1],
    [x - w * 0.5 + lean * 0.5, top * 0.5],
    [x + lean, top],
    [x + w * 0.4 + lean * 0.5, top * 0.45],
    [x + w * 0.8, s * 0.05],
    [x + w, s * 0.5],
  ];
  for (const [x, top, w, lean] of [
    [-s * 0.42, -s * 0.55, s * 0.18, -s * 0.15],
    [s * 0.42, -s * 0.5, s * 0.18, s * 0.18],
  ] as const) {
    const pts = rough(spire(x, top, w, lean), s, r, 0.06);
    fill(ctx, pts, SINEW);
    shade(ctx, pts, s, r, SHADOW, 0.9);
    feather(ctx, pts, s * 0.15, s * 0.035, r);
    raggedOutline(ctx, pts, lw, r);
  }
  const trunk = rough(spire(0, -s * 0.92, s * 0.36, s * 0.05), s, r, 0.06);
  fill(ctx, trunk, SKIN);
  shade(ctx, trunk, s, r, SHADOW, 0.9);
  feather(ctx, trunk, s * 0.22, s * 0.04, r);
  // Sinew striations up the trunk.
  wrinkles(
    ctx,
    [
      [[-s * 0.2, s * 0.45], [-s * 0.15, s * 0.15], [-s * 0.12, -s * 0.2]],
      [[s * 0.05, -s * 0.45], [s * 0.02, -s * 0.7]],
      [[-s * 0.06, -s * 0.4], [-s * 0.02, -s * 0.62]],
      [[-s * 0.3, -s * 0.05], [-s * 0.2, -s * 0.12]],
    ],
    s * 0.03,
    r,
  );

  // Wraith face snarling out of the trunk.
  socketEye(ctx, -s * 0.13, -s * 0.12, s * 0.1, 0.4, s, r);
  socketEye(ctx, s * 0.13, -s * 0.12, s * 0.1, -0.4, s, r);
  wrinkles(ctx, [[[-s * 0.25, -s * 0.28], [0, -s * 0.2], [s * 0.25, -s * 0.28]]], s * 0.05, r);
  const mouth = rough(
    [
      [-s * 0.2, s * 0.1],
      [s * 0.2, s * 0.1],
      [s * 0.12, s * 0.32],
      [-s * 0.12, s * 0.32],
    ],
    s,
    r,
    0.04,
  );
  fill(ctx, mouth, INK);
  teeth(ctx, -s * 0.19, s * 0.19, s * 0.11, 6, s * 0.1, 1, r);
  teeth(ctx, -s * 0.12, s * 0.12, s * 0.31, 4, s * 0.07, -1, r);

  raggedOutline(ctx, trunk, lw, r);
}

/** Spitter Pod: a lumpy, warty flesh sac with a puckered, drooling acid maw. */
export function drawSpitterPod(ctx: CanvasRenderingContext2D, s: number): void {
  const r = rng(23);
  const lw = s * 0.07;

  // Lumpy sac.
  const sac: Pt[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const lump = 1 + (i % 4 === 0 ? 0.12 : 0) + (r() - 0.5) * 0.1;
    sac.push([Math.cos(a) * s * 0.78 * lump, s * 0.08 + Math.sin(a) * s * 0.68 * lump]);
  }
  const sacPts = rough(sac, s, r, 0.06);
  fill(ctx, sacPts, FLESH);
  shade(ctx, sacPts, s, r, SHADOW, 0.85);
  feather(ctx, sacPts, s * 0.22, s * 0.04, r);

  // Warts and veins.
  for (let i = 0; i < 7; i++) {
    const x = (r() - 0.6) * s * 0.8;
    const y = (r() - 0.2) * s * 0.6;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y, s * (0.025 + r() * 0.03), 0, Math.PI * 2);
    ctx.fill();
  }
  wrinkles(
    ctx,
    [
      [[-s * 0.45, s * 0.35], [-s * 0.35, s * 0.1], [-s * 0.4, -s * 0.1]],
      [[s * 0.15, s * 0.55], [s * 0.2, s * 0.3]],
    ],
    s * 0.03,
    r,
  );

  // Puckered maw ringed by uneven teeth, acid glowing inside.
  const my = -s * 0.12;
  const glow = ctx.createRadialGradient(0, my, 0, 0, my, s * 0.45);
  glow.addColorStop(0, 'rgba(181, 224, 58, 0.6)');
  glow.addColorStop(1, 'rgba(181, 224, 58, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, my, s * 0.45, 0, Math.PI * 2);
  ctx.fill();
  const maw = rough(ellipsePts(0, my, s * 0.3, s * 0.2, 12), s, r, 0.06);
  fill(ctx, maw, INK);
  fill(ctx, rough(ellipsePts(0, my + s * 0.03, s * 0.13, s * 0.07, 8), s, r, 0.03), ACID);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.3;
    const ox = Math.cos(a) * s * 0.29;
    const oy = my + Math.sin(a) * s * 0.19;
    const l = 0.4 + r() * 0.3;
    fill(ctx, [[ox - Math.sin(a) * s * 0.05, oy + Math.cos(a) * s * 0.03], [ox * (1 - l), my + (oy - my) * (1 - l)], [ox + Math.sin(a) * s * 0.05, oy - Math.cos(a) * s * 0.03]], BONE);
  }
  // Pucker lines radiating from the lips.
  wrinkles(
    ctx,
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      return [
        [Math.cos(a) * s * 0.33, my + Math.sin(a) * s * 0.23],
        [Math.cos(a) * s * 0.45, my + Math.sin(a) * s * 0.32],
      ] as Pt[];
    }),
    s * 0.03,
    r,
  );

  // Acid drool.
  for (const [x, len] of [[-s * 0.12, 0.38], [s * 0.16, 0.26]] as const) {
    const drip = resample([[x, my + s * 0.15], [x + s * 0.02, my + s * (0.15 + len)]], false, s * 0.05);
    brush(ctx, drip, s * 0.11, r, INK);
    brush(ctx, drip, s * 0.07, r, ACID);
  }

  raggedOutline(ctx, sacPts, lw, r);
}
