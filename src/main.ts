import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/400-italic.css';
import '@fontsource/courier-prime/700.css';
import '@fontsource/righteous/400.css';
import './style.css';
import { Synth } from './audio/synth';
import { BIOTYPES, type Side, UPGRADES, type UpgradeKind } from './biotypes';
import { MECHANISM_BUILD_RADIUS, TERRAIN_INFO, type Terrain } from './board';
import { FINAL_WAVE, Game } from './game';
import { HEX_SPACING, type Hex, hexCorners } from './hex';
import { drawEnemy, drawMechanism, drawTower } from './render/counters';
import { type Hover, Renderer } from './render/renderer';
import { drawAsteroid, drawNebula, hexSeed } from './render/terrain';

type Tool = { kind: 'none' } | { kind: 'mechanism' } | { kind: 'terrain'; terrain: Terrain };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('board');
const hud = $('hud');
const panel = $('panel');
const banner = $('banner');
const modal = $('modal');
const dialog = $('dialog');

const synth = new Synth();
const renderer = new Renderer(canvas);

let game: Game | undefined;
let tool: Tool = { kind: 'none' };
let hoverHex: Hex | undefined;
let speed = 1;
/** Seconds until wave 1 starts, so the player can look over the board first. */
let firstWaveDelay = 0;
let renderedPhase = '';
let renderedHud = '';

// ---- Title & biotype selection ----

$('btn-open').addEventListener('click', () => {
  synth.unlock();
  synth.play('click', 'human');
  $('title').hidden = true;
  $('pick').hidden = false;
});

for (const card of document.querySelectorAll<HTMLButtonElement>('.card')) {
  const side = card.dataset.side as Side;
  const b = BIOTYPES[side];
  const foe = BIOTYPES[side === 'human' ? 'monster' : 'human'];
  card.innerHTML = `
    <span class="card-band">${b.name}<small>Player Aid Card</small></span>
    <span class="card-inner">
      <p>${b.tagline}</p>
      <canvas width="640" height="220"></canvas>
      <dl>
        <dt>Tower</dt><dd>${b.tower.name}</dd>
        <dt>Builds</dt><dd>${b.mechanism.name}</dd>
        <dt>Faces</dt><dd>${foe.enemy.name}s of the ${foe.name}</dd>
      </dl>
    </span>`;
  const ctx = card.querySelector('canvas')!.getContext('2d')!;
  const preview = () => {
    ctx.clearRect(0, 0, 640, 220);
    const place = (x: number, draw: () => void) => {
      ctx.save();
      ctx.translate(x, 110);
      draw();
      ctx.restore();
    };
    place(130, () => drawTower(ctx, b, 70, `${b.tower.damage}-${b.tower.range}`));
    place(310, () => drawMechanism(ctx, b, 48, `${b.mechanism.damage}-${b.mechanism.range}`));
    ctx.fillStyle = '#e3b448';
    ctx.font = 'italic 28px "Courier Prime", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('vs', 420, 120);
    place(520, () => drawEnemy(ctx, foe, 40, 0.6));
  };
  preview();
  document.fonts?.ready.then(preview);
  card.addEventListener('mouseenter', () => synth.play('click', side));
  card.addEventListener('click', () => startGame(side));
}

function startGame(side: Side): void {
  synth.unlock();
  synth.play('place', side);
  game = new Game(side);
  tool = { kind: 'none' };
  firstWaveDelay = 2;
  renderedPhase = '';
  renderedHud = '';
  $('pick').hidden = true;
  modal.hidden = true;
  hud.hidden = false;
  $('hud-tower-name').textContent = game.player.tower.name;
  renderer.resize(game.board);
  showBanner('Prepare!', `The ${game.enemyType.enemy.name}s are coming…`);
}

// ---- HUD buttons ----

$('btn-speed').addEventListener('click', (e) => {
  speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
  const chit = e.currentTarget as HTMLElement;
  chit.textContent = `${speed}×`;
  chit.setAttribute('aria-label', `Game speed ${speed}×`);
});

$('btn-mute').addEventListener('click', (e) => {
  synth.unlock();
  synth.setMuted(!synth.muted);
  (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(synth.muted));
});

// ---- Board input ----

canvas.addEventListener('mousemove', (e) => {
  hoverHex = renderer.screenToHex(e.offsetX, e.offsetY);
});
canvas.addEventListener('mouseleave', () => {
  hoverHex = undefined;
});
canvas.addEventListener('click', (e) => {
  if (!game) return;
  const h = renderer.screenToHex(e.offsetX, e.offsetY);
  if (tool.kind === 'mechanism' && game.placeMechanism(h)) {
    tool = { kind: 'none' };
  } else if (tool.kind === 'terrain' && game.placeTerrain(h, tool.terrain)) {
    tool = { kind: 'none' };
  }
});
window.addEventListener('keydown', (e) => {
  // Esc while placing a piece goes back to the choice dialog.
  if (e.key === 'Escape' && (game?.phase === 'build-mechanism' || game?.phase === 'build-terrain')) tool = { kind: 'none' };
});
new ResizeObserver(() => {
  if (game) renderer.resize(game.board);
}).observe(canvas);

function currentHover(g: Game): Hover | undefined {
  if (!hoverHex || !g.board.inBounds(hoverHex)) return undefined;
  if (tool.kind === 'mechanism') {
    return { hex: hoverHex, valid: g.board.canPlaceMechanism(hoverHex), range: g.player.mechanism.range * HEX_SPACING };
  }
  if (tool.kind === 'terrain') return { hex: hoverHex, valid: g.board.canPlaceTerrain(hoverHex, tool.terrain) };
  return undefined;
}

// ---- Bottom status bar and between-wave dialog ----

/** Re-render the bar and dialog only when what they show actually changes. */
function renderPanels(g: Game): void {
  const key = `${g.phase}:${g.wave}:${tool.kind}:${tool.kind === 'terrain' ? tool.terrain : ''}`;
  if (key === renderedPhase) return;
  renderedPhase = key;
  renderBar(g);
  renderDialog(g);
}

const PHASES = ['Assault', 'Reinforce', 'Terrain'] as const;

/** The Sequence of Play strip under the board: which phase it is, and what to do. */
function renderBar(g: Game): void {
  const current = g.phase === 'build-mechanism' ? 1 : g.phase === 'build-terrain' ? 2 : 0;
  let text = '';
  let button = '';
  if (g.phase === 'ready') {
    text = `Deploying counters. Wave 1 is about to land.`;
  } else if (g.phase === 'wave') {
    text = `Sit back and watch — the ${g.player.tower.name} fires on its own.`;
  } else if (g.phase === 'build-mechanism' && tool.kind === 'mechanism') {
    text = `Click a highlighted hex to place your ${g.player.mechanism.name}. It blocks enemy movement.`;
    button = '<button class="bar-btn" data-action="back">Back</button>';
  } else if (g.phase === 'build-terrain' && tool.kind === 'terrain') {
    text = `Click an empty hex to place the ${TERRAIN_INFO[tool.terrain].label}. Wave ${g.wave + 1} starts right after.`;
    button = '<button class="bar-btn" data-action="back">Change</button>';
  } else if (g.phase === 'build-mechanism' || g.phase === 'build-terrain') {
    text = 'Draw your card and choose.';
  } else {
    panel.hidden = true;
    return;
  }
  const phases = PHASES.map((p, i) => `<li${i === current ? ' class="current"' : ''}>${i + 1} ${p}</li>`).join('');
  panel.innerHTML = `<span class="sop-label">Sequence of Play</span><ol class="phases">${phases}</ol><span class="bar-text">${text}</span>${button}`;
  panel.hidden = false;
}

/** Modal over the board for each between-wave step; it steps aside while you place a piece. */
function renderDialog(g: Game): void {
  if (g.phase === 'build-mechanism' && tool.kind === 'none') {
    const upgrades = (Object.keys(UPGRADES) as UpgradeKind[])
      .map((k) => `<button class="option upgrade" data-upgrade="${k}"><span class="opt-kind">Upgrade</span><strong>${UPGRADES[k].label}</strong><span class="effect">${UPGRADES[k].describe}</span></button>`)
      .join('');
    const m = g.player.mechanism;
    showDialog('Reinforcement Phase', `Turn ${g.wave}`, `
      <h3>Wave ${g.wave} repelled. Choose one:</h3>
      <div class="choice">
        <div class="group">
          <span class="group-label">Upgrade the ${g.player.tower.name}</span>
          <div class="options">${upgrades}</div>
        </div>
        <span class="or">or</span>
        <div class="group">
          <span class="group-label">Build new</span>
          <button class="option build" data-action="mechanism">
            <span class="sheet"><canvas width="96" height="96" aria-hidden="true"></canvas></span>
            <span class="build-text"><span class="opt-kind">New piece</span><strong>${m.name}</strong><span class="effect">${m.damage} dmg · ${m.range} hex</span></span>
            <span class="stamp">New</span>
          </button>
        </div>
      </div>`);
    const icon = dialog.querySelector<HTMLCanvasElement>('.build canvas')!.getContext('2d')!;
    icon.translate(48, 48);
    drawMechanism(icon, g.player, 38);
  } else if (g.phase === 'build-terrain' && tool.kind === 'none') {
    const options = (Object.keys(TERRAIN_INFO) as Terrain[])
      .map(
        (t) => `<button class="option terrain" data-terrain="${t}">
          <canvas width="120" height="120" aria-hidden="true" data-preview="${t}"></canvas>
          <span><span class="opt-kind">Terrain tile</span><strong>${TERRAIN_INFO[t].label}</strong><span class="effect">${TERRAIN_INFO[t].describe}</span></span>
        </button>`,
      )
      .join('');
    showDialog('Terrain Phase', `Turn ${g.wave}`, `
      <h3>Pick a terrain tile to place</h3>
      <p>Then click an empty hex. Placing it launches wave ${g.wave + 1}.</p>
      <div class="options">${options}</div>`);
    for (const cv of dialog.querySelectorAll<HTMLCanvasElement>('canvas[data-preview]')) {
      drawTerrainPreview(cv, cv.dataset.preview as Terrain);
    }
  } else {
    dialog.hidden = true;
  }
}

/** Deal a card from the game deck over the board. */
function showDialog(phase: string, cardNo: string, body: string): void {
  dialog.innerHTML = `
    <div class="dialog-card paper"><div class="frame">
      <header class="card-head"><span class="phase-name">${phase}</span><span class="card-no">${cardNo}</span></header>
      <div class="card-body">${body}</div>
    </div></div>`;
  dialog.hidden = false;
}

/** A single terrain hex, drawn with the same art as the board. */
function drawTerrainPreview(cv: HTMLCanvasElement, t: Terrain): void {
  const ctx = cv.getContext('2d')!;
  const size = 52;
  ctx.translate(cv.width / 2, cv.height / 2);
  const pts = hexCorners({ x: 0, y: 0 }, size);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = '#2b2540';
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (t === 'nebula') drawNebula(ctx, size, hexSeed(1, 1));
  else drawAsteroid(ctx, size, hexSeed(2, 3));
  ctx.restore();
  ctx.strokeStyle = 'rgba(243, 231, 201, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function onPanelClick(e: MouseEvent): void {
  const btn = (e.target as HTMLElement).closest('button');
  if (!btn || !game) return;
  synth.play('click', game.player.side);
  const { upgrade, action, terrain } = btn.dataset;
  if (upgrade) game.applyUpgrade(upgrade as UpgradeKind);
  if (action === 'mechanism') tool = { kind: 'mechanism' };
  if (action === 'back') tool = { kind: 'none' };
  if (terrain) tool = { kind: 'terrain', terrain: terrain as Terrain };
}
panel.addEventListener('click', onPanelClick);
dialog.addEventListener('click', onPanelClick);

// ---- HUD, banners, end screens ----

/** Turn Record Track and Tower Strength track, redrawn only when they change. */
function renderHud(g: Game): void {
  const hp = Math.max(0, Math.ceil(g.tower.hp));
  const turn = Math.max(1, g.wave);
  const key = `${turn}:${hp}`;
  if (key === renderedHud) return;
  renderedHud = key;
  $('hud-hp').textContent = `${hp} / ${g.tower.maxHp}`;
  const turns = $('turn-track');
  turns.setAttribute('aria-label', `Turn ${turn} of ${FINAL_WAVE}`);
  turns.innerHTML = Array.from({ length: FINAL_WAVE }, (_, i) => {
    const n = i + 1;
    const cls = n < turn ? ' class="done"' : '';
    return `<li${cls}>${n}${n === turn ? '<span class="marker">Turn</span>' : ''}</li>`;
  }).join('');
  const strength = $('strength-track');
  strength.setAttribute('aria-label', `Tower strength ${hp} of ${g.tower.maxHp}`);
  strength.innerHTML = Array.from({ length: g.tower.maxHp }, (_, i) => {
    const n = g.tower.maxHp - i;
    return `<li${n > hp ? ' class="hit"' : ''}>${n % 5 === 0 ? n : ''}</li>`;
  }).join('');
}

let bannerTimer: number | undefined;
function showBanner(text: string, sub = ''): void {
  banner.hidden = true;
  void banner.offsetWidth; // restart the CSS animation
  banner.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  banner.hidden = false;
  window.clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => (banner.hidden = true), 1800);
}

function showEnd(g: Game, won: boolean): void {
  panel.hidden = true;
  dialog.hidden = true;
  modal.hidden = false;
  modal.innerHTML = `
    <div class="end-card paper"><div class="frame">
      <header class="card-head"><span class="phase-name">${won ? 'Victory Conditions Met' : 'Defeat'}</span><span class="card-no">Turn ${g.wave}</span></header>
      <div class="card-body">
        <h2>${won ? 'Victory!' : 'Overrun!'}</h2>
        <p>${
          won
            ? `The ${g.player.tower.name} held against all ${FINAL_WAVE} waves of ${g.enemyType.enemy.name}s.`
            : `The ${g.player.tower.name} fell on wave ${g.wave}.`
        }</p>
        <button class="big" id="btn-again">Play Again</button>
      </div>
    </div></div>`;
  $('btn-again').addEventListener('click', () => {
    synth.play('click', g.player.side);
    modal.hidden = true;
    hud.hidden = true;
    panel.hidden = true;
    dialog.hidden = true;
    game = undefined;
    $('pick').hidden = false;
  });
}

// ---- Main loop ----

const STEP = 1 / 60;
let last = performance.now();
let accumulator = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const g = game;
  if (g) {
    if (g.phase === 'ready') {
      firstWaveDelay -= dt;
      if (firstWaveDelay <= 0) g.startNextWave();
    }
    accumulator += dt * speed;
    while (accumulator >= STEP) {
      g.update(STEP);
      accumulator -= STEP;
    }
    for (const e of g.takeEvents()) {
      synth.playEvent(e);
      renderer.handleEvent(e);
      if (e.type === 'waveStart') showBanner(`Wave ${e.wave}`, `${g.enemyType.enemy.name}s incoming!`);
      if (e.type === 'victory') showEnd(g, true);
      if (e.type === 'defeat') showEnd(g, false);
    }
    renderPanels(g);
    renderHud(g);
    const zone = tool.kind === 'mechanism' ? MECHANISM_BUILD_RADIUS : undefined;
    renderer.render(g, dt, currentHover(g), zone);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
