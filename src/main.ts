import './style.css';
import { Synth } from './audio/synth';
import { BIOTYPES, type Side, UPGRADES, type UpgradeKind } from './biotypes';
import { MECHANISM_BUILD_RADIUS, TERRAIN_INFO, type Terrain } from './board';
import { FINAL_WAVE, Game } from './game';
import { HEX_SPACING, type Hex } from './hex';
import { drawEnemy, drawMechanism, drawTower } from './render/counters';
import { type Hover, Renderer } from './render/renderer';

type Tool = { kind: 'none' } | { kind: 'mechanism' } | { kind: 'terrain'; terrain: Terrain };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('board');
const hud = $('hud');
const panel = $('panel');
const banner = $('banner');
const modal = $('modal');

const synth = new Synth();
const renderer = new Renderer(canvas);

let game: Game | undefined;
let tool: Tool = { kind: 'none' };
let hoverHex: Hex | undefined;
let speed = 1;
/** Seconds until wave 1 starts, so the player can look over the board first. */
let firstWaveDelay = 0;
let renderedPhase = '';

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
    <h3>${b.name}</h3>
    <p>${b.tagline}</p>
    <canvas width="640" height="220"></canvas>
    <dl>
      <dt>Tower</dt><dd>${b.tower.name}</dd>
      <dt>Builds</dt><dd>${b.mechanism.name}</dd>
      <dt>Faces</dt><dd>${foe.enemy.name}s of the ${foe.name}</dd>
    </dl>`;
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
    ctx.font = '700 28px "Space Mono", monospace';
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
  (e.currentTarget as HTMLElement).textContent = `${speed}×`;
});

$('btn-mute').addEventListener('click', (e) => {
  synth.unlock();
  synth.setMuted(!synth.muted);
  (e.currentTarget as HTMLElement).textContent = synth.muted ? '♪ Off' : '♪ On';
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
  if (e.key === 'Escape' && game?.phase === 'build-mechanism' && tool.kind === 'mechanism') {
    tool = { kind: 'none' };
    renderedPhase = '';
  }
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

// ---- Build panel ----

function renderPanel(g: Game): void {
  const key = `${g.phase}:${g.wave}:${tool.kind}:${tool.kind === 'terrain' ? tool.terrain : ''}`;
  if (key === renderedPhase) return;
  renderedPhase = key;

  if (g.phase === 'build-mechanism') {
    panel.hidden = false;
    if (tool.kind === 'mechanism') {
      panel.innerHTML = `
        <span class="step">Step 1 of 2 · Reinforce</span>
        <h3>Place your ${g.player.mechanism.name}</h3>
        <p>Click a highlighted hex within ${MECHANISM_BUILD_RADIUS} of the tower. It blocks enemy movement.</p>
        <div class="options"><button class="option" data-action="cancel"><strong>Back</strong><span>Choose something else (Esc)</span></button></div>`;
    } else {
      const upgrades = (Object.keys(UPGRADES) as UpgradeKind[])
        .map((k) => `<button class="option" data-upgrade="${k}"><strong>${UPGRADES[k].label}</strong><span>${g.player.tower.name}: ${UPGRADES[k].describe}</span></button>`)
        .join('');
      panel.innerHTML = `
        <span class="step">Step 1 of 2 · Reinforce</span>
        <h3>Upgrade the ${g.player.tower.name} or build a new mechanism</h3>
        <p>Wave ${g.wave} repelled. Choose one.</p>
        <div class="options">${upgrades}
          <button class="option" data-action="mechanism"><strong>Build ${g.player.mechanism.name}</strong><span>Auto-turret, ${g.player.mechanism.damage} dmg, ${g.player.mechanism.range} hex range</span></button>
        </div>`;
    }
  } else if (g.phase === 'build-terrain') {
    panel.hidden = false;
    if (tool.kind !== 'terrain') tool = { kind: 'terrain', terrain: 'asteroid' };
    const selected = tool.terrain;
    const options = (Object.keys(TERRAIN_INFO) as Terrain[])
      .map((t) => `<button class="option${t === selected ? ' selected' : ''}" data-terrain="${t}"><strong>${TERRAIN_INFO[t].label}</strong><span>${TERRAIN_INFO[t].describe}</span></button>`)
      .join('');
    panel.innerHTML = `
      <span class="step">Step 2 of 2 · Shape the Battlefield</span>
      <h3>Place a terrain tile</h3>
      <p>Pick a tile, then click an empty hex. Placing it launches wave ${g.wave + 1}.</p>
      <div class="options">${options}</div>`;
  } else {
    const watching = g.phase === 'ready' || g.phase === 'wave';
    panel.hidden = !watching;
    panel.innerHTML = `
      <span class="step">${g.phase === 'ready' ? 'Deploying' : `Wave ${g.wave} of ${FINAL_WAVE}`}</span>
      <h3>Sit back and watch</h3>
      <p>The ${g.player.tower.name} fires on its own. Your next move comes when the wave is cleared.</p>`;
  }
  panel.classList.toggle('watching', g.phase === 'ready' || g.phase === 'wave');
}

panel.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button');
  if (!btn || !game) return;
  synth.play('click', game.player.side);
  const { upgrade, action, terrain } = btn.dataset;
  if (upgrade) game.applyUpgrade(upgrade as UpgradeKind);
  if (action === 'mechanism') tool = { kind: 'mechanism' };
  if (action === 'cancel') tool = { kind: 'none' };
  if (terrain) tool = { kind: 'terrain', terrain: terrain as Terrain };
});

// ---- HUD, banners, end screens ----

function renderHud(g: Game): void {
  $('hud-wave').textContent = `${Math.max(1, g.wave)} / ${FINAL_WAVE}`;
  $('hud-hp').textContent = `${Math.max(0, g.tower.hp)} / ${g.tower.maxHp}`;
  const status: Record<string, string> = {
    ready: 'Deploying counters…',
    wave: `${g.enemies.length} ${g.enemyType.enemy.name}${g.enemies.length === 1 ? '' : 's'} on the board`,
    'build-mechanism': 'Build phase: reinforce',
    'build-terrain': 'Build phase: terrain',
    victory: 'Victory!',
    defeat: 'Defeated',
  };
  $('hud-status').textContent = status[g.phase];
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
  modal.hidden = false;
  modal.innerHTML = `
    <div class="box">
      <div class="stripes"><span></span><span></span><span></span></div>
      <h2>${won ? 'Victory!' : 'Overrun!'}</h2>
      <p>${
        won
          ? `The ${g.player.tower.name} held against all ${FINAL_WAVE} waves of ${g.enemyType.enemy.name}s.`
          : `The ${g.player.tower.name} fell on wave ${g.wave}.`
      }</p>
      <button class="big" id="btn-again">Play Again</button>
    </div>`;
  $('btn-again').addEventListener('click', () => {
    synth.play('click', g.player.side);
    modal.hidden = true;
    hud.hidden = true;
    panel.hidden = true;
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
      if (e.type === 'waveClear' && g.phase !== 'victory') showBanner('Wave Clear!');
      if (e.type === 'victory') showEnd(g, true);
      if (e.type === 'defeat') showEnd(g, false);
    }
    renderPanel(g);
    renderHud(g);
    const zone = tool.kind === 'mechanism' ? MECHANISM_BUILD_RADIUS : undefined;
    renderer.render(g, dt, currentHover(g), zone);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
