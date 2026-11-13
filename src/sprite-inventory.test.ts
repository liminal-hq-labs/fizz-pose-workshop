// Checks that the Ben sprite inventory is well formed and only names frames that exist.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assets from '../assets.json';

const root = fileURLToPath(new URL('..', import.meta.url));
const STATES = ['used', 'could-use', 'unused', 'n/a'] as const;
const STATUSES = ['in-game', 'ready-in-lab', 'new-in-pr', 'partial', 'missing', 'needs-pixel-art'] as const;
const ORIGINS = ['main', 'pr-1', 'pr-2', 'pr-3', 'main+pr-1', 'none'] as const;
const GAMES = ['fizz1', 'fizz2'] as const;
const FACINGS = ['right', 'left', 'front', 'back', 'none'] as const;
const STUNNER_SIDES = ['right-hip', 'far-hip-left-facing'] as const;

interface Slot {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly games: Record<(typeof GAMES)[number], { state: string; evidence: string }>;
  readonly old: { set: string; frames: string[]; note: string } | null;
  readonly new: { animation: string | null; frames: string[]; origin: string; frameSize: string } | null;
  readonly facing: string;
  readonly pair?: string;
  readonly stunnerSide?: string;
  readonly mirrorForbidden: boolean;
  readonly status: string;
  readonly dos?: { bytesPerFrame: number; totalBytes: number };
  readonly notes: string;
}
interface Inventory {
  readonly generated: string;
  readonly sources: { id: string; repo: string; ref: string }[];
  readonly groups: { id: string; label: string }[];
  readonly slots: Slot[];
  readonly summary: { slots: number; byStatus: Record<string, number>; byGameState: Record<string, Record<string, number>> };
}

const inventory = JSON.parse(readFileSync(`${root}source/sprite-inventory.json`, 'utf8')) as Inventory;
const labFrames = assets.frames as Record<string, { width: number; height: number; grid: string[] }>;
const labAnimations = assets.animations as Record<string, { frames: string[] }>;

/** Frame names in a snapshot of a game's sprite sheet, read once per set. */
const snapshots = new Map<string, Set<string>>();
function snapshot(set: string): Set<string> {
  let names = snapshots.get(set);
  if (!names) {
    const file = JSON.parse(readFileSync(`${root}source/game-sprites/${set}.json`, 'utf8')) as { sprites: { name: string }[] };
    names = new Set(file.sprites.map((sprite) => sprite.name));
    snapshots.set(set, names);
  }
  return names;
}

test('parses with sources, groups and a summary that matches the slots', () => {
  expect(inventory.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(inventory.sources.map((source) => source.id)).toEqual(['fizz1', 'fizz2', 'lab']);
  expect(inventory.summary.slots).toBe(inventory.slots.length);
  const byStatus: Record<string, number> = {};
  for (const slot of inventory.slots) byStatus[slot.status] = (byStatus[slot.status] ?? 0) + 1;
  expect(inventory.summary.byStatus).toEqual(byStatus);
  for (const game of GAMES) {
    const byState: Record<string, number> = {};
    for (const slot of inventory.slots) byState[slot.games[game].state] = (byState[slot.games[game].state] ?? 0) + 1;
    expect(inventory.summary.byGameState[game]).toEqual(byState);
  }
});

test('has unique slot ids that belong to a declared group', () => {
  const ids = inventory.slots.map((slot) => slot.id);
  expect(new Set(ids).size).toBe(ids.length);
  const groups = new Set(inventory.groups.map((group) => group.id));
  expect(groups.size).toBe(inventory.groups.length);
  for (const slot of inventory.slots) expect(groups.has(slot.group)).toBe(true);
});

test('uses only the allowed states and statuses, with evidence for every game', () => {
  for (const slot of inventory.slots) {
    expect(STATUSES).toContain(slot.status as (typeof STATUSES)[number]);
    for (const game of GAMES) {
      expect(STATES).toContain(slot.games[game].state as (typeof STATES)[number]);
      expect(slot.games[game].evidence.length).toBeGreaterThan(10);
    }
    if (slot.new) expect(ORIGINS).toContain(slot.new.origin as (typeof ORIGINS)[number]);
  }
});

test('names only lab frames that exist in assets.json, with sizes and DOS bytes that add up', () => {
  for (const slot of inventory.slots) {
    if (!slot.new) {
      expect(slot.dos).toBeUndefined();
      continue;
    }
    expect(slot.new.frames.length).toBeGreaterThan(0);
    expect(new Set(slot.new.frames).size).toBe(slot.new.frames.length);
    const sizes = new Set<string>();
    for (const name of slot.new.frames) {
      const frame = labFrames[name];
      expect(frame, `${slot.id}: ${name}`).toBeDefined();
      sizes.add(`${frame.width}x${frame.height}`);
    }
    expect([...sizes], slot.id).toEqual([slot.new.frameSize]);
    if (slot.new.animation) {
      expect(labAnimations[slot.new.animation], `${slot.id}: ${slot.new.animation}`).toBeDefined();
      const played = new Set(labAnimations[slot.new.animation].frames);
      if (slot.id !== 'look-up' && slot.id !== 'look-down') for (const name of slot.new.frames) expect(played.has(name), `${slot.id}: ${name}`).toBe(true);
    }
    const [width, height] = slot.new.frameSize.split('x').map(Number);
    const bytesPerFrame = Math.ceil((width * height) / 2);
    expect(slot.dos).toEqual({ bytesPerFrame, totalBytes: bytesPerFrame * slot.new.frames.length });
  }
});

test('names only old frames that exist in the game sprite snapshots', () => {
  for (const slot of inventory.slots) {
    if (!slot.old) continue;
    expect(slot.old.frames.length).toBeGreaterThan(0);
    const names = snapshot(slot.old.set);
    for (const name of slot.old.frames) expect(names.has(name), `${slot.id}: ${slot.old.set}/${name}`).toBe(true);
  }
});

test('keeps drawn left-facing frames apart from the right-facing ones', () => {
  const slots = new Map(inventory.slots.map((slot) => [slot.id, slot]));
  for (const slot of inventory.slots) {
    if (!slot.id.endsWith('-left') || !slot.new) continue;
    const right = slots.get(slot.id.replace(/-left$/, '-right'));
    if (!right?.new) continue;
    const shared = slot.new.frames.filter((name) => right.new?.frames.includes(name));
    expect(shared, `${slot.id} reuses a right-facing frame`).toEqual([]);
  }
});

const slotById = new Map(inventory.slots.map((slot) => [slot.id, slot]));
const isSide = (slot: Slot): boolean => slot.facing === 'right' || slot.facing === 'left';

test('gives every slot a known facing, a boolean mirror flag and a valid Stunner side', () => {
  for (const slot of inventory.slots) {
    expect(FACINGS, slot.id).toContain(slot.facing as (typeof FACINGS)[number]);
    expect(typeof slot.mirrorForbidden, slot.id).toBe('boolean');
    if (slot.stunnerSide !== undefined) expect(STUNNER_SIDES, slot.id).toContain(slot.stunnerSide as (typeof STUNNER_SIDES)[number]);
    if (slot.facing === 'right') expect(slot.stunnerSide, slot.id).toBe('right-hip');
    if (slot.facing === 'left') expect(slot.stunnerSide, slot.id).toBe('far-hip-left-facing');
    if (slot.stunnerSide) expect(slot.mirrorForbidden, `${slot.id} carries the Stunner`).toBe(true);
  }
});

test('pairs every right- and left-facing slot with its opposite, and nothing else', () => {
  for (const slot of inventory.slots) {
    if (!isSide(slot)) {
      expect(slot.pair, `${slot.id} is not a side view`).toBeUndefined();
      continue;
    }
    expect(slot.pair, slot.id).toBeDefined();
    const other = slotById.get(slot.pair!);
    expect(other, `${slot.id} pairs with ${slot.pair}`).toBeDefined();
    expect(other!.pair, `${slot.pair} points back`).toBe(slot.id);
    expect(other!.facing, `${slot.id} and ${slot.pair} face opposite ways`).toBe(slot.facing === 'right' ? 'left' : 'right');
    expect(other!.group).toBe(slot.group);
    // Ids that name a side must agree with the facing field.
    if (slot.id.endsWith('-right')) expect(slot.facing).toBe('right');
    if (slot.id.endsWith('-left')) expect(slot.facing).toBe('left');
  }
});

test('a side with no frames is a gap, and a side with frames is not marked missing', () => {
  for (const slot of inventory.slots) {
    if (!isSide(slot)) continue;
    if (!slot.new) expect(['missing', 'needs-pixel-art'], slot.id).toContain(slot.status);
    else expect(slot.status, slot.id).not.toBe('missing');
  }
});

/** A frame's pixel mirror image, so exact flips of another frame can be spotted. */
const flipped = (grid: string[]): string => grid.map((row) => [...row].reverse().join('')).join('\n');

test('never previews a mirrored copy: a Stunner-bearing frame is not the flip of any frame in its pair', () => {
  for (const slot of inventory.slots) {
    if (!slot.mirrorForbidden || !isSide(slot) || !slot.new) continue;
    const other = slotById.get(slot.pair!)!;
    if (!other.new) continue;
    const otherGrids = new Map(other.new.frames.map((name) => [name, labFrames[name].grid.join('\n')]));
    for (const name of slot.new.frames) {
      const grid = labFrames[name].grid;
      if (flipped(grid) === grid.join('\n')) continue;
      for (const [otherName, otherGrid] of otherGrids) expect(flipped(grid) === otherGrid, `${slot.id}: ${name} is a mirror of ${otherName}`).toBe(false);
    }
  }
});

test('lists every lab animation with a left-facing set under a left-facing slot', () => {
  const leftAnimations = Object.keys(labAnimations).filter((name) => /-left(-\d+)?$/.test(name));
  const claimed = new Set(inventory.slots.filter((slot) => slot.facing === 'left').map((slot) => slot.new?.animation));
  for (const name of leftAnimations) expect(claimed.has(name), `${name} belongs to no left-facing slot`).toBe(true);
});
