// Describes the Fizz 2 door design study: stackable keyed-door segments, exit layers, byte costs and checks.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Palette } from './types.ts';

export type Grid = readonly string[];
export const SEGMENTS = ['top', 'mid', 'bot'] as const;
export type Segment = typeof SEGMENTS[number];
export type SegmentGrids = Partial<Record<Segment, Grid>>;
export const TILE = 16;

/** One frame of a sequence: the frame id each layer shows, or null where the layer draws nothing. */
export interface Step {
  readonly back?: string | null;
  readonly front?: string | null;
  /** The glow layer frame drawn with the door, before Ben. */
  readonly glow?: string | null;
  /** A glow layer frame drawn after Ben (an exit's light veil or its arrow over a hidden Ben). */
  readonly glowOver?: string | null;
  /**
   * Ben during an exit walk-in, by `source/ben-door-pass.json`: the workshop frame, the sprite's left edge in the exit's
   * pixels, how far he has risen and how many rows of him are drawn from the crown (`visibleRows`; `keepCanvasRows` is the same crop as the top rows of the whole 24 × 44 frame, the crown being on row 3), the game cropping the rest. `behind` is
   * true while the front lip and `glowOver` are drawn after him; `hidden` means he is not drawn.
   */
  readonly ben?: { readonly frame: string; readonly left: number; readonly rise: number; readonly visibleRows: number; readonly keepCanvasRows: number; readonly behind: boolean; readonly hidden?: boolean };
}
export interface Sequence {
  readonly loop: boolean;
  readonly note: string;
  readonly frames: readonly Step[];
  readonly durationsMs: readonly number[];
}

export interface KeyedLayer { readonly frames: Readonly<Record<string, SegmentGrids>> }
export interface ExitLayer {
  /** The layer's box inside the design's box, so a small layer costs only its own pixels. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly frames: Readonly<Record<string, Grid>>;
}
export interface GlowInfo {
  readonly bank: string;
  readonly letters: readonly string[];
  readonly draw: string;
}
export interface LayerBytes { readonly bytesPerFrame: number; readonly uniqueFrames: number; readonly bytes: number }
export interface KeyedBytes {
  readonly segments: { readonly back: LayerBytes; readonly glow: LayerBytes; readonly total: number };
  readonly composed48: { readonly back: LayerBytes; readonly glow: LayerBytes; readonly total: number };
  readonly composed32: { readonly back: LayerBytes; readonly glow: LayerBytes; readonly total: number };
}
export interface ExitBytes { readonly back: LayerBytes | null; readonly front: LayerBytes | null; readonly glow: LayerBytes | null; readonly total: number }

interface DesignCommon {
  readonly id: string;
  readonly family: string;
  readonly name: string;
  readonly idea: string;
  readonly why: string;
  readonly behaviour: 'always-open' | 'animated-open';
  readonly notes: readonly string[];
  readonly glow: GlowInfo;
  readonly sequences: Readonly<Record<string, Sequence>>;
}
export interface KeyedDesign extends DesignCommon {
  readonly kind: 'keyed-red' | 'keyed-blue';
  readonly segment: { readonly w: number; readonly h: number };
  readonly badge: 'triangle' | 'disc';
  readonly badgeSegment: Segment;
  /** The back frame that stays once the door has opened, or null when the door only disappears. */
  readonly heldOpenFrame: string | null;
  /** What the held open frame keeps of the closed door's case: its lintel strip and its side faces. Null when there is no held frame. */
  readonly heldOpenKeeps: { readonly topStrip: boolean; readonly sideFace: boolean } | null;
  readonly placement: { readonly anchor: 'floor-line column'; readonly note: string };
  readonly layers: { readonly back: KeyedLayer; readonly glow: KeyedLayer };
  readonly bytes: KeyedBytes;
}
export interface ExitDesign extends DesignCommon {
  readonly kind: 'exit';
  readonly size: { readonly w: number; readonly h: number };
  /** Where the design's top-left corner sits: relative to the exit cell's left edge and the top of the lower exit cell. */
  readonly placement: { readonly anchor: 'far-plane sill'; readonly x: number; readonly y: number; readonly note: string };
  readonly layers: { readonly back: ExitLayer | null; readonly front: ExitLayer | null; readonly glow: ExitLayer | null };
  readonly bytes: ExitBytes;
}
export type Design = KeyedDesign | ExitDesign;
/** The standing answers from the Fizz 2 session and the defaults chosen where Scott has not yet decided. */
export interface Fizz2Answers {
  readonly keyedHeight: { readonly standardTiles: number; readonly minimumTiles: number; readonly standardPx: number; readonly minimumPx: number; readonly note: string; readonly twinLeavesClearOpening: { readonly tiles2: number; readonly tiles3: number; readonly interiorWidth: number }; readonly benBodyPx: number };
  readonly heldOpen: { readonly defaultKeeps: boolean; readonly decidedBy: string; readonly status: string; readonly keeps: readonly string[]; readonly note: string };
  readonly night: { readonly litArt: string; readonly glowLayer: string; readonly status: string };
  readonly dosMemory: { readonly copies: number; readonly bytesPerCopyMax: number; readonly bytesBothColoursMax: number; readonly sharedGrids: boolean; readonly perFamily: Readonly<Record<string, number>>; readonly note: string };
  readonly sound: { readonly dooropenMs: string; readonly status: string; readonly proposedOpeningMs: string; readonly openingMs: Readonly<Record<string, number>>; readonly note: string };
  readonly facts: readonly string[];
}
export interface DoorDesigns {
  readonly generated: string;
  readonly palette: string;
  readonly paletteLetters: readonly string[];
  readonly tile: number;
  readonly ben: { readonly bodyHeight: number; readonly spriteWidth: number; readonly note: string };
  readonly walkIn: { readonly contract: string; readonly animation: string; readonly spriteLeft: number; readonly spriteRule: string; readonly startBelowSill: string; readonly previewStartBelowSill: number };
  readonly sidePass: { readonly animation: string; readonly note: string };
  readonly fizz2: Fizz2Answers;
  readonly drawOrder: readonly string[];
  readonly designs: readonly Design[];
}

export const isKeyed = (design: Design): design is KeyedDesign => design.kind !== 'exit';

/** Four bits a pixel, as the DOS cost is counted: ceil(w * h / 2). */
export const frameBytes = (w: number, h: number): number => Math.ceil(w * h / 2);

/** The segments a door of `tiles` tiles stacks, top first: the top alone, top and bottom, or top, middles and bottom. */
export function stackFor(tiles: number): Segment[] {
  if (tiles <= 1) return ['top'];
  return ['top', ...Array.from({ length: tiles - 2 }, () => 'mid' as const), 'bot'];
}
/** A keyed frame composed into one grid for a door `tiles` tall; missing glow segments become transparent rows. */
export function composeKeyed(frame: SegmentGrids | undefined, tiles: number, width = TILE): string[] {
  const empty = Array.from({ length: TILE }, () => '.'.repeat(width));
  return stackFor(tiles).flatMap(segment => [...(frame?.[segment] ?? empty)]);
}

const uniqueCount = (grids: readonly Grid[]): number => new Set(grids.map(grid => grid.join('\n'))).size;
const layerBytes = (perFrame: number, unique: number): LayerBytes => ({ bytesPerFrame: perFrame, uniqueFrames: unique, bytes: perFrame * unique });

/** The keyed design's cost stored as 16 by 16 segments, and baked as whole 16 by 48 and 16 by 32 doors. */
export function keyedBytes(layers: KeyedDesign['layers']): KeyedBytes {
  const segmentBytes = frameBytes(TILE, TILE);
  const back = Object.values(layers.back.frames), glow = Object.values(layers.glow.frames);
  const segments = (frames: readonly SegmentGrids[]) => uniqueCount(frames.flatMap(frame => SEGMENTS.flatMap(segment => frame[segment] ? [frame[segment]] : [])));
  const composed = (tiles: number) => {
    const backBytes = layerBytes(frameBytes(TILE, TILE * tiles), uniqueCount(back.map(frame => composeKeyed(frame, tiles))));
    // A baked badge is the top segment's glow piece, the same for every height.
    const glowBytes = layerBytes(segmentBytes, uniqueCount(glow.map(frame => composeKeyed(frame, 1))));
    return { back: backBytes, glow: glowBytes, total: backBytes.bytes + glowBytes.bytes };
  };
  const segBack = layerBytes(segmentBytes, segments(back)), segGlow = layerBytes(segmentBytes, segments(glow));
  return { segments: { back: segBack, glow: segGlow, total: segBack.bytes + segGlow.bytes }, composed48: composed(3), composed32: composed(2) };
}
export function exitBytes(layers: ExitDesign['layers']): ExitBytes {
  const one = (layer: ExitLayer | null): LayerBytes | null => layer ? layerBytes(frameBytes(layer.w, layer.h), uniqueCount(Object.values(layer.frames))) : null;
  const back = one(layers.back), front = one(layers.front), glow = one(layers.glow);
  return { back, front, glow, total: (back?.bytes ?? 0) + (front?.bytes ?? 0) + (glow?.bytes ?? 0) };
}
export const designBytes = (design: Design): number => isKeyed(design) ? design.bytes.segments.total : design.bytes.total;

/** Swaps letters cell by cell, for comparing a red design with its blue twin. */
export const recolour = (grid: Grid, map: Readonly<Record<string, string>>): string[] => grid.map(row => [...row].map(code => map[code] ?? code).join(''));
/** The opaque cells of a grid as a mask string, so two grids can be compared for shape alone. */
export const opaqueMask = (grid: Grid): string => grid.map(row => [...row].map(code => code === '.' ? '.' : '#').join('')).join('\n');

function checkGrid(grid: unknown, w: number, h: number, palette: Palette, where: string, errors: string[]): grid is Grid {
  if (!Array.isArray(grid) || grid.length !== h || grid.some(row => typeof row !== 'string' || row.length !== w)) { errors.push(`${where}: not ${w} × ${h}`); return false; }
  const bad = grid.flatMap(row => [...(row as string)].filter(code => !Object.hasOwn(palette, code)));
  if (bad.length) { errors.push(`${where}: unknown palette letters ${[...new Set(bad)].join('')}`); return false; }
  return true;
}
/** Back cells under an opaque glow cell must be transparent, so the badge or the light exists only on its own layer. */
function checkUnderGlow(back: Grid | undefined, glow: Grid | undefined, dx: number, dy: number, where: string, errors: string[]): void {
  if (!back || !glow) return;
  glow.forEach((row, y) => [...row].forEach((code, x) => {
    if (code !== '.' && back[y + dy]?.[x + dx] !== undefined && back[y + dy][x + dx] !== '.') errors.push(`${where}: back pixel under glow at ${x + dx},${y + dy}`);
  }));
}

/** Every problem found in a design: sizes, palette letters, sequence references, glow letters and the glow's own layer. */
export function validateDesign(design: Design, palette: Palette): string[] {
  const errors: string[] = [];
  const glowLetters = new Set(design.glow.letters);
  const checkGlowLetters = (grid: Grid, where: string) => { const bad = grid.flatMap(row => [...row].filter(code => code !== '.' && !glowLetters.has(code))); if (bad.length) errors.push(`${where}: letters ${[...new Set(bad)].join('')} are not glow letters`); };
  for (const [name, sequence] of Object.entries(design.sequences)) {
    if (sequence.frames.length !== sequence.durationsMs.length) errors.push(`${design.id}.${name}: ${sequence.frames.length} frames but ${sequence.durationsMs.length} durations`);
    if (sequence.durationsMs.some(ms => !Number.isInteger(ms) || ms <= 0)) errors.push(`${design.id}.${name}: durations must be positive whole milliseconds`);
  }
  if (isKeyed(design)) {
    const { w, h } = design.segment;
    if (w !== TILE || h !== TILE) errors.push(`${design.id}: segments must be ${TILE} × ${TILE}`);
    for (const [layerName, layer] of Object.entries(design.layers)) for (const [frameId, frame] of Object.entries(layer.frames)) for (const segment of SEGMENTS) {
      const grid = frame[segment];
      if (grid === undefined) { if (layerName === 'back') errors.push(`${design.id}.${layerName}.${frameId}: missing the ${segment} segment`); continue; }
      if (checkGrid(grid, w, h, palette, `${design.id}.${layerName}.${frameId}.${segment}`, errors) && layerName === 'glow') checkGlowLetters(grid, `${design.id}.glow.${frameId}.${segment}`);
    }
    for (const [name, sequence] of Object.entries(design.sequences)) sequence.frames.forEach((step, index) => {
      const where = `${design.id}.${name}[${index}]`;
      if (step.front !== undefined || step.glowOver !== undefined || step.ben !== undefined) errors.push(`${where}: keyed doors draw only back and glow, before Ben`);
      if (step.back && !design.layers.back.frames[step.back]) errors.push(`${where}: no back frame ${step.back}`);
      if (step.glow && !design.layers.glow.frames[step.glow]) errors.push(`${where}: no glow frame ${step.glow}`);
      const back = step.back ? design.layers.back.frames[step.back] : undefined, glow = step.glow ? design.layers.glow.frames[step.glow] : undefined;
      if (back && glow) for (const segment of SEGMENTS) checkUnderGlow(back[segment], glow[segment], 0, 0, `${where}.${segment}`, errors);
    });
    if (design.heldOpenFrame !== null && !design.layers.back.frames[design.heldOpenFrame]) errors.push(`${design.id}: no held open frame ${design.heldOpenFrame}`);
    for (const required of ['closed', 'open', 'emptyEnding']) if (!design.sequences[required]) errors.push(`${design.id}: missing the ${required} sequence`);
    if (design.behaviour === 'animated-open' && !design.sequences.opening?.frames.length) errors.push(`${design.id}: an animated door needs opening frames`);
    const frameTotal = Object.keys(design.layers.back.frames).length;
    if (frameTotal > 8) errors.push(`${design.id}: ${frameTotal} back frames, more than 8`);
  } else {
    const { w, h } = design.size;
    for (const [layerName, layer] of Object.entries(design.layers)) {
      if (!layer) continue;
      if (layer.x < 0 || layer.y < 0 || layer.x + layer.w > w || layer.y + layer.h > h) errors.push(`${design.id}.${layerName}: box outside ${w} × ${h}`);
      for (const [frameId, grid] of Object.entries(layer.frames)) if (checkGrid(grid, layer.w, layer.h, palette, `${design.id}.${layerName}.${frameId}`, errors) && layerName === 'glow') checkGlowLetters(grid, `${design.id}.glow.${frameId}`);
    }
    const lookup = (layerName: 'back' | 'front' | 'glow', id: string | null | undefined, where: string): Grid | undefined => {
      if (!id) return undefined;
      const grid = design.layers[layerName]?.frames[id];
      if (!grid) errors.push(`${where}: no ${layerName} frame ${id}`);
      return grid;
    };
    for (const [name, sequence] of Object.entries(design.sequences)) sequence.frames.forEach((step, index) => {
      const where = `${design.id}.${name}[${index}]`;
      const back = lookup('back', step.back, where), glow = lookup('glow', step.glow, where);
      lookup('front', step.front, where); lookup('glow', step.glowOver, where);
      if (step.glowOver && !step.ben?.behind) errors.push(`${where}: glowOver is only drawn while Ben is behind the doorway plane`);
      if (back && glow && design.layers.back && design.layers.glow) checkUnderGlow(back, glow, design.layers.glow.x - design.layers.back.x, design.layers.glow.y - design.layers.back.y, where, errors);
    });
    for (const required of ['idle', 'enter']) if (!design.sequences[required]) errors.push(`${design.id}: missing the ${required} sequence`);
    const frameTotal = Math.max(0, ...Object.values(design.layers).map(layer => layer ? Object.keys(layer.frames).length : 0));
    if (frameTotal > 8) errors.push(`${design.id}: a layer has ${frameTotal} frames, more than 8`);
  }
  return errors;
}

/** The rows of the top segment that are the case's lintel strip (the dark edge and the lit top). */
export const TOP_STRIP_ROWS = 2;
/** The columns each side of a segment that are the case's side faces (outline and lit or shaded jamb). */
export const SIDE_FACE_COLUMNS = 2;
/** Whether the held open frame keeps the closed door's lintel strip and side faces exactly, so the case never opens up behind Ben. */
export function heldOpenKeeps(design: KeyedDesign): { topStrip: boolean; sideFace: boolean } | null {
  if (!design.heldOpenFrame) return null;
  const closed = design.layers.back.frames[design.sequences.closed.frames[0].back!], held = design.layers.back.frames[design.heldOpenFrame];
  const topStrip = (closed.top ?? []).slice(0, TOP_STRIP_ROWS).every((row, y) => row === held.top?.[y]);
  const side = (row: string): string => row.slice(0, SIDE_FACE_COLUMNS) + row.slice(row.length - SIDE_FACE_COLUMNS);
  const sideFace = SEGMENTS.every(segment => (closed[segment] ?? []).every((row, y) => side(row) === side(held[segment]?.[y] ?? '')));
  return { topStrip, sideFace };
}
/** The longest run of rows whose interior columns (past the jamb faces) are all transparent, for a door `tiles` tall: the opening Ben passes. */
export function clearOpeningRows(frame: SegmentGrids, tiles: number, from = 4, to = 14): number {
  let best = 0, run = 0;
  for (const row of composeKeyed(frame, tiles)) {
    if ([...row.slice(from, to)].every(code => code === '.')) best = Math.max(best, ++run); else run = 0;
  }
  return best;
}
