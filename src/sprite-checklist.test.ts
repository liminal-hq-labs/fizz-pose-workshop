// Checks the sprite checklist's counting, filtering, grouping and grid conversion.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { defaultFilters, filterSlots, frameIndexAt, frameOffset, gridToPixels, groupSlots, newPlayback, oldPlayback, parseInventory, parseSpriteSet, progress, summarise, totalDosBytes } from './sprite-checklist.ts';

const slot = (id: string, group: string, status: string, fizz1 = 'n/a', fizz2 = 'n/a', extra: Record<string, unknown> = {}) => ({
  id, label: id.toUpperCase(), group, status, games: { fizz1: { state: fizz1, evidence: '' }, fizz2: { state: fizz2, evidence: 'Found in room 4' } }, old: null, new: null, ...extra,
});
const inventory = parseInventory({
  generated: '2026-11-11',
  groups: [{ id: 'move', label: 'Movement' }, { id: 'act', label: 'Actions' }],
  slots: [
    slot('run', 'move', 'in-game', 'used', 'used', { dos: { bytesPerFrame: 10, totalBytes: 60 } }),
    slot('swim', 'move', 'needs-pixel-art', 'unused', 'could-use', { notes: 'Water room' }),
    slot('jump', 'move', 'ready-in-lab', 'used', 'used', { dos: { totalBytes: 40 } }),
    slot('fire', 'act', 'partial', 'could-use', 'used'),
    slot('hurt', 'act', 'missing', 'unused', 'used'),
    slot('wave', 'act', 'new-in-pr', 'n/a', 'unused'),
    { label: 'No id is dropped' },
  ],
});

test('parsing drops slots without ids and tolerates a missing file', () => {
  expect(inventory.slots).toHaveLength(6);
  expect(parseInventory(undefined)).toEqual({ generated: '', sources: [], groups: [], slots: [] });
  expect(parseInventory({ slots: [slot('odd', 'mystery', 'missing')] }).groups).toEqual([{ id: 'mystery', label: 'mystery' }]);
});

test('summary counts statuses and usage per game from the slots themselves', () => {
  const summary = summarise(inventory.slots);
  expect(summary.total).toBe(6);
  expect(summary.byStatus).toMatchObject({ missing: 1, 'needs-pixel-art': 1, partial: 1, 'new-in-pr': 1, 'ready-in-lab': 1, 'in-game': 1 });
  expect(summary.fizz1).toMatchObject({ used: 2, 'could-use': 1, unused: 2, 'n/a': 1 });
  expect(summary.fizz2).toMatchObject({ used: 4, 'could-use': 1, unused: 1 });
});

test('progress only measures used slots and treats partial art as not ready', () => {
  expect(progress(inventory.slots)).toEqual({ used: 4, ready: 2, inGame: 1, percent: 50, inGamePercent: 25 });
  expect(progress([])).toEqual({ used: 0, ready: 0, inGame: 0, percent: 0, inGamePercent: 0 });
  expect(totalDosBytes(inventory.slots)).toBe(100);
});

test('filters combine status, group, usage, gaps and free text', () => {
  const ids = (filters: Partial<typeof defaultFilters>) => filterSlots(inventory.slots, { ...defaultFilters, ...filters }).map(entry => entry.id);
  expect(ids({})).toHaveLength(6);
  expect(ids({ status: 'partial' })).toEqual(['fire']);
  expect(ids({ group: 'move' })).toEqual(['run', 'swim', 'jump']);
  expect(ids({ gapsOnly: true })).toEqual(['swim', 'fire', 'hurt']);
  expect(ids({ usage: 'fizz1-used' })).toEqual(['run', 'jump']);
  expect(ids({ usage: 'could-use' })).toEqual(['swim', 'fire']);
  expect(ids({ usage: 'unused' })).toEqual(['wave']);
  expect(ids({ search: 'water' })).toEqual(['swim']);
  expect(ids({ search: 'ROOM 4' })).toEqual(['run', 'swim', 'jump', 'fire', 'hurt', 'wave']);
  expect(ids({ search: 'hurt', group: 'move' })).toEqual([]);
});

test('grouping surfaces gaps first and omits empty groups', () => {
  const grouped = groupSlots(inventory.slots, inventory.groups, 'gaps-first');
  expect(grouped.map(entry => entry.group.id)).toEqual(['move', 'act']);
  expect(grouped[0].slots.map(entry => entry.id)).toEqual(['swim', 'jump', 'run']);
  expect(grouped[1].slots.map(entry => entry.id)).toEqual(['hurt', 'fire', 'wave']);
  expect(grouped[1].gaps).toBe(2);
  expect(groupSlots(inventory.slots, inventory.groups, 'inventory')[0].slots.map(entry => entry.id)).toEqual(['run', 'swim', 'jump']);
  expect(groupSlots(filterSlots(inventory.slots, { ...defaultFilters, group: 'act' }), inventory.groups, 'inventory')).toHaveLength(1);
});

test('grids become coloured pixels and skip transparent or unknown letters', () => {
  const palette = { '.': null, R: '#aa0000', W: '#ffffff' };
  expect(gridToPixels(['.R', 'WX'], palette)).toEqual([{ x: 1, y: 0, colour: '#aa0000' }, { x: 0, y: 1, colour: '#ffffff' }]);
  expect(gridToPixels(['toString'], palette)).toEqual([]);
  expect(frameOffset({ width: 24, height: 32 }, { width: 24, height: 44 })).toEqual({ x: 0, y: 12 });
  expect(frameOffset({ width: 20, height: 32 }, { width: 24, height: 44 })).toEqual({ x: 2, y: 12 });
});

test('sprite snapshots load from the array form and the map form', () => {
  expect(parseSpriteSet({ sprites: [{ name: 'a', rows: ['R'] }, { name: 'bad' }] })).toEqual({ a: ['R'] });
  expect(parseSpriteSet({ sprites: { a: ['R'], b: { rows: ['W'] }, c: { grid: ['G'] }, d: 3 } })).toEqual({ a: ['R'], b: ['W'], c: ['G'] });
  expect(parseSpriteSet(null)).toEqual({});
});

test('playback reports missing frames instead of inventing them', () => {
  const frames = { f1: { width: 1, height: 1, grid: ['R'] }, f2: { width: 1, height: 1, grid: ['W'] } };
  const animations = { walk: { frames: ['f1', 'f2'], durationsMs: [50, 70] } };
  const playback = newPlayback({ animation: 'walk', frames: ['f1', 'f2', 'f3'], origin: 'main', frameSize: '1x1' }, frames, animations);
  expect(playback.frames).toHaveLength(2);
  expect(playback.missing).toEqual(['f3']);
  expect(playback.expected).toBe(3);
  // The animation does not match the slot's three names, so the default rate applies.
  expect(playback.durationsMs).toEqual([110, 110]);
  expect(newPlayback({ animation: 'walk', frames: ['f1', 'f2'], origin: 'main', frameSize: '' }, frames, animations).durationsMs).toEqual([50, 70]);
  expect(newPlayback(null, frames, animations).frames).toEqual([]);
  const sets = { set: { a: ['R'] } };
  expect(oldPlayback({ set: 'set', frames: ['a', 'b'], note: '' }, sets).missing).toEqual(['b']);
  expect(oldPlayback({ set: 'absent', frames: ['a'], note: '' }, sets).frames).toEqual([]);
});

test('frame index loops over uneven durations', () => {
  expect(frameIndexAt([100, 200], 0)).toBe(0);
  expect(frameIndexAt([100, 200], 150)).toBe(1);
  expect(frameIndexAt([100, 200], 300)).toBe(0);
  expect(frameIndexAt([], 50)).toBe(0);
});
