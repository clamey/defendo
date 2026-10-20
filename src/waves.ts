import type { EnemyStats } from './biotypes';

export interface WaveSpec {
  count: number;
  interval: number;
  hp: number;
  speed: number;
}

/** Milestone 1 waves: small, sparse, and gently scaling. */
export function waveSpec(wave: number, enemy: EnemyStats): WaveSpec {
  const n = Math.max(1, wave);
  return {
    count: 2 + 2 * n,
    // Packs arrive less often so the overall pace matches single spawns.
    interval: Math.max(0.8, enemy.spawnInterval - 0.1 * (n - 1)) * enemy.packSize,
    hp: Math.round(enemy.hp * (1 + 0.15 * (n - 1)) * 10) / 10,
    speed: enemy.speed,
  };
}
