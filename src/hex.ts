// Axial hex coordinates, pointy-top orientation.
// World units: a hex has size 1 (center to corner).

export interface Hex {
  q: number;
  r: number;
}

export interface Point {
  x: number;
  y: number;
}

const SQRT3 = Math.sqrt(3);

/** World distance between adjacent hex centers. */
export const HEX_SPACING = SQRT3;

export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const hex = (q: number, r: number): Hex => ({ q, r });

export const hexKey = (h: Hex): string => `${h.q},${h.r}`;

export function parseKey(key: string): Hex {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export const hexEquals = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

export const neighbors = (h: Hex): Hex[] => DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));

export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexToWorld(h: Hex): Point {
  return { x: SQRT3 * (h.q + h.r / 2), y: 1.5 * h.r };
}

export function worldToHex(p: Point): Hex {
  const q = (SQRT3 / 3) * p.x - p.y / 3;
  const r = (2 / 3) * p.y;
  return hexRound(q, r);
}

function hexRound(fq: number, fr: number): Hex {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  // Normalize -0 so keys are stable.
  return { q: q + 0, r: r + 0 };
}

/** All hexes within `radius` of the origin. */
export function hexesInRadius(radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) out.push({ q, r });
  }
  return out;
}

/** Hexes exactly `radius` away from the origin. */
export function ring(radius: number): Hex[] {
  return hexesInRadius(radius).filter((h) => hexDistance(h, { q: 0, r: 0 }) === radius);
}

/** Corner points of a hex at `center` in world units (pointy-top). */
export function hexCorners(center: Point, size = 1): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push({ x: center.x + size * Math.cos(a), y: center.y + size * Math.sin(a) });
  }
  return pts;
}

export const worldDistance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
