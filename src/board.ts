import { type Hex, hex, hexKey, hexesInRadius, hexDistance, ring } from './hex';
import { computeFlowField } from './pathing';

export type Terrain = 'asteroid' | 'nebula';

export const TERRAIN_INFO: Record<Terrain, { label: string; describe: string }> = {
  asteroid: { label: 'Asteroid', describe: 'Blocks enemy movement' },
  nebula: { label: 'Nebula', describe: 'Slows enemies to half speed' },
};

export const TOWER_HEX: Hex = hex(0, 0);

/** Mechanisms must be built this close to the tower so they help defend it. */
export const MECHANISM_BUILD_RADIUS = 3;

export class Board {
  readonly radius: number;
  readonly terrain = new Map<string, Terrain>();
  /** Hexes occupied by mechanisms (they block movement). */
  readonly mechanisms = new Set<string>();
  private readonly cells: Set<string>;

  constructor(radius: number) {
    this.radius = radius;
    this.cells = new Set(hexesInRadius(radius).map(hexKey));
  }

  allHexes(): Hex[] {
    return hexesInRadius(this.radius);
  }

  edgeHexes(): Hex[] {
    return ring(this.radius);
  }

  inBounds(h: Hex): boolean {
    return this.cells.has(hexKey(h));
  }

  terrainAt(h: Hex): Terrain | undefined {
    return this.terrain.get(hexKey(h));
  }

  isTower(h: Hex): boolean {
    return h.q === TOWER_HEX.q && h.r === TOWER_HEX.r;
  }

  isPassable(h: Hex): boolean {
    const key = hexKey(h);
    return this.cells.has(key) && this.terrain.get(key) !== 'asteroid' && !this.mechanisms.has(key);
  }

  isEmpty(h: Hex): boolean {
    const key = hexKey(h);
    return this.cells.has(key) && !this.isTower(h) && !this.terrain.has(key) && !this.mechanisms.has(key);
  }

  /** Whether placing a blocking piece here would still let every open hex reach the tower. */
  keepsAllReachable(h: Hex): boolean {
    const key = hexKey(h);
    this.mechanisms.add(key);
    const ok = this.everyPassableHexReachesTower();
    this.mechanisms.delete(key);
    return ok;
  }

  canPlaceTerrain(h: Hex, type: Terrain): boolean {
    if (!this.isEmpty(h)) return false;
    if (type === 'nebula') return true;
    return this.keepsAllReachable(h);
  }

  canPlaceMechanism(h: Hex): boolean {
    return this.isEmpty(h) && hexDistance(h, TOWER_HEX) <= MECHANISM_BUILD_RADIUS && this.keepsAllReachable(h);
  }

  placeTerrain(h: Hex, type: Terrain): boolean {
    if (!this.canPlaceTerrain(h, type)) return false;
    this.terrain.set(hexKey(h), type);
    return true;
  }

  placeMechanism(h: Hex): boolean {
    if (!this.canPlaceMechanism(h)) return false;
    this.mechanisms.add(hexKey(h));
    return true;
  }

  private everyPassableHexReachesTower(): boolean {
    const field = computeFlowField(this);
    return this.allHexes().every((h) => !this.isPassable(h) || field.has(hexKey(h)));
  }
}

/** Seeded PRNG (mulberry32) so boards and waves are reproducible in tests. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scatter a few starting terrain tiles, away from the tower and the edge. */
export function scatterTerrain(board: Board, rng: () => number, asteroids = 4, nebulas = 3): void {
  const candidates = board
    .allHexes()
    .filter((h) => {
      const d = hexDistance(h, TOWER_HEX);
      return d >= 2 && d <= board.radius - 1;
    });
  const place = (type: Terrain, count: number) => {
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < 200) {
      attempts++;
      const h = candidates[Math.floor(rng() * candidates.length)];
      if (board.placeTerrain(h, type)) placed++;
    }
  };
  place('asteroid', asteroids);
  place('nebula', nebulas);
}
