// Rough brush-ink drawing kit shared by both sides' art: late-70s comic inking with
// broken tapered outlines, feathered shading and spot blacks — never a clean border.

export const INK = '#120c0a';

export type Pt = [number, number];
export type Rng = () => number;

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points every `step` px along a polyline. */
export function resample(pts: Pt[], closed: boolean, step: number): Pt[] {
  const out: Pt[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const segs = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / step));
    for (let j = 0; j < segs; j++) out.push([x1 + ((x2 - x1) * j) / segs, y1 + ((y2 - y1) * j) / segs]);
  }
  if (!closed) out.push(pts[pts.length - 1]);
  return out;
}

export const jitter = (pts: Pt[], amp: number, r: Rng): Pt[] => pts.map(([x, y]) => [x + (r() - 0.5) * amp, y + (r() - 0.5) * amp]);

/** A shape outline, resampled and roughened so no edge is clean. */
export function rough(pts: Pt[], s: number, r: Rng, amp = 0.06): Pt[] {
  return jitter(resample(pts, true, s * 0.07), s * amp, r);
}

export function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 16): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt;
  });
}

export function trace(ctx: CanvasRenderingContext2D, pts: Pt[], close = true): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
}

export function fill(ctx: CanvasRenderingContext2D, pts: Pt[], color: string): void {
  trace(ctx, pts);
  ctx.fillStyle = color;
  ctx.fill();
}

/** A single tapered brush stroke along `pts`, filled as a ribbon. */
export function brush(ctx: CanvasRenderingContext2D, pts: Pt[], width: number, r: Rng, color = INK): void {
  if (pts.length < 2) return;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    const t = i / (n - 1);
    const w = (width / 2) * (0.15 + 0.85 * Math.sin(Math.PI * t)) * (0.75 + r() * 0.5);
    left.push([pts[i][0] - (ty / len) * w, pts[i][1] + (tx / len) * w]);
    right.push([pts[i][0] + (ty / len) * w, pts[i][1] - (tx / len) * w]);
  }
  fill(ctx, [...left, ...right.reverse()], color);
}

/** Broken, uneven brush outline: chunks of tapered strokes with gaps and stray hairs. */
export function raggedOutline(ctx: CanvasRenderingContext2D, pts: Pt[], width: number, r: Rng): void {
  const n = pts.length;
  let i = 0;
  while (i < n) {
    const len = 3 + Math.floor(r() * 5);
    const chunk = Array.from({ length: len + 1 }, (_, k) => pts[(i + k) % n]);
    if (r() > 0.1) brush(ctx, chunk, width * (0.5 + r() * 0.9), r);
    if (r() < 0.25) {
      // Stray hair flicking off the edge.
      const [x, y] = pts[i % n];
      const a = r() * Math.PI * 2;
      const l = width * (2 + r() * 3);
      brush(ctx, [[x, y], [x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5], [x + Math.cos(a) * l, y + Math.sin(a) * l]], width * 0.5, r);
    }
    i += len;
  }
}

export function centroid(pts: Pt[]): Pt {
  const x = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const y = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return [x, y];
}

/** Feathered hatching strokes from the shadow side (lower right) of a shape inward. */
export function feather(ctx: CanvasRenderingContext2D, pts: Pt[], len: number, width: number, r: Rng, every = 2): void {
  const [cx, cy] = centroid(pts);
  pts.forEach(([x, y], i) => {
    if (i % every) return;
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    // Light comes from the upper left; feather the edges that face away from it.
    if ((dx + dy) / d < 0.35) return;
    const l = len * (0.5 + r() * 0.7);
    const bend = (r() - 0.5) * 0.4;
    const ux = -dx / d;
    const uy = -dy / d;
    brush(ctx, [[x, y], [x + (ux - uy * bend) * l * 0.5, y + (uy + ux * bend) * l * 0.5], [x + ux * l, y + uy * l]], width, r);
  });
}

/** Colored shadow (and optionally spot blacks) pooled on the lower-right of a shape. */
export function shade(ctx: CanvasRenderingContext2D, shape: Pt[], s: number, r: Rng, shadow: string, depth = 1, spotBlack = true): void {
  const [cx, cy] = centroid(shape);
  const xs = shape.map((p) => p[0]);
  const ys = shape.map((p) => p[1]);
  const rx = (Math.max(...xs) - Math.min(...xs)) / 2;
  const ry = (Math.max(...ys) - Math.min(...ys)) / 2;
  ctx.save();
  trace(ctx, shape);
  ctx.clip();
  fill(ctx, rough(ellipsePts(cx + rx * 0.9, cy + ry * 0.75, rx * 0.8, ry * 0.75), s, r, 0.1), shadow);
  if (spotBlack) fill(ctx, rough(ellipsePts(cx + rx * 1.1 * depth, cy + ry * 1.0 * depth, rx * 0.5, ry * 0.45), s, r, 0.12), INK);
  ctx.restore();
}

/** Short wrinkle strokes. */
export function wrinkles(ctx: CanvasRenderingContext2D, lines: Pt[][], width: number, r: Rng): void {
  for (const l of lines) brush(ctx, jitter(resample(l, false, width * 3), width * 0.8, r), width, r);
}

/** A rough, uneven brush loop along a closed outline, e.g. the rim of a chit. */
export function raggedFrame(ctx: CanvasRenderingContext2D, outline: Pt[], width: number, color: string, seed: number): void {
  const r = rng(seed);
  const span = Math.max(...outline.map((p) => Math.abs(p[0])));
  const pts = jitter(resample(outline, true, span * 0.08), span * 0.04, r);
  const n = pts.length;
  for (let i = 0; i < n; ) {
    const len = 4 + Math.floor(r() * 5);
    brush(ctx, Array.from({ length: len + 1 }, (_, k) => pts[(i + k) % n]), width * (0.7 + r() * 0.7), r, color);
    i += len - 1;
  }
}

export function raggedRing(ctx: CanvasRenderingContext2D, radius: number, width: number, color: string): void {
  raggedFrame(ctx, ellipsePts(0, 0, radius, radius, 24), width, color, Math.round(radius));
}
