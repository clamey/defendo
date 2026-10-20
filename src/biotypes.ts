export type Side = 'human' | 'monster';

export const opponentOf = (side: Side): Side => (side === 'human' ? 'monster' : 'human');

/** Every weapon in the game. Each one has its own projectile look and sound. */
export type Weapon = 'twinLaser' | 'sentryLaser' | 'pistol' | 'rifle' | 'spireSpit' | 'podSpit' | 'claws';
export type EnemyWeapon = 'pistol' | 'rifle' | 'claws';

/** Acid is lobbed in an arc; lasers fly straight. */
export const ARCING_WEAPONS: ReadonlySet<Weapon> = new Set(['spireSpit', 'podSpit']);

export interface EnemyWeaponStats {
  /** Attack range in hexes; enemies stop advancing once the tower is this close. */
  range: number;
  /** Seconds between attacks. */
  cooldown: number;
  damage: number;
  /** World units per second; 0 means a melee attack. */
  projectileSpeed: number;
}

export const ENEMY_WEAPONS: Record<EnemyWeapon, EnemyWeaponStats> = {
  pistol: { range: 1.5, cooldown: 1.8, damage: 1, projectileSpeed: 10 },
  rifle: { range: 2.5, cooldown: 2.8, damage: 1, projectileSpeed: 16 },
  claws: { range: 0.8, cooldown: 1.0, damage: 1, projectileSpeed: 0 },
};

export interface TurretStats {
  name: string;
  weapon: Weapon;
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
  /** Weapons this enemy type carries; each enemy gets one. */
  weapons: EnemyWeapon[];
  /** Seconds between spawns. */
  spawnInterval: number;
  /** How many arrive together per spawn (crawlers swarm in packs). */
  packSize: number;
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
    tagline: 'Scrappy freedom fighters of the Outer Colonies.',
    tower: { name: 'Laser Bastion', weapon: 'twinLaser', maxHp: 20, range: 4, fireRate: 1.6, damage: 2, projectileSpeed: 14 },
    mechanism: { name: 'Sentry Gun', weapon: 'sentryLaser', range: 3, fireRate: 1.0, damage: 1, projectileSpeed: 12 },
    enemy: { name: 'Trooper', hp: 3, speed: 0.75, weapons: ['pistol', 'rifle'], spawnInterval: 1.8, packSize: 1 },
    palette: { primary: '#2f6f8f', secondary: '#e3b448', ink: '#1d2b33' },
  },
  monster: {
    side: 'monster',
    name: 'Space Monsters',
    tagline: 'The hungry brood from beyond the Crab Nebula.',
    tower: { name: 'Brood Spire', weapon: 'spireSpit', maxHp: 20, range: 4, fireRate: 1.6, damage: 2, projectileSpeed: 13 },
    mechanism: { name: 'Spitter Pod', weapon: 'podSpit', range: 3, fireRate: 1.0, damage: 1, projectileSpeed: 9 },
    enemy: { name: 'Crawler', hp: 2, speed: 1.25, weapons: ['claws'], spawnInterval: 1.4, packSize: 3 },
    palette: { primary: '#6b8e23', secondary: '#c8552b', ink: '#2b2412' },
  },
};

export type UpgradeKind = 'fireRate' | 'range' | 'damage';

export const UPGRADES: Record<UpgradeKind, { label: string; describe: string }> = {
  fireRate: { label: 'Rapid Fire', describe: '+25% fire rate' },
  range: { label: 'Long Sight', describe: '+1 hex range' },
  damage: { label: 'Heavy Rounds', describe: '+1 damage' },
};
