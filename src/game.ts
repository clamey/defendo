import { BIOTYPES, type Biotype, type Side, type TurretStats, type UpgradeKind, opponentOf } from './biotypes';
import { Board, type Terrain, TOWER_HEX, createRng, scatterTerrain } from './board';
import { HEX_SPACING, type Hex, type Point, hexKey, hexToWorld, worldToHex, worldDistance } from './hex';
import { computeFlowField, nextStep } from './pathing';
import { type WaveSpec, waveSpec } from './waves';

export const BOARD_RADIUS = 6;
export const FINAL_WAVE = 5;

export type Phase = 'ready' | 'wave' | 'build-mechanism' | 'build-terrain' | 'victory' | 'defeat';

export interface Turret {
  id: number;
  hex: Hex;
  pos: Point;
  stats: TurretStats;
  cooldown: number;
}

export interface Enemy {
  id: number;
  pos: Point;
  /** Hex the enemy is walking toward. */
  target: Hex;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  /** Damage already in flight toward this enemy, so turrets don't overkill. */
  incoming: number;
  /** Animation phase, purely cosmetic. */
  wobble: number;
}

export interface Projectile {
  id: number;
  pos: Point;
  targetId: number;
  speed: number;
  damage: number;
  side: Side;
}

/** Things that happened this tick. The UI turns these into sounds and effects. */
export type GameEvent =
  | { type: 'fire'; side: Side; pos: Point }
  | { type: 'hit'; side: Side; pos: Point }
  | { type: 'enemyDeath'; side: Side; pos: Point }
  | { type: 'towerDamaged'; side: Side; pos: Point }
  | { type: 'waveStart'; side: Side; wave: number }
  | { type: 'waveClear'; side: Side; wave: number }
  | { type: 'place'; side: Side; pos: Point }
  | { type: 'victory'; side: Side }
  | { type: 'defeat'; side: Side };

export class Game {
  readonly player: Biotype;
  readonly enemyType: Biotype;
  readonly board: Board;
  readonly tower: Turret & { hp: number; maxHp: number };
  readonly mechanisms: Turret[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  phase: Phase = 'ready';
  wave = 0;
  readonly upgrades: Record<UpgradeKind, number> = { fireRate: 0, range: 0, damage: 0 };

  private events: GameEvent[] = [];
  private nextId = 1;
  private flowField: Map<string, number>;
  private spawn: { spec: WaveSpec; remaining: number; timer: number } | undefined;
  private readonly rng: () => number;

  constructor(side: Side, seed = Date.now()) {
    this.player = BIOTYPES[side];
    this.enemyType = BIOTYPES[opponentOf(side)];
    this.rng = createRng(seed);
    this.board = new Board(BOARD_RADIUS);
    scatterTerrain(this.board, this.rng);
    this.flowField = computeFlowField(this.board);
    const t = this.player.tower;
    this.tower = {
      id: this.id(),
      hex: TOWER_HEX,
      pos: hexToWorld(TOWER_HEX),
      stats: { ...t },
      cooldown: 0,
      hp: t.maxHp,
      maxHp: t.maxHp,
    };
  }

  /** Drain events produced since the last call. */
  takeEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  startNextWave(): void {
    if (this.phase === 'wave' || this.phase === 'victory' || this.phase === 'defeat') return;
    this.wave++;
    const spec = waveSpec(this.wave, this.enemyType.enemy);
    this.spawn = { spec, remaining: spec.count, timer: 0.5 };
    this.phase = 'wave';
    this.emit({ type: 'waveStart', side: this.enemyType.side, wave: this.wave });
  }

  // ---- Build phase ----

  applyUpgrade(kind: UpgradeKind): boolean {
    if (this.phase !== 'build-mechanism') return false;
    this.upgrades[kind]++;
    const s = this.tower.stats;
    if (kind === 'fireRate') s.fireRate *= 1.25;
    if (kind === 'range') s.range += 1;
    if (kind === 'damage') s.damage += 1;
    this.emit({ type: 'place', side: this.player.side, pos: this.tower.pos });
    this.phase = 'build-terrain';
    return true;
  }

  placeMechanism(h: Hex): boolean {
    if (this.phase !== 'build-mechanism' || !this.board.placeMechanism(h)) return false;
    const pos = hexToWorld(h);
    this.mechanisms.push({ id: this.id(), hex: h, pos, stats: { ...this.player.mechanism }, cooldown: 0 });
    this.flowField = computeFlowField(this.board);
    this.emit({ type: 'place', side: this.player.side, pos });
    this.phase = 'build-terrain';
    return true;
  }

  placeTerrain(h: Hex, type: Terrain): boolean {
    if (this.phase !== 'build-terrain' || !this.board.placeTerrain(h, type)) return false;
    this.flowField = computeFlowField(this.board);
    this.emit({ type: 'place', side: this.player.side, pos: hexToWorld(h) });
    this.startNextWave();
    return true;
  }

  // ---- Simulation ----

  update(dt: number): void {
    if (this.phase !== 'wave') return;
    this.updateSpawning(dt);
    this.updateEnemies(dt);
    this.updateTurret(this.tower, dt);
    for (const m of this.mechanisms) this.updateTurret(m, dt);
    this.updateProjectiles(dt);

    if (this.tower.hp <= 0) {
      this.phase = 'defeat';
      this.emit({ type: 'defeat', side: this.player.side });
      return;
    }
    if (this.spawn?.remaining === 0 && this.enemies.length === 0) {
      this.spawn = undefined;
      this.projectiles = [];
      this.emit({ type: 'waveClear', side: this.player.side, wave: this.wave });
      if (this.wave >= FINAL_WAVE) {
        this.phase = 'victory';
        this.emit({ type: 'victory', side: this.player.side });
      } else {
        this.phase = 'build-mechanism';
      }
    }
  }

  private updateSpawning(dt: number): void {
    const s = this.spawn;
    if (!s || s.remaining === 0) return;
    s.timer -= dt;
    if (s.timer > 0) return;
    s.timer += s.spec.interval;
    s.remaining--;
    const spawnHexes = this.board.edgeHexes().filter((h) => this.flowField.has(hexKey(h)));
    const start = spawnHexes[Math.floor(this.rng() * spawnHexes.length)];
    const { hp, speed, damage } = s.spec;
    this.enemies.push({
      id: this.id(),
      pos: hexToWorld(start),
      target: start,
      hp,
      maxHp: hp,
      speed,
      damage,
      incoming: 0,
      wobble: this.rng() * Math.PI * 2,
    });
  }

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      e.wobble += dt * 6;
      const here = worldToHex(e.pos);
      const slow = this.board.terrainAt(here) === 'nebula' ? 0.5 : 1;
      let budget = e.speed * slow * dt * HEX_SPACING;
      while (budget > 0) {
        const goal = hexToWorld(e.target);
        const d = worldDistance(e.pos, goal);
        if (d > budget) {
          e.pos = { x: e.pos.x + ((goal.x - e.pos.x) / d) * budget, y: e.pos.y + ((goal.y - e.pos.y) / d) * budget };
          break;
        }
        e.pos = goal;
        budget -= d;
        if (this.board.isTower(e.target)) break;
        const next = nextStep(this.board, this.flowField, e.target);
        if (!next) break;
        e.target = next;
      }
      if (this.board.isTower(e.target) && worldDistance(e.pos, this.tower.pos) < 0.6) {
        this.tower.hp -= e.damage;
        e.hp = 0;
        this.emit({ type: 'towerDamaged', side: this.player.side, pos: this.tower.pos });
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  private updateTurret(t: Turret, dt: number): void {
    t.cooldown = Math.max(0, t.cooldown - dt);
    if (t.cooldown > 0) return;
    const target = this.pickTarget(t);
    if (!target) return;
    t.cooldown = 1 / t.stats.fireRate;
    target.incoming += t.stats.damage;
    this.projectiles.push({
      id: this.id(),
      pos: { ...t.pos },
      targetId: target.id,
      speed: t.stats.projectileSpeed,
      damage: t.stats.damage,
      side: this.player.side,
    });
    this.emit({ type: 'fire', side: this.player.side, pos: t.pos });
  }

  /** Closest-to-tower enemy in range that isn't already doomed by shots in flight. */
  private pickTarget(t: Turret): Enemy | undefined {
    let best: Enemy | undefined;
    let bestDist = Infinity;
    for (const e of this.enemies) {
      if (e.hp - e.incoming <= 0) continue;
      if (worldDistance(e.pos, t.pos) > t.stats.range * HEX_SPACING) continue;
      const d = worldDistance(e.pos, this.tower.pos);
      if (d < bestDist) {
        best = e;
        bestDist = d;
      }
    }
    return best;
  }

  private updateProjectiles(dt: number): void {
    const byId = new Map(this.enemies.map((e) => [e.id, e]));
    const live: Projectile[] = [];
    for (const p of this.projectiles) {
      const e = byId.get(p.targetId);
      if (!e || e.hp <= 0) continue;
      const d = worldDistance(p.pos, e.pos);
      const step = p.speed * dt;
      if (d <= step) {
        e.hp -= p.damage;
        e.incoming -= p.damage;
        if (e.hp <= 0) this.emit({ type: 'enemyDeath', side: this.enemyType.side, pos: e.pos });
        else this.emit({ type: 'hit', side: this.enemyType.side, pos: e.pos });
        continue;
      }
      p.pos = { x: p.pos.x + ((e.pos.x - p.pos.x) / d) * step, y: p.pos.y + ((e.pos.y - p.pos.y) / d) * step };
      live.push(p);
    }
    this.projectiles = live;
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private id(): number {
    return this.nextId++;
  }
}
