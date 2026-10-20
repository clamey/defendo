import { describe, expect, it } from 'vitest';
import { BIOTYPES, type Side } from '../src/biotypes';
import { Board, TOWER_HEX } from '../src/board';
import { FINAL_WAVE, Game, type Phase } from '../src/game';
import { hex, hexDistance, hexKey, hexToWorld, hexesInRadius, neighbors, worldToHex } from '../src/hex';
import { computeFlowField, nextStep } from '../src/pathing';
import { waveSpec } from '../src/waves';

describe('hex math', () => {
  it('round-trips hex <-> world', () => {
    for (const h of hexesInRadius(5)) expect(worldToHex(hexToWorld(h))).toEqual(h);
  });

  it('counts hexes in a radius', () => {
    expect(hexesInRadius(7)).toHaveLength(169);
  });

  it('neighbors are distance 1', () => {
    for (const n of neighbors(hex(2, -1))) expect(hexDistance(n, hex(2, -1))).toBe(1);
  });
});

describe('pathing', () => {
  it('routes around asteroids toward the tower', () => {
    const board = new Board(4);
    board.placeTerrain(hex(1, 0), 'asteroid');
    const field = computeFlowField(board);
    expect(field.has(hexKey(hex(1, 0)))).toBe(false);
    // Walk from the east edge to the tower.
    let at = hex(4, 0);
    for (let i = 0; i < 20 && !board.isTower(at); i++) {
      const next = nextStep(board, field, at);
      expect(next).toBeDefined();
      expect(board.isPassable(next!)).toBe(true);
      at = next!;
    }
    expect(at).toEqual(TOWER_HEX);
  });

  it('prefers going around a nebula when the detour is cheap', () => {
    const board = new Board(3);
    board.placeTerrain(hex(1, 0), 'nebula');
    const field = computeFlowField(board);
    // From (2,0), stepping straight into the nebula costs 2 + 0, going via (1,-1) or (2,-1) also costs 2.
    expect(field.get(hexKey(hex(2, 0)))).toBe(3);
  });

  it('refuses asteroids that would seal the tower in', () => {
    const board = new Board(4);
    const around = neighbors(TOWER_HEX);
    for (const h of around.slice(0, 5)) expect(board.placeTerrain(h, 'asteroid')).toBe(true);
    expect(board.canPlaceTerrain(around[5], 'asteroid')).toBe(false);
    expect(board.canPlaceTerrain(around[5], 'nebula')).toBe(true);
  });

  it('refuses asteroids that would wall off a pocket', () => {
    const board = new Board(4);
    // Surround (2,0) on all sides except one; closing the last side would strand it.
    const target = hex(2, 0);
    const ns = neighbors(target);
    for (const n of ns.slice(1)) expect(board.placeTerrain(n, 'asteroid')).toBe(true);
    expect(board.canPlaceTerrain(ns[0], 'asteroid')).toBe(false);
  });
});

describe('waves', () => {
  it('start small and grow', () => {
    const e = BIOTYPES.human.enemy;
    expect(waveSpec(1, e).count).toBe(4);
    expect(waveSpec(5, e).count).toBe(12);
    expect(waveSpec(5, e).hp).toBeGreaterThan(waveSpec(1, e).hp);
  });
});

// Reads phase through a function so TS doesn't keep a stale narrowed type across update() calls.
const phaseOf = (game: Game): Phase => game.phase;

function runWave(game: Game, maxSeconds = 300): void {
  const dt = 1 / 60;
  for (let t = 0; t < maxSeconds && game.phase === 'wave'; t += dt) game.update(dt);
}

describe('milestone 1 auto-sim', () => {
  for (const side of ['human', 'monster'] as Side[]) {
    for (const seed of [1, 2, 3, 42, 1234]) {
      it(`${side} starter tower alone clears every wave (seed ${seed})`, () => {
        const game = new Game(side, seed);
        game.startNextWave();
        while (game.phase === 'wave') {
          runWave(game);
          if (phaseOf(game) !== 'build-mechanism') break;
          // Minimal player: always take the same upgrade and drop a nebula anywhere legal.
          game.applyUpgrade('range');
          const spot = game.board.allHexes().find((h) => game.board.canPlaceTerrain(h, 'nebula'))!;
          expect(game.placeTerrain(spot, 'nebula')).toBe(true);
        }
        expect(game.phase).toBe('victory');
        expect(game.wave).toBe(FINAL_WAVE);
        // Enemies now shoot and claw back, so the tower takes a few hits — but it should never be close.
        expect(game.tower.hp).toBeGreaterThanOrEqual(game.tower.maxHp - 6);
      });
    }
  }

  it('starts on a blank board', () => {
    for (const side of ['human', 'monster'] as Side[]) {
      const game = new Game(side, 5);
      expect(game.board.terrain.size).toBe(0);
      expect(game.mechanisms).toHaveLength(0);
    }
  });

  it('build phase runs mechanism step then terrain step, then the next wave', () => {
    const game = new Game('monster', 7);
    game.startNextWave();
    runWave(game);
    expect(game.phase).toBe('build-mechanism');
    expect(game.placeTerrain(hex(0, 3), 'nebula')).toBe(false);
    const spot = neighbors(TOWER_HEX).find((h) => game.board.canPlaceMechanism(h))!;
    expect(game.placeMechanism(spot)).toBe(true);
    expect(game.mechanisms).toHaveLength(1);
    expect(game.phase).toBe('build-terrain');
    const tile = game.board.allHexes().find((h) => game.board.canPlaceTerrain(h, 'asteroid'))!;
    expect(game.placeTerrain(tile, 'asteroid')).toBe(true);
    expect(game.phase).toBe('wave');
    expect(game.wave).toBe(2);
  });

  it('troopers shoot from range and crawlers claw up close', () => {
    for (const [side, attack] of [['monster', 'fire:pistol|fire:rifle'], ['human', 'melee']] as const) {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 10; seed++) {
        const game = new Game(side, seed);
        game.startNextWave();
        for (let i = 0; i < 60 * 300 && game.phase !== 'victory' && game.phase !== 'defeat'; i++) {
          game.update(1 / 60);
          for (const e of game.takeEvents()) {
            if (e.type === 'fire' && e.side !== side) seen.add(`fire:${e.weapon}`);
            if (e.type === 'melee') seen.add('melee');
          }
          if (phaseOf(game) === 'build-mechanism') {
            game.applyUpgrade('range');
            game.placeTerrain(game.board.allHexes().find((h) => game.board.canPlaceTerrain(h, 'nebula'))!, 'nebula');
          }
        }
      }
      expect(attack.split('|').some((a) => seen.has(a))).toBe(true);
    }
  });

  it('player weapons match the biotype', () => {
    for (const side of ['human', 'monster'] as Side[]) {
      const game = new Game(side, 9);
      game.startNextWave();
      const weapons = new Set<string>();
      for (let i = 0; i < 60 * 60 && game.phase === 'wave'; i++) {
        game.update(1 / 60);
        for (const e of game.takeEvents()) if (e.type === 'fire' && e.side === side) weapons.add(e.weapon);
      }
      expect([...weapons]).toEqual([BIOTYPES[side].tower.weapon]);
    }
  });

  it('emits sounds-worthy events for both sides', () => {
    const game = new Game('human', 3);
    game.startNextWave();
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 120 && game.phase === 'wave'; i++) {
      game.update(1 / 60);
      for (const e of game.takeEvents()) seen.add(`${e.type}:${e.side}`);
    }
    expect(seen).toContain('waveStart:monster');
    expect(seen).toContain('fire:human');
    expect(seen).toContain('enemyDeath:monster');
    expect(seen).toContain('waveClear:human');
  });
});
