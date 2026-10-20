export type Side = 'human' | 'monster';

export const opponentOf = (side: Side): Side => (side === 'human' ? 'monster' : 'human');

export interface TurretStats {
  name: string;
  /** Range in hexes. */
  range: number;
  /** Shots per second. */
  fireRate: number;
  damage: number;
  projectileSpeed: number;
}

export interface EnemyStats {
  name: string;
  hp: number;
  /** Hexes per second. */
  speed: number;
  /** Damage dealt to the tower on arrival. */
  damage: number;
  /** Seconds between spawns. */
  spawnInterval: number;
}

export interface Palette {
  primary: string;
  secondary: string;
  ink: string;
}

export interface Biotype {
  side: Side;
  name: string;
  tagline: string;
  tower: TurretStats & { maxHp: number };
  mechanism: TurretStats;
  enemy: EnemyStats;
  palette: Palette;
}

export const BIOTYPES: Record<Side, Biotype> = {
  human: {
    side: 'human',
    name: 'Human Space Warriors',
    tagline: 'Disciplined troopers of the Terran Star Legion.',
    tower: { name: 'Laser Bastion', maxHp: 20, range: 4, fireRate: 1.6, damage: 2, projectileSpeed: 14 },
    mechanism: { name: 'Sentry Gun', range: 3, fireRate: 1.0, damage: 1, projectileSpeed: 12 },
    enemy: { name: 'Trooper', hp: 3, speed: 0.75, damage: 1, spawnInterval: 1.8 },
    palette: { primary: '#2f6f8f', secondary: '#e3b448', ink: '#1d2b33' },
  },
  monster: {
    side: 'monster',
    name: 'Space Monsters',
    tagline: 'The hungry brood from beyond the Crab Nebula.',
    tower: { name: 'Brood Spire', maxHp: 20, range: 4, fireRate: 1.6, damage: 2, projectileSpeed: 10 },
    mechanism: { name: 'Spitter Pod', range: 3, fireRate: 1.0, damage: 1, projectileSpeed: 9 },
    enemy: { name: 'Crawler', hp: 2, speed: 0.95, damage: 1, spawnInterval: 1.4 },
    palette: { primary: '#6b8e23', secondary: '#c8552b', ink: '#2b2412' },
  },
};

export type UpgradeKind = 'fireRate' | 'range' | 'damage';

export const UPGRADES: Record<UpgradeKind, { label: string; describe: string }> = {
  fireRate: { label: 'Rapid Fire', describe: '+25% fire rate' },
  range: { label: 'Long Sight', describe: '+1 hex range' },
  damage: { label: 'Heavy Rounds', describe: '+1 damage' },
};
