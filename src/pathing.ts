import type { Board } from './board';
import { TOWER_HEX } from './board';
import { type Hex, hexKey, neighbors } from './hex';

/** Cost to enter a hex. Nebulas cost more so enemies prefer to route around them. */
function entryCost(board: Board, h: Hex): number {
  return board.terrainAt(h) === 'nebula' ? 2 : 1;
}

/**
 * Distance-to-tower for every passable hex (Dijkstra from the tower outward).
 * Hexes missing from the map cannot reach the tower.
 */
export function computeFlowField(board: Board): Map<string, number> {
  const dist = new Map<string, number>([[hexKey(TOWER_HEX), 0]]);
  // Costs are tiny integers, so a bucket queue is simple and fast.
  const buckets: Hex[][] = [[TOWER_HEX]];
  for (let d = 0; d < buckets.length; d++) {
    for (const h of buckets[d] ?? []) {
      if (dist.get(hexKey(h)) !== d) continue;
      // Cost of moving from n into h — enemies walk toward the tower.
      const cost = d + (board.isTower(h) ? 1 : entryCost(board, h));
      for (const n of neighbors(h)) {
        if (!board.isPassable(n)) continue;
        const key = hexKey(n);
        const known = dist.get(key);
        if (known !== undefined && known <= cost) continue;
        dist.set(key, cost);
        (buckets[cost] ??= []).push(n);
      }
    }
  }
  return dist;
}

/** The neighbor an enemy at `h` should step to next, or undefined if stuck / at the tower. */
export function nextStep(board: Board, field: Map<string, number>, h: Hex): Hex | undefined {
  const here = field.get(hexKey(h));
  if (here === undefined || here === 0) return undefined;
  let best: Hex | undefined;
  let bestDist = here;
  for (const n of neighbors(h)) {
    const d = board.isTower(n) ? 0 : field.get(hexKey(n));
    if (d !== undefined && d < bestDist) {
      best = n;
      bestDist = d;
    }
  }
  return best;
}
