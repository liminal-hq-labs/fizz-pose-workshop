// Pure data helpers for the Ben sprite checklist: parsing, counting, filtering and pixel conversion.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Animation, Frames, Palette } from './types.ts';

export interface StatusInfo {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  /** Lower numbers surface first; gaps sort before finished work. */
  readonly rank: number;
  /** True when the art itself is incomplete, so the slot belongs in the "gaps" view. */
  readonly gap: boolean;
  /** True when finished new art exists, whether or not the game has it yet. */
  readonly artReady: boolean;
}
export const STATUSES: readonly StatusInfo[] = [
  { id: 'missing', label: 'Missing', hint: 'Needed, but no new art exists yet', rank: 0, gap: true, artReady: false },
  { id: 'needs-pixel-art', label: 'Needs pixel art', hint: 'Needs a new hand-drawn or redrawn sprite', rank: 1, gap: true, artReady: false },
  { id: 'partial', label: 'Partial', hint: 'Some frames exist, but the set is incomplete', rank: 2, gap: true, artReady: false },
  { id: 'new-in-pr', label: 'New in a PR', hint: 'Drawn and waiting in an open pull request', rank: 3, gap: false, artReady: true },
  { id: 'ready-in-lab', label: 'Ready in lab', hint: 'Finished in the workshop, not yet in the game', rank: 4, gap: false, artReady: true },
  { id: 'in-game', label: 'In game', hint: 'Already shipping in the game', rank: 5, gap: false, artReady: true },
];
const unknownRank = 99;
const statusById = new Map(STATUSES.map(status => [status.id, status]));
export function statusInfo(id: string): StatusInfo {
  return statusById.get(id) ?? { id, label: id || 'Unknown', hint: 'Unrecognised status', rank: unknownRank, gap: false, artReady: false };
}

export const USAGE_STATES: readonly { id: string; label: string }[] = [
  { id: 'used', label: 'Used' },
  { id: 'could-use', label: 'Could use' },
  { id: 'unused', label: 'Unused' },
  { id: 'n/a', label: 'Not applicable' },
];
export function usageLabel(state: string): string {
  return USAGE_STATES.find(entry => entry.id === state)?.label ?? (state || 'Unknown');
}

export interface FacingInfo { readonly id: string; readonly label: string; readonly chip: string }
export const FACINGS: readonly FacingInfo[] = [
  { id: 'right', label: 'Facing right', chip: 'Facing right' },
  { id: 'left', label: 'Facing left', chip: 'Facing left' },
  { id: 'front', label: 'Facing the camera', chip: 'Front view' },
  { id: 'back', label: 'Seen from behind', chip: 'Back view' },
  { id: 'none', label: 'Not facing-specific', chip: 'No facing' },
];
export function facingInfo(id: string): FacingInfo {
  return FACINGS.find(entry => entry.id === id) ?? { id, label: id || 'Unknown facing', chip: id || 'Facing unknown' };
}
export const isSideView = (slot: Pick<Slot, 'facing'>): boolean => slot.facing === 'right' || slot.facing === 'left';

export interface Usage { readonly state: string; readonly evidence: string }
export interface OldArt { readonly set: string; readonly frames: readonly string[]; readonly note: string }
export interface NewArt { readonly animation: string | null; readonly frames: readonly string[]; readonly origin: string; readonly frameSize: string }
export interface Slot {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly games: { readonly fizz1: Usage; readonly fizz2: Usage };
  readonly old: OldArt | null;
  readonly new: NewArt | null;
  /** Which way Ben faces; `none` is for sprites that are not facing-specific, such as the overworld and the turntable. */
  readonly facing: string;
  /** Id of the opposite-facing slot, for side views. */
  readonly pair: string | null;
  /** Where the Fizz Stunner sits: `right-hip`, or `far-hip-left-facing` when Ben faces left. Empty when not recorded. */
  readonly stunnerSide: string;
  /** True when the frames carry the Stunner, so a left-facing pose must be drawn rather than a mirror of the right-facing one. */
  readonly mirrorForbidden: boolean;
  readonly status: string;
  readonly dos: { readonly bytesPerFrame: number; readonly totalBytes: number } | null;
  readonly notes: string;
}
export interface Group { readonly id: string; readonly label: string }
export interface SourceRef { readonly id: string; readonly repo: string; readonly ref: string }
export interface Inventory {
  readonly generated: string;
  readonly sources: readonly SourceRef[];
  readonly groups: readonly Group[];
  readonly slots: readonly Slot[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const names = (value: unknown): string[] => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
const count = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

function parseUsage(value: unknown): Usage {
  return isRecord(value) ? { state: text(value.state) || 'n/a', evidence: text(value.evidence) } : { state: 'n/a', evidence: '' };
}
function parseOld(value: unknown): OldArt | null {
  return isRecord(value) ? { set: text(value.set), frames: names(value.frames), note: text(value.note) } : null;
}
function parseNew(value: unknown): NewArt | null {
  return isRecord(value) ? { animation: text(value.animation) || null, frames: names(value.frames), origin: text(value.origin) || 'none', frameSize: text(value.frameSize) } : null;
}

/** Reads the inventory file defensively so a partly written file still renders. Slots without an id are dropped. */
export function parseInventory(raw: unknown): Inventory {
  const root = isRecord(raw) ? raw : {};
  const slots: Slot[] = [];
  for (const entry of Array.isArray(root.slots) ? root.slots : []) {
    if (!isRecord(entry) || !text(entry.id)) continue;
    const games = isRecord(entry.games) ? entry.games : {};
    const dos = isRecord(entry.dos) ? { bytesPerFrame: count(entry.dos.bytesPerFrame), totalBytes: count(entry.dos.totalBytes) } : null;
    slots.push({
      id: text(entry.id), label: text(entry.label) || text(entry.id), group: text(entry.group),
      games: { fizz1: parseUsage(games.fizz1), fizz2: parseUsage(games.fizz2) },
      old: parseOld(entry.old), new: parseNew(entry.new), status: text(entry.status), dos, notes: text(entry.notes),
      facing: text(entry.facing) || 'none', pair: text(entry.pair) || null, stunnerSide: text(entry.stunnerSide), mirrorForbidden: entry.mirrorForbidden === true,
    });
  }
  const groups: Group[] = [];
  for (const entry of Array.isArray(root.groups) ? root.groups : []) if (isRecord(entry) && text(entry.id)) groups.push({ id: text(entry.id), label: text(entry.label) || text(entry.id) });
  // Slots that name an undeclared group still get a heading rather than vanishing.
  for (const slot of slots) if (!groups.some(group => group.id === slot.group)) groups.push({ id: slot.group, label: slot.group ? slot.group : 'Other' });
  const sources: SourceRef[] = [];
  for (const entry of Array.isArray(root.sources) ? root.sources : []) if (isRecord(entry)) sources.push({ id: text(entry.id), repo: text(entry.repo), ref: text(entry.ref) });
  return { generated: text(root.generated), sources, groups, slots };
}

export interface Summary {
  readonly total: number;
  readonly byStatus: Readonly<Record<string, number>>;
  readonly fizz1: Readonly<Record<string, number>>;
  readonly fizz2: Readonly<Record<string, number>>;
}
/** Counts are always recomputed from the slots so they cannot drift from the table. */
export function summarise(slots: readonly Slot[]): Summary {
  const byStatus: Record<string, number> = Object.fromEntries(STATUSES.map(status => [status.id, 0]));
  const fizz1: Record<string, number> = Object.fromEntries(USAGE_STATES.map(state => [state.id, 0]));
  const fizz2: Record<string, number> = { ...fizz1 };
  for (const slot of slots) {
    byStatus[slot.status] = (byStatus[slot.status] ?? 0) + 1;
    fizz1[slot.games.fizz1.state] = (fizz1[slot.games.fizz1.state] ?? 0) + 1;
    fizz2[slot.games.fizz2.state] = (fizz2[slot.games.fizz2.state] ?? 0) + 1;
  }
  return { total: slots.length, byStatus, fizz1, fizz2 };
}

export const isUsed = (slot: Slot): boolean => slot.games.fizz1.state === 'used' || slot.games.fizz2.state === 'used';
export const isGap = (slot: Slot): boolean => statusInfo(slot.status).gap;

export interface Progress { readonly used: number; readonly ready: number; readonly inGame: number; readonly percent: number; readonly inGamePercent: number }
/** Of the slots a game actually uses, how many already have finished new art, and how many are in the game. */
export function progress(slots: readonly Slot[]): Progress {
  const used = slots.filter(isUsed);
  const ready = used.filter(slot => statusInfo(slot.status).artReady).length;
  const inGame = used.filter(slot => slot.status === 'in-game').length;
  const percent = used.length ? Math.round((ready / used.length) * 100) : 0;
  const inGamePercent = used.length ? Math.round((inGame / used.length) * 100) : 0;
  return { used: used.length, ready, inGame, percent, inGamePercent };
}

/** Adds up the 4-bit cost of the frames shown, counting a frame once even when two slots show it (a landing is a frame of its jump). */
export function totalDosBytes(slots: readonly Slot[]): number {
  const counted = new Set<string>();
  let total = 0;
  for (const slot of slots) {
    if (!slot.dos) continue;
    if (!slot.new || !slot.dos.bytesPerFrame) { total += slot.dos.totalBytes; continue; }
    for (const name of slot.new.frames) if (!counted.has(name)) { counted.add(name); total += slot.dos.bytesPerFrame; }
  }
  return total;
}

export type UsageFilter = 'all' | 'fizz1-used' | 'fizz2-used' | 'either-used' | 'could-use' | 'unused';
export interface Filters {
  readonly status: string;
  readonly group: string;
  readonly usage: UsageFilter;
  readonly search: string;
  readonly gapsOnly: boolean;
  /** `all`, or one of the facing ids. */
  readonly facing: string;
  /** Only side views whose sprite is missing or still needs pixel art. */
  readonly missingSide: boolean;
}
export const defaultFilters: Filters = { status: 'all', group: 'all', usage: 'all', search: '', gapsOnly: false, facing: 'all', missingSide: false };

/** A right- or left-facing slot with no finished sprite of its own: nothing drawn, or only a model render. Partial art counts as drawn. */
export const isMissingSide = (slot: Slot): boolean => isSideView(slot) && (slot.status === 'missing' || slot.status === 'needs-pixel-art');

function matchesUsage(slot: Slot, usage: UsageFilter): boolean {
  const { fizz1, fizz2 } = slot.games;
  switch (usage) {
    case 'fizz1-used': return fizz1.state === 'used';
    case 'fizz2-used': return fizz2.state === 'used';
    case 'either-used': return isUsed(slot);
    case 'could-use': return fizz1.state === 'could-use' || fizz2.state === 'could-use';
    case 'unused': return !isUsed(slot) && fizz1.state !== 'could-use' && fizz2.state !== 'could-use';
    default: return true;
  }
}
export function slotMatches(slot: Slot, filters: Filters): boolean {
  if (filters.status !== 'all' && slot.status !== filters.status) return false;
  if (filters.group !== 'all' && slot.group !== filters.group) return false;
  if (filters.gapsOnly && !isGap(slot)) return false;
  if (filters.facing !== 'all' && slot.facing !== filters.facing) return false;
  if (filters.missingSide && !isMissingSide(slot)) return false;
  if (!matchesUsage(slot, filters.usage)) return false;
  const needle = filters.search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [slot.id, slot.label, facingInfo(slot.facing).label, slot.notes, slot.games.fizz1.evidence, slot.games.fizz2.evidence, slot.old?.frames.join(' '), slot.new?.frames.join(' '), slot.old?.note].join(' ').toLowerCase();
  return needle.split(/\s+/).every(word => haystack.includes(word));
}
export function filterSlots(slots: readonly Slot[], filters: Filters): Slot[] {
  return slots.filter(slot => slotMatches(slot, filters));
}

export interface FacingRow {
  /** The slot id without its side, such as `shoot` for `shoot-right`; unique per pose. */
  readonly key: string;
  readonly label: string;
  readonly right: Slot;
  readonly left: Slot;
}
/** The pose name without its side, so "Run, facing right (6-frame cut)" becomes "Run (6-frame cut)". */
export function poseLabel(label: string): string {
  return label.replace(/,?\s*facing (?:right|left)/, '').trim();
}
/** Pairs each right-facing slot with the left-facing slot it names, in inventory order. Unpaired or dangling side views are left out. */
export function buildFacingMatrix(slots: readonly Slot[]): FacingRow[] {
  const byId = new Map(slots.map(slot => [slot.id, slot]));
  const rows: FacingRow[] = [];
  for (const slot of slots) {
    if (slot.facing !== 'right' || !slot.pair) continue;
    const left = byId.get(slot.pair);
    if (!left || left.facing !== 'left' || left.pair !== slot.id) continue;
    rows.push({ key: slot.id.replace(/-right$/, ''), label: poseLabel(slot.label), right: slot, left });
  }
  return rows;
}
/** Poses where at least one side still has no finished sprite. */
export const rowsMissingSide = (rows: readonly FacingRow[]): FacingRow[] => rows.filter(row => isMissingSide(row.right) || isMissingSide(row.left));

export type SortMode = 'gaps-first' | 'inventory';
export interface GroupedSlots { readonly group: Group; readonly slots: readonly Slot[]; readonly gaps: number }
/** Groups keep inventory order. Inside a group, gaps come first unless the inventory order is requested. Empty groups are omitted. */
export function groupSlots(slots: readonly Slot[], groups: readonly Group[], sort: SortMode): GroupedSlots[] {
  const result: GroupedSlots[] = [];
  for (const group of groups) {
    const members = slots.filter(slot => slot.group === group.id);
    if (!members.length) continue;
    const ordered = sort === 'inventory' ? members : members.map((slot, index) => ({ slot, index })).sort((a, b) => statusInfo(a.slot.status).rank - statusInfo(b.slot.status).rank || a.index - b.index).map(entry => entry.slot);
    result.push({ group, slots: ordered, gaps: members.filter(isGap).length });
  }
  // With gaps first, groups that hold the most urgent work also rise to the top.
  if (sort === 'gaps-first') result.sort((a, b) => Number(b.gaps > 0) - Number(a.gaps > 0));
  return result;
}

// ---- Pixels ----

export interface Pixel { readonly x: number; readonly y: number; readonly colour: string }
/** Expands palette-letter rows to coloured pixels. Transparent and unknown letters are skipped, never guessed. */
export function gridToPixels(rows: readonly string[], palette: Palette): Pixel[] {
  const pixels: Pixel[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const colour = Object.hasOwn(palette, row[x]) ? palette[row[x]] : null;
      if (colour) pixels.push({ x, y, colour });
    }
  });
  return pixels;
}
export const gridSize = (rows: readonly string[]): { width: number; height: number } => ({ width: rows.reduce((widest, row) => Math.max(widest, row.length), 0), height: rows.length });
/** Bottom-centre alignment keeps feet on a shared ground line when old and new frames differ in size. */
export function frameOffset(frame: { width: number; height: number }, box: { width: number; height: number }): { x: number; y: number } {
  return { x: Math.floor((box.width - frame.width) / 2), y: box.height - frame.height };
}

/**
 * Reads a game sprite snapshot into a name to rows map. The snapshot lists sprites as an array of
 * `{ name, rows }`, but a plain `{ name: rows }` or `{ name: { rows | grid } }` map is accepted too.
 */
export function parseSpriteSet(raw: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const rowsOf = (value: unknown): string[] | null => {
    if (Array.isArray(value) && value.every(row => typeof row === 'string')) return value as string[];
    if (isRecord(value)) return rowsOf(value.rows) ?? rowsOf(value.grid);
    return null;
  };
  const sprites = isRecord(raw) ? raw.sprites : undefined;
  if (Array.isArray(sprites)) {
    for (const sprite of sprites) {
      const rows = isRecord(sprite) ? rowsOf(sprite) : null;
      if (isRecord(sprite) && text(sprite.name) && rows) result[text(sprite.name)] = rows;
    }
  } else if (isRecord(sprites)) {
    for (const [name, value] of Object.entries(sprites)) {
      const rows = rowsOf(value);
      if (rows) result[name] = rows;
    }
  }
  return result;
}

export interface Playback { readonly frames: readonly (readonly string[])[]; readonly durationsMs: readonly number[]; readonly missing: readonly string[]; readonly expected: number }
export const defaultFrameMs = 110;
/** Turns frame names into drawable rows. Unknown names are reported in `missing`, never replaced. */
export function resolvePlayback(names: readonly string[], lookup: (name: string) => readonly string[] | undefined, durationsMs: readonly number[] = []): Playback {
  const frames: (readonly string[])[] = [], durations: number[] = [], missing: string[] = [];
  names.forEach((name, index) => {
    const rows = lookup(name);
    if (!rows || !rows.length) { missing.push(name); return; }
    frames.push(rows);
    const duration = durationsMs[index];
    durations.push(typeof duration === 'number' && duration > 0 ? duration : defaultFrameMs);
  });
  return { frames, durationsMs: durations, missing, expected: names.length };
}
/** Timing from a named animation is used only when it plays exactly the slot's frames, otherwise the default rate applies. */
export function animationDurations(animation: Animation | undefined, names: readonly string[]): number[] {
  if (!animation || animation.frames.length !== names.length || animation.frames.some((name, index) => name !== names[index])) return [];
  return animation.durationsMs;
}
export function newPlayback(art: NewArt | null, frames: Frames, animations: Record<string, Animation>): Playback {
  if (!art) return { frames: [], durationsMs: [], missing: [], expected: 0 };
  const animation = art.animation && Object.hasOwn(animations, art.animation) ? animations[art.animation] : undefined;
  return resolvePlayback(art.frames, name => Object.hasOwn(frames, name) ? frames[name].grid : undefined, animationDurations(animation, art.frames));
}
export function oldPlayback(art: OldArt | null, sets: Readonly<Record<string, Record<string, string[]>>>): Playback {
  if (!art) return { frames: [], durationsMs: [], missing: [], expected: 0 };
  const set = Object.hasOwn(sets, art.set) ? sets[art.set] : {};
  return resolvePlayback(art.frames, name => Object.hasOwn(set, name) ? set[name] : undefined);
}
/** Index of the frame to show after `elapsedMs`, looping over the frame durations. */
export function frameIndexAt(durationsMs: readonly number[], elapsedMs: number): number {
  const total = durationsMs.reduce((sum, value) => sum + value, 0);
  if (!total) return 0;
  let remaining = ((elapsedMs % total) + total) % total;
  for (let index = 0; index < durationsMs.length; index++) {
    if (remaining < durationsMs[index]) return index;
    remaining -= durationsMs[index];
  }
  return durationsMs.length - 1;
}
