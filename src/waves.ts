import type { EnemyStats } from './biotypes';

export interface WaveSpec {
  count: number;
  interval: number;
  hp: number;
  speed: number;
  damage: number;
}

/** Milestone 1 waves: small, sparse, and gently scaling. */
export function waveSpec(wave: number, enemy: EnemyStats): WaveSpec {
  const n = Math.max(1, wave);
  return {
    count: 2 + 2 * n,
    interval: Math.max(0.8, enemy.spawnInterval - 0.1 * (n - 1)),
    hp: Math.round(enemy.hp * (1 + 0.15 * (n - 1)) * 10) / 10,
    speed: enemy.speed,
    damage: enemy.damage,
  };
}
