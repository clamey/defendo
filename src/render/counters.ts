import type { Biotype } from '../biotypes';

// Cardboard counter drawings, in the style of 70s hex wargames.
// Humans get square chits with military-style symbols; monsters get round organic chits.
// All functions draw centered at (0,0) with the given size (half-width) in pixels.

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

/** Small stat numbers along the bottom edge, like "2-6" on a wargame counter. */
function statLine(ctx: CanvasRenderingContext2D, size: number, text: string, color: string): void {
  if (size < 14) return;
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.round(size * 0.36)}px "Space Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 0, size * 0.85);
}

/** Slightly misregistered second print pass, for that cheap offset-press look. */
function misregister(ctx: CanvasRenderingContext2D, size: number, draw: () => void): void {
  ctx.save();
  ctx.translate(size * 0.04, -size * 0.03);
  ctx.globalAlpha = 0.35;
  ctx.globalCompositeOperation = 'multiply';
  draw();
  ctx.restore();
  draw();
}

export function drawTower(ctx: CanvasRenderingContext2D, b: Biotype, size: number, stats?: string): void {
  const { primary, secondary } = b.palette;
  if (b.side === 'human') {
    chitBase(ctx, size, false, primary);
    misregister(ctx, size, () => {
      // Fortification symbol: a box with crenellations and a laser emplacement.
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = size * 0.09;
      ctx.strokeRect(-size * 0.6, -size * 0.45, size * 1.2, size * 0.75);
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(i * size * 0.25, -size * 0.45);
        ctx.lineTo(i * size * 0.25, -size * 0.62);
      }
      ctx.stroke();
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.arc(0, -size * 0.08, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    chitBase(ctx, size, true, primary);
    misregister(ctx, size, () => {
      // A writhing spire with a single great eye.
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.8);
      ctx.quadraticCurveTo(size * 0.55, -size * 0.1, size * 0.5, size * 0.4);
      ctx.lineTo(-size * 0.5, size * 0.4);
      ctx.quadraticCurveTo(-size * 0.55, -size * 0.1, 0, -size * 0.8);
      ctx.fill();
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.05, size * 0.24, size * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.05, size * 0.06, size * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  if (stats) statLine(ctx, size, stats, b.side === 'human' ? GOLD : CREAM);
}

export function drawMechanism(ctx: CanvasRenderingContext2D, b: Biotype, size: number, stats?: string): void {
  const { primary, secondary } = b.palette;
  if (b.side === 'human') {
    chitBase(ctx, size, false, secondary);
    misregister(ctx, size, () => {
      // Sentry gun: box with a barrel.
      ctx.strokeStyle = INK;
      ctx.lineWidth = size * 0.1;
      ctx.strokeRect(-size * 0.5, -size * 0.35, size * 1.0, size * 0.6);
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.arc(0, -size * 0.05, size * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.05);
      ctx.lineTo(size * 0.45, -size * 0.6);
      ctx.stroke();
    });
  } else {
    chitBase(ctx, size, true, secondary);
    misregister(ctx, size, () => {
      // Spitter pod: bulb with a puckered mouth and drips.
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.55, size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(0, -size * 0.05, size * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-size * 0.2, size * 0.38, size * 0.07, 0, Math.PI * 2);
      ctx.arc(size * 0.15, size * 0.42, size * 0.06, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  if (stats) statLine(ctx, size, stats, INK);
}

/** `wobble` animates legs / bob. */
export function drawEnemy(ctx: CanvasRenderingContext2D, b: Biotype, size: number, wobble = 0): void {
  const { primary, secondary } = b.palette;
  if (b.side === 'human') {
    // Trooper: NATO infantry symbol (box with an X), bobbing as it marches.
    ctx.save();
    ctx.translate(0, Math.sin(wobble) * size * 0.06);
    chitBase(ctx, size, false, secondary);
    misregister(ctx, size, () => {
      ctx.strokeStyle = INK;
      ctx.lineWidth = size * 0.12;
      const w = size * 0.6;
      const h = size * 0.4;
      ctx.strokeRect(-w, -h, w * 2, h * 2);
      ctx.beginPath();
      ctx.moveTo(-w, -h);
      ctx.lineTo(w, h);
      ctx.moveTo(w, -h);
      ctx.lineTo(-w, h);
      ctx.stroke();
    });
    ctx.restore();
  } else {
    // Crawler: round chit with wriggling legs and two eyes.
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, size * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const wig = Math.sin(wobble + i * 1.7) * 0.25;
      ctx.moveTo(Math.cos(a) * size * 0.8, Math.sin(a) * size * 0.8);
      ctx.lineTo(Math.cos(a + wig) * size * 1.35, Math.sin(a + wig) * size * 1.35);
    }
    ctx.stroke();
    chitBase(ctx, size, true, primary);
    misregister(ctx, size, () => {
      ctx.fillStyle = CREAM;
      for (const dx of [-0.3, 0.3]) {
        ctx.beginPath();
        ctx.arc(dx * size, -size * 0.1, size * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = INK;
      for (const dx of [-0.3, 0.3]) {
        ctx.beginPath();
        ctx.arc(dx * size + Math.sin(wobble) * size * 0.05, -size * 0.08, size * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = size * 0.08;
      ctx.beginPath();
      ctx.arc(0, size * 0.25, size * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    });
  }
}
