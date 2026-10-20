import { BIOTYPES, type Biotype, ENEMY_WEAPONS, type EnemyWeapon, type Side, type TurretStats, type UpgradeKind, type Weapon, opponentOf } from './biotypes';
import { Board, type Terrain, TOWER_HEX, createRng } from './board';
import { HEX_SPACING, type Hex, type Point, hexDistance, hexKey, hexToWorld, worldToHex, worldDistance } from './hex';
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
  weapon: EnemyWeapon;
  /** Seconds until this enemy can attack again. */
  cooldown: number;
  /** 1 right after an attack, decaying to 0 — drives the lunge / recoil animation. */
  attackAnim: number;
  /** Damage already in flight toward this enemy, so turrets don't overkill. */
  incoming: number;
  /** Animation phase, purely cosmetic. */
  wobble: number;
}

export interface Projectile {
  id: number;
  pos: Point;
  /** An enemy id, or the tower's id for shots fired by enemies. */
  targetId: number;
  speed: number;
  damage: number;
  side: Side;
  weapon: Weapon;
  /** Unit direction of travel, for drawing streaks. */
  dir: Point;
  /** 0 at launch, 1 on impact — used to draw arcing lobs. */
  progress: number;
  startDist: number;
}

/** Things that happened this tick. The UI turns these into sounds and effects. */
export type GameEvent =
  | { type: 'fire'; side: Side; pos: Point; weapon: Weapon }
  | { type: 'hit'; side: Side; pos: Point; weapon: Weapon }
  | { type: 'melee'; side: Side; pos: Point }
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
    const spawnHexes = this.board.edgeHexes().filter((h) => this.flowField.has(hexKey(h)));
    const first = spawnHexes[Math.floor(this.rng() * spawnHexes.length)];
    // A pack enters together along the same stretch of edge.
    const nearby = spawnHexes.filter((h) => hexDistance(h, first) <= 1);
    const count = Math.min(this.enemyType.enemy.packSize, s.remaining);
    for (let i = 0; i < count; i++) this.spawnEnemy(nearby[i % nearby.length], s.spec);
    s.remaining -= count;
  }

  private spawnEnemy(start: Hex, spec: WaveSpec): void {
    const { hp, speed } = spec;
    const weapons = this.enemyType.enemy.weapons;
    this.enemies.push({
      id: this.id(),
      pos: hexToWorld(start),
      target: start,
      hp,
      maxHp: hp,
      speed,
      weapon: weapons[Math.floor(this.rng() * weapons.length)],
      cooldown: 0.3 + this.rng() * 0.5,
      attackAnim: 0,
      incoming: 0,
      wobble: this.rng() * Math.PI * 2,
    });
  }

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      e.attackAnim = Math.max(0, e.attackAnim - dt * 4);
      const weapon = ENEMY_WEAPONS[e.weapon];
      // Close enough to attack: stop and fight instead of advancing.
      if (worldDistance(e.pos, this.tower.pos) <= weapon.range * HEX_SPACING) {
        e.wobble += dt * 2;
        e.cooldown -= dt;
        if (e.cooldown <= 0) {
          e.cooldown += weapon.cooldown;
          this.enemyAttack(e);
        }
        continue;
      }
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
    }
  }

  private enemyAttack(e: Enemy): void {
    const weapon = ENEMY_WEAPONS[e.weapon];
    e.attackAnim = 1;
    const side = this.enemyType.side;
    if (weapon.projectileSpeed === 0) {
      this.emit({ type: 'melee', side, pos: this.tower.pos });
      this.damageTower(weapon.damage);
      return;
    }
    this.launch(e.pos, this.tower.id, this.tower.pos, weapon.projectileSpeed, weapon.damage, side, e.weapon);
    this.emit({ type: 'fire', side, pos: e.pos, weapon: e.weapon });
  }

  private damageTower(amount: number): void {
    this.tower.hp -= amount;
    this.emit({ type: 'towerDamaged', side: this.player.side, pos: this.tower.pos });
  }

  private launch(from: Point, targetId: number, targetPos: Point, speed: number, damage: number, side: Side, weapon: Weapon): void {
    const d = worldDistance(from, targetPos) || 1;
    this.projectiles.push({
      id: this.id(),
      pos: { ...from },
      targetId,
      speed,
      damage,
      side,
      weapon,
      dir: { x: (targetPos.x - from.x) / d, y: (targetPos.y - from.y) / d },
      progress: 0,
      startDist: d,
    });
  }

  private updateTurret(t: Turret, dt: number): void {
    t.cooldown = Math.max(0, t.cooldown - dt);
    if (t.cooldown > 0) return;
    const target = this.pickTarget(t);
    if (!target) return;
    t.cooldown = 1 / t.stats.fireRate;
    target.incoming += t.stats.damage;
    const { projectileSpeed, damage, weapon } = t.stats;
    this.launch(t.pos, target.id, target.pos, projectileSpeed, damage, this.player.side, weapon);
    this.emit({ type: 'fire', side: this.player.side, pos: t.pos, weapon });
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
      const atTower = p.targetId === this.tower.id;
      const e = atTower ? undefined : byId.get(p.targetId);
      if (!atTower && (!e || e.hp <= 0)) continue;
      const goal = e ? e.pos : this.tower.pos;
      const d = worldDistance(p.pos, goal);
      const step = p.speed * dt;
      if (d <= step) {
        this.emit({ type: 'hit', side: atTower ? this.player.side : this.enemyType.side, pos: goal, weapon: p.weapon });
        if (!e) {
          this.damageTower(p.damage);
          continue;
        }
        e.hp -= p.damage;
        e.incoming -= p.damage;
        if (e.hp <= 0) this.emit({ type: 'enemyDeath', side: this.enemyType.side, pos: e.pos });
        continue;
      }
      p.dir = { x: (goal.x - p.pos.x) / d, y: (goal.y - p.pos.y) / d };
      p.pos = { x: p.pos.x + p.dir.x * step, y: p.pos.y + p.dir.y * step };
      p.progress = Math.min(1, 1 - (d - step) / Math.max(p.startDist, d));
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
