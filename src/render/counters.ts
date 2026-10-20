import type { Biotype, EnemyWeapon } from '../biotypes';
import { HUMAN_CHIT, drawLaserBastion, drawSentryGun, drawTrooper } from './humans';
import { raggedFrame, raggedRing } from './ink';
import { MONSTER_CHIT, drawBroodSpire, drawCrawler, drawSpitterPod } from './monsters';

// Cardboard counters for the player's pieces, in the style of 70s hex wargames, with
// rough comic-ink art on top. Humans get square chits, monsters round ones; enemies
// are drawn as free-standing figures. All functions draw centered at (0,0) with the
// given size (half-width) in pixels.

export const INK = '#2a1f14';
export const CREAM = '#f3e7c9';
export const RUST = '#c8552b';
export const GOLD = '#e3b448';

/** Cardboard thickness shadow plus face. */
function chitBase(ctx: CanvasRenderingContext2D, size: number, round: boolean, face: string): void {
  const depth = Math.max(1.5, size * 0.12);
  const shape = (dx: number, dy: number) => {
    ctx.beginPath();
    if (round) ctx.arc(dx, dy, size, 0, Math.PI * 2);
    else ctx.roundRect(dx - size, dy - size, size * 2, size * 2, size * 0.18);
  };
  ctx.fillStyle = 'rgba(30, 20, 10, 0.55)';
  shape(depth, depth);
  ctx.fill();
  ctx.fillStyle = face;
  shape(0, 0);
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** Dark round chit with a rough rust rim so it stands out on the space map. */
function monsterChit(ctx: CanvasRenderingContext2D, size: number): void {
  chitBase(ctx, size, true, MONSTER_CHIT);
  raggedRing(ctx, size * 0.88, Math.max(1.5, size * 0.1), RUST);
}

/** Dark square chit with a rough gold rim. */
function humanChit(ctx: CanvasRenderingContext2D, size: number): void {
  chitBase(ctx, size, false, HUMAN_CHIT);
  const e = size * 0.86;
  raggedFrame(ctx, [[-e, -e], [e, -e], [e, e], [-e, e]], Math.max(1.5, size * 0.1), GOLD, Math.round(size));
}

/** Small stat numbers along the bottom edge, like "2-6" on a wargame counter. */
function statLine(ctx: CanvasRenderingContext2D, size: number, text: string, color: string): void {
  if (size < 14) return;
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(size * 0.42)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 0, size * 0.85);
}

/** Drop shadow so a chit-less figure reads as standing on the map. */
function groundShadow(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(size * 0.1, size * 0.85, size * 0.9, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawTower(ctx: CanvasRenderingContext2D, b: Biotype, size: number, stats?: string): void {
  if (b.side === 'human') {
    humanChit(ctx, size);
    ctx.translate(0, -size * 0.08);
    drawLaserBastion(ctx, size * 0.9);
    ctx.translate(0, size * 0.08);
  } else {
    monsterChit(ctx, size);
    drawBroodSpire(ctx, size * 0.95);
  }
  if (stats) statLine(ctx, size, stats, CREAM);
}

export function drawMechanism(ctx: CanvasRenderingContext2D, b: Biotype, size: number, stats?: string): void {
  if (b.side === 'human') {
    humanChit(ctx, size);
    ctx.translate(0, -size * 0.12);
    drawSentryGun(ctx, size * 0.85);
    ctx.translate(0, size * 0.12);
  } else {
    monsterChit(ctx, size);
    ctx.translate(0, -size * 0.12);
    drawSpitterPod(ctx, size * 0.85);
    ctx.translate(0, size * 0.12);
  }
  if (stats) statLine(ctx, size, stats, CREAM);
}

/**
 * `wobble` animates the figure; `variant` picks which trooper (skin, hair, gear) to draw;
 * `attackAnim` (0..1) is the recoil or lunge right after an attack.
 */
export function drawEnemy(ctx: CanvasRenderingContext2D, b: Biotype, size: number, wobble = 0, variant = 0, weapon: EnemyWeapon = 'pistol', attackAnim = 0): void {
  groundShadow(ctx, size);
  if (b.side === 'human') drawTrooper(ctx, size, wobble, variant, weapon === 'rifle', attackAnim);
  else drawCrawler(ctx, size, wobble);
}
