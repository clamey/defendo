import { ARCING_WEAPONS, type Weapon } from '../biotypes';
import type { Board } from '../board';
import type { Game, GameEvent, Projectile } from '../game';
import { type Hex, type Point, hexCorners, hexDistance, hexToWorld, worldToHex } from '../hex';
import { CREAM, GOLD, INK, RUST, drawEnemy, drawMechanism, drawTower } from './counters';
import { drawAsteroid, drawNebula, hexSeed } from './terrain';

const SPACE = '#2b2540';
const SPACE_LINE = 'rgba(243, 231, 201, 0.22)';
const EDGE_TINT = 'rgba(200, 85, 43, 0.28)';
const ACID = '#9bbf3a';
const MAP_PRINT = '#231d35';
/** World units of margin around the hexes, and extra room at the top for the title. */
const MAP_PAD = 0.9;
const TITLE_BAND = 1.0;

/** World-space rectangle covered by the mounted map board. */
function mapBounds(board: Board): { left: number; right: number; top: number; bottom: number } {
  const halfW = (Math.sqrt(3) * (2 * board.radius + 1)) / 2 + MAP_PAD;
  const halfH = (3 * board.radius + 2) / 2 + MAP_PAD;
  return { left: -halfW, right: halfW, top: -halfH - TITLE_BAND, bottom: halfH };
}

/** How each laser-type weapon's shot looks: streak length (world units), glow and core colors, twin beams. */
const BEAMS: Partial<Record<Weapon, { length: number; width: number; glow: string; core: string; twin?: boolean }>> = {
  twinLaser: { length: 0.6, width: 0.07, glow: 'rgba(227, 180, 72, 0.4)', core: '#fff3c4', twin: true },
  sentryLaser: { length: 0.4, width: 0.05, glow: 'rgba(255, 140, 60, 0.4)', core: '#ffe2b0' },
  pistol: { length: 0.3, width: 0.08, glow: 'rgba(255, 70, 50, 0.45)', core: '#ffd2a0' },
  rifle: { length: 1.1, width: 0.04, glow: 'rgba(255, 50, 50, 0.4)', core: '#ffe0d0' },
};

export interface Hover {
  hex: Hex;
  valid: boolean;
  /** Show this range ring (world units) around the hovered hex. */
  range?: number;
}

interface Effect {
  kind: 'burst' | 'splat' | 'ring' | 'pop' | 'flash' | 'slash' | 'smoke';
  pos: Point;
  age: number;
  life: number;
  color: string;
  seed: number;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 20;
  private origin: Point = { x: 0, y: 0 };
  private dpr = 1;
  private boardCache: HTMLCanvasElement | undefined;
  private boardCacheKey = '';
  private effects: Effect[] = [];
  private shake = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    // The map's printed lettering needs the web fonts; repaint once they arrive.
    void document.fonts?.ready.then(() => (this.boardCacheKey = ''));
  }

  resize(board: Board): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    const map = mapBounds(board);
    const worldW = map.right - map.left;
    const worldH = map.bottom - map.top;
    this.scale = Math.min(this.canvas.width / worldW, this.canvas.height / worldH) * 0.97;
    // Center the whole mounted map (title band included), not just the hexes.
    this.origin = {
      x: this.canvas.width / 2 - ((map.left + map.right) / 2) * this.scale,
      y: this.canvas.height / 2 - ((map.top + map.bottom) / 2) * this.scale,
    };
    this.boardCacheKey = '';
  }

  /** Convert a mouse event position (CSS pixels relative to canvas) to a hex. */
  screenToHex(cssX: number, cssY: number): Hex {
    const x = (cssX * this.dpr - this.origin.x) / this.scale;
    const y = (cssY * this.dpr - this.origin.y) / this.scale;
    return worldToHex({ x, y });
  }

  handleEvent(e: GameEvent): void {
    const add = (kind: Effect['kind'], pos: Point, life: number, color: string) =>
      this.effects.push({ kind, pos: { ...pos }, age: 0, life, color, seed: Math.random() * 1000 });
    switch (e.type) {
      case 'enemyDeath':
        add(e.side === 'human' ? 'burst' : 'splat', e.pos, 0.5, e.side === 'human' ? GOLD : '#9bbf3a');
        break;
      case 'fire':
        add('flash', e.pos, 0.12, ARCING_WEAPONS.has(e.weapon) ? ACID : (BEAMS[e.weapon]?.core ?? CREAM));
        break;
      case 'hit':
        if (ARCING_WEAPONS.has(e.weapon)) {
          add('splat', e.pos, 0.35, ACID);
          add('smoke', e.pos, 0.6, 'rgba(200, 220, 150, 0.6)');
        } else {
          add('pop', e.pos, 0.2, BEAMS[e.weapon]?.core ?? CREAM);
        }
        break;
      case 'melee':
        add('slash', e.pos, 0.35, '#e0402a');
        break;
      case 'towerDamaged':
        add('ring', e.pos, 0.5, RUST);
        this.shake = 0.25;
        break;
      case 'place':
        add('ring', e.pos, 0.4, GOLD);
        break;
    }
  }

  render(game: Game, dt: number, hover?: Hover, placementRange?: number): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.shake = Math.max(0, this.shake - dt);
    const jitter = this.shake > 0 ? this.shake * this.scale * 0.15 : 0;
    ctx.translate((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter);

    ctx.drawImage(this.getBoardLayer(game.board), 0, 0);

    if (placementRange !== undefined) this.drawPlacementZone(game.board, placementRange);
    if (hover) this.drawHover(hover);

    const s = this.scale;
    for (const m of game.mechanisms) {
      this.at(m.pos, () => drawMechanism(ctx, game.player, s * 0.6, `${m.stats.damage}-${m.stats.range}`));
    }
    this.at(game.tower.pos, () =>
      drawTower(ctx, game.player, s * 0.85, `${game.tower.stats.damage}-${game.tower.stats.range}`),
    );
    this.drawTowerHp(game);

    for (const e of game.enemies) {
      this.at(e.pos, () => {
        const dx = game.tower.pos.x - e.pos.x;
        const dy = game.tower.pos.y - e.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        // Crawlers lunge at the tower when they claw; troopers turn to face it.
        if (game.enemyType.side === 'monster') ctx.translate((dx / d) * e.attackAnim * s * 0.4, (dy / d) * e.attackAnim * s * 0.4);
        else if (dx < 0) ctx.scale(-1, 1);
        drawEnemy(ctx, game.enemyType, s * 0.6, e.wobble, e.id, e.weapon, e.attackAnim);
      });
      if (e.hp < e.maxHp) this.drawPips(e.pos, e.hp, e.maxHp);
    }
    this.drawProjectiles(game);
    this.drawEffects(dt);
  }

  // ---- Static board layer (cached until terrain changes) ----

  private getBoardLayer(board: Board): HTMLCanvasElement {
    const key = `${this.canvas.width}x${this.canvas.height}:${board.terrain.size}`;
    if (this.boardCache && key === this.boardCacheKey) return this.boardCache;
    const layer = document.createElement('canvas');
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const ctx = layer.getContext('2d')!;
    this.paintBoard(ctx, board);
    this.boardCache = layer;
    this.boardCacheKey = key;
    return layer;
  }

  private paintBoard(ctx: CanvasRenderingContext2D, board: Board): void {
    const rand = seeded(7);
    const outline = (h: Hex, inset = 1) => {
      const pts = hexCorners(hexToWorld(h), inset).map((p) => this.toScreen(p));
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
    };

    this.paintMapboard(ctx, board);

    // Printed space map.
    for (const h of board.allHexes()) {
      outline(h);
      ctx.fillStyle = SPACE;
      ctx.fill();
    }
    // Star specks.
    ctx.fillStyle = 'rgba(243, 231, 201, 0.7)';
    for (const h of board.allHexes()) {
      const c = this.toScreen(hexToWorld(h));
      for (let i = 0; i < 3; i++) {
        const r = rand() < 0.1 ? 1.6 : 0.8;
        ctx.fillRect(c.x + (rand() - 0.5) * this.scale * 1.4, c.y + (rand() - 0.5) * this.scale * 1.4, r * this.dpr, r * this.dpr);
      }
    }
    // Spawn edge.
    for (const h of board.edgeHexes()) {
      outline(h);
      ctx.fillStyle = EDGE_TINT;
      ctx.fill();
    }
    // Terrain.
    for (const h of board.allHexes()) {
      const t = board.terrainAt(h);
      if (t === 'nebula') this.paintNebula(ctx, h);
      if (t === 'asteroid') this.paintAsteroid(ctx, h);
    }
    // Hex grid lines.
    ctx.strokeStyle = SPACE_LINE;
    ctx.lineWidth = Math.max(1, this.dpr);
    for (const h of board.allHexes()) {
      outline(h);
      ctx.stroke();
    }
    // Map border.
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3 * this.dpr;
    for (const h of board.edgeHexes()) {
      outline(h, 1.02);
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Hex numbers in the corner of each hex, the classic wargame map touch.
    if (this.scale > 24) {
      ctx.fillStyle = 'rgba(243, 231, 201, 0.16)';
      ctx.font = `${Math.round(this.scale * 0.18)}px "Barlow Condensed", sans-serif`;
      ctx.textAlign = 'center';
      for (const h of board.allHexes()) {
        const c = this.toScreen(hexToWorld(h));
        const label = `${String(h.q + board.radius).padStart(2, '0')}${String(h.r + board.radius).padStart(2, '0')}`;
        ctx.fillText(label, c.x, c.y - this.scale * 0.62);
      }
    }
  }

  /** The mounted map board: cardboard edge, printed border rules, and title cartouche. */
  private paintMapboard(ctx: CanvasRenderingContext2D, board: Board): void {
    const m = mapBounds(board);
    const tl = this.toScreen({ x: m.left, y: m.top });
    const br = this.toScreen({ x: m.right, y: m.bottom });
    const w = br.x - tl.x;
    const h = br.y - tl.y;
    const s = this.scale;

    // Board resting on the table: soft shadow plus a thick cardboard edge.
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = s * 0.6;
    ctx.shadowOffsetY = s * 0.15;
    ctx.fillStyle = '#1a1424';
    ctx.fillRect(tl.x, tl.y + s * 0.08, w, h);
    ctx.restore();
    ctx.fillStyle = MAP_PRINT;
    ctx.fillRect(tl.x, tl.y, w, h);

    // Double border rule.
    ctx.strokeStyle = 'rgba(243, 231, 201, 0.55)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.strokeRect(tl.x + s * 0.25, tl.y + s * 0.25, w - s * 0.5, h - s * 0.5);
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.strokeRect(tl.x + s * 0.38, tl.y + s * 0.38, w - s * 0.76, h - s * 0.76);

    // Title cartouche, top left.
    const titleY = tl.y + s * 0.38 + TITLE_BAND * s * 0.62;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = GOLD;
    ctx.font = `${Math.round(s * 0.75)}px Righteous, sans-serif`;
    ctx.fillText('Defendo', tl.x + s * 0.7, titleY);
    const logoW = ctx.measureText('Defendo').width;
    ctx.fillStyle = CREAM;
    ctx.font = `700 ${Math.round(s * 0.36)}px "Barlow Condensed", sans-serif`;
    ctx.fillText('TACTICAL MAP · SECTOR 7', tl.x + s * 0.95 + logoW, titleY);
    // Scale note, top right.
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(243, 231, 201, 0.6)';
    ctx.font = `600 ${Math.round(s * 0.3)}px "Barlow Condensed", sans-serif`;
    ctx.fillText('1 HEX = 1 PARSEC  ·  ORANGE HEXES: ENEMY ENTRY', br.x - s * 0.7, titleY);
  }

  private paintNebula(ctx: CanvasRenderingContext2D, h: Hex): void {
    const c = this.toScreen(hexToWorld(h));
    const pts = hexCorners(hexToWorld(h)).map((p) => this.toScreen(p));
    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.clip();
    ctx.translate(c.x, c.y);
    drawNebula(ctx, this.scale, hexSeed(h.q, h.r));
    ctx.restore();
  }

  private paintAsteroid(ctx: CanvasRenderingContext2D, h: Hex): void {
    const c = this.toScreen(hexToWorld(h));
    ctx.save();
    ctx.translate(c.x, c.y);
    drawAsteroid(ctx, this.scale, hexSeed(h.q, h.r));
    ctx.restore();
  }

  // ---- Dynamic layers ----

  private drawPlacementZone(board: Board, range: number): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(227, 180, 72, 0.12)';
    for (const h of board.allHexes()) {
      if (hexDistance(h, { q: 0, r: 0 }) > range) continue;
      this.hexPath(h, 0.96);
      ctx.fill();
    }
  }

  private drawHover(hover: Hover): void {
    const { ctx } = this;
    this.hexPath(hover.hex, 0.92);
    ctx.lineWidth = 3 * this.dpr;
    ctx.strokeStyle = hover.valid ? GOLD : RUST;
    ctx.fillStyle = hover.valid ? 'rgba(227, 180, 72, 0.25)' : 'rgba(200, 85, 43, 0.25)';
    ctx.fill();
    ctx.stroke();
    const c = this.toScreen(hexToWorld(hover.hex));
    if (!hover.valid) {
      const r = this.scale * 0.3;
      ctx.beginPath();
      ctx.moveTo(c.x - r, c.y - r);
      ctx.lineTo(c.x + r, c.y + r);
      ctx.moveTo(c.x + r, c.y - r);
      ctx.lineTo(c.x - r, c.y + r);
      ctx.stroke();
    } else if (hover.range) {
      ctx.setLineDash([6 * this.dpr, 6 * this.dpr]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, hover.range * this.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawTowerHp(game: Game): void {
    const { ctx } = this;
    const c = this.toScreen(game.tower.pos);
    const w = this.scale * 1.6;
    const h = Math.max(4, this.scale * 0.14);
    const y = c.y + this.scale * 0.95;
    ctx.fillStyle = INK;
    ctx.fillRect(c.x - w / 2 - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(c.x - w / 2, y, w, h);
    const frac = Math.max(0, game.tower.hp / game.tower.maxHp);
    ctx.fillStyle = frac > 0.5 ? '#9bbf3a' : frac > 0.25 ? GOLD : RUST;
    ctx.fillRect(c.x - w / 2, y, w * frac, h);
  }

  private drawPips(pos: Point, hp: number, maxHp: number): void {
    const { ctx } = this;
    const c = this.toScreen(pos);
    const w = this.scale * 0.7;
    const h = Math.max(2, this.scale * 0.07);
    const y = c.y - this.scale * 0.55;
    ctx.fillStyle = INK;
    ctx.fillRect(c.x - w / 2, y, w, h);
    ctx.fillStyle = RUST;
    ctx.fillRect(c.x - w / 2, y, w * Math.max(0, hp / maxHp), h);
  }

  private drawProjectiles(game: Game): void {
    for (const p of game.projectiles) {
      if (ARCING_WEAPONS.has(p.weapon)) this.drawGlob(p);
      else this.drawBeam(p);
    }
  }

  /** Laser streak trailing behind the shot's position. */
  private drawBeam(p: Projectile): void {
    const { ctx } = this;
    const beam = BEAMS[p.weapon];
    if (!beam) return;
    const c = this.toScreen(p.pos);
    const len = beam.length * this.scale;
    const offsets = beam.twin ? [-0.09, 0.09] : [0];
    ctx.lineCap = 'round';
    for (const o of offsets) {
      const ox = -p.dir.y * o * this.scale;
      const oy = p.dir.x * o * this.scale;
      const head = { x: c.x + ox, y: c.y + oy };
      const tail = { x: head.x - p.dir.x * len, y: head.y - p.dir.y * len };
      for (const [color, w] of [[beam.glow, beam.width * 3.5], [beam.core, beam.width]] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, w * this.scale);
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();
      }
    }
  }

  /** Acid glob lobbed in an arc, with a ground shadow and a dripping trail. */
  private drawGlob(p: Projectile): void {
    const { ctx } = this;
    const big = p.weapon === 'spireSpit';
    const c = this.toScreen(p.pos);
    const lift = Math.sin(Math.PI * p.progress) * Math.min(p.startDist, 6) * 0.3 * this.scale;
    const r = this.scale * (big ? 0.2 : 0.12);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    const y = c.y - lift;
    ctx.fillStyle = ACID;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(c.x - p.dir.x * r * 1.4 * i, y - p.dir.y * r * 1.4 * i + i * r * 0.3, r * (0.5 - i * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, this.scale * 0.04);
    ctx.beginPath();
    ctx.ellipse(c.x, y, r, r * 0.8, (p.id % 6) * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 220, 0.7)';
    ctx.beginPath();
    ctx.arc(c.x - r * 0.35, y - r * 0.3, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawEffects(dt: number): void {
    const { ctx } = this;
    const s = this.scale;
    for (const fx of this.effects) {
      fx.age += dt;
      const t = Math.min(1, fx.age / fx.life);
      const c = this.toScreen(fx.pos);
      ctx.globalAlpha = 1 - t;
      if (fx.kind === 'burst') {
        // 70s comic starburst.
        const spikes = 10;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const a = (i / (spikes * 2)) * Math.PI * 2 + fx.seed;
          const r = (i % 2 ? 0.25 : 0.7) * s * (0.4 + t);
          ctx.lineTo(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = fx.color;
        ctx.fill();
        ctx.strokeStyle = RUST;
        ctx.lineWidth = Math.max(1, s * 0.05);
        ctx.stroke();
      } else if (fx.kind === 'splat') {
        // Goo splat with droplets.
        const rand = seeded(fx.seed);
        ctx.fillStyle = fx.color;
        for (let i = 0; i < 7; i++) {
          const a = rand() * Math.PI * 2;
          const d = s * (0.1 + rand() * 0.6) * (0.5 + t);
          ctx.beginPath();
          ctx.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, s * (0.06 + rand() * 0.12), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (fx.kind === 'flash') {
        // Muzzle flash: a quick bright star.
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + fx.seed;
          const r = (i % 2 ? 0.12 : 0.4) * s * (1 - t * 0.5);
          ctx.lineTo(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      } else if (fx.kind === 'slash') {
        // Three claw rakes drawn across the tower.
        ctx.strokeStyle = fx.color;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        const reach = Math.min(1, t * 3);
        const a = (fx.seed % 2) - 0.5;
        for (const o of [-0.25, 0, 0.25]) {
          const x0 = c.x + (o - 0.35) * s;
          const y0 = c.y - 0.45 * s + a * o * s;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + 0.7 * s * reach, y0 + 0.9 * s * reach);
          ctx.stroke();
        }
      } else if (fx.kind === 'smoke') {
        // Acid fumes curling up.
        const rand = seeded(fx.seed);
        ctx.fillStyle = fx.color;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(c.x + (rand() - 0.5) * s * 0.5, c.y - t * s * (0.5 + rand() * 0.5), s * (0.08 + t * 0.12), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (fx.kind === 'ring') {
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 3 * this.dpr;
        ctx.beginPath();
        ctx.arc(c.x, c.y, s * (0.5 + t * 0.9), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        ctx.arc(c.x, c.y, s * 0.2 * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    this.effects = this.effects.filter((fx) => fx.age < fx.life);
  }

  // ---- Helpers ----

  private toScreen(p: Point): Point {
    return { x: this.origin.x + p.x * this.scale, y: this.origin.y + p.y * this.scale };
  }

  private at(pos: Point, draw: () => void): void {
    const c = this.toScreen(pos);
    this.ctx.save();
    this.ctx.translate(c.x, c.y);
    draw();
    this.ctx.restore();
  }

  private hexPath(h: Hex, inset: number): void {
    const pts = hexCorners(hexToWorld(h), inset).map((p) => this.toScreen(p));
    this.ctx.beginPath();
    pts.forEach((p, i) => (i ? this.ctx.lineTo(p.x, p.y) : this.ctx.moveTo(p.x, p.y)));
    this.ctx.closePath();
  }
}

function seeded(seed: number): () => number {
  let a = Math.floor(seed * 9973) >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

