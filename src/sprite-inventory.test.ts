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

interface Slot {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly games: Record<(typeof GAMES)[number], { state: string; evidence: string }>;
  readonly old: { set: string; frames: string[]; note: string } | null;
  readonly new: { animation: string | null; frames: string[]; origin: string; frameSize: string } | null;
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
const labFrames = assets.frames as Record<string, { width: number; height: number }>;
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
