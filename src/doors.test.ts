// Checks the Fizz 2 door designs: palette letters, sizes, sequences, the glow layer, red and blue twins and byte costs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import doorData from '../source/door-designs.json';
import palette from '../source/game-palette.json';
import pass from '../source/ben-door-pass.json';
import { composeKeyed, exitBytes, frameBytes, isKeyed, keyedBytes, opaqueMask, recolour, SEGMENTS, stackFor, validateDesign, type DoorDesigns, type ExitDesign, type KeyedDesign } from './doors.ts';

const data = doorData as unknown as DoorDesigns;
const keyed = data.designs.filter(isKeyed);
const exits = data.designs.filter((design): design is ExitDesign => !isKeyed(design));

test('the file names its date, the game palette and enough designs', () => {
  expect(data.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(data.palette).toBe('source/game-palette.json');
  expect(data.paletteLetters).toEqual(Object.keys(palette));
  expect(new Set(keyed.map(design => design.family)).size).toBeGreaterThanOrEqual(6);
  expect(exits.length).toBeGreaterThanOrEqual(4);
  expect(new Set(data.designs.map(design => design.id)).size).toBe(data.designs.length);
  for (const design of data.designs) for (const field of [design.name, design.idea, design.why]) expect(field.length).toBeGreaterThan(0);
});

test('every design passes validation: sizes, letters, sequence references and glow on its own layer', () => {
  for (const design of data.designs) expect(validateDesign(design, palette)).toEqual([]);
});

test('validation catches a bad letter, a wrong size, a missing frame and a badge left on the back layer', () => {
  const design = structuredClone(keyed[0]) as KeyedDesign;
  const back = design.layers.back.frames.closed as Record<string, string[]>;
  const top = back.top, mid = back.mid;
  mid[0] = 'Z' + mid[0].slice(1);
  back.bot = back.bot.slice(1);
  (design.sequences.opening.frames as { back: string }[])[0].back = 'nowhere';
  const glow = design.layers.glow.frames.closed.top!;
  const y = glow.findIndex(row => row.includes('W')), x = glow[y].indexOf('W');
  top[y] = top[y].slice(0, x) + 'k' + top[y].slice(x + 1);
  const errors = validateDesign(design, palette).join('\n');
  expect(errors).toContain('unknown palette letters Z');
  expect(errors).toContain('not 16 × 16');
  expect(errors).toContain('no back frame nowhere');
  expect(errors).toContain('back pixel under glow');
});

test('keyed doors are 16 by 16 segments that stack to any height, with at most 8 frames', () => {
  expect(stackFor(1)).toEqual(['top']);
  expect(stackFor(2)).toEqual(['top', 'bot']);
  expect(stackFor(3)).toEqual(['top', 'mid', 'bot']);
  expect(stackFor(4)).toEqual(['top', 'mid', 'mid', 'bot']);
  for (const design of keyed) {
    expect(design.segment).toEqual({ w: 16, h: 16 });
    expect(design.badgeSegment).toBe('top');
    expect(Object.keys(design.layers.back.frames).length).toBeLessThanOrEqual(8);
    for (const frame of Object.values(design.layers.back.frames)) {
      expect(composeKeyed(frame, 3)).toHaveLength(48);
      expect(composeKeyed(frame, 2)).toEqual([...frame.top!, ...frame.bot!]);
    }
    // Glow only on the top segment, and only white.
    for (const frame of Object.values(design.layers.glow.frames)) {
      expect(Object.keys(frame)).toEqual(['top']);
      expect(frame.top!.join('').replace(/[.W]/g, '')).toBe('');
    }
    // The shut door shows its badge; the opening is presentation only, so nothing is drawn in front of Ben.
    expect(design.sequences.closed.frames[0].glow).toBe('closed');
    for (const sequence of Object.values(design.sequences)) for (const step of sequence.frames) expect(step.front ?? step.glowOver ?? step.ben).toBeUndefined();
    expect(design.sequences.emptyEnding.frames).toEqual([{ back: null, glow: null }]);
  }
});

test('red and blue twins share their grids and differ only in colour and badge shape', () => {
  const families = [...new Set(keyed.map(design => design.family))];
  for (const family of families) {
    const red = keyed.find(design => design.family === family && design.kind === 'keyed-red')!;
    const blue = keyed.find(design => design.family === family && design.kind === 'keyed-blue')!;
    expect(red.badge).toBe('triangle');
    expect(blue.badge).toBe('disc');
    expect(blue.sequences).toEqual(red.sequences);
    expect(Object.keys(blue.layers.back.frames)).toEqual(Object.keys(red.layers.back.frames));
    expect(Object.keys(blue.layers.glow.frames)).toEqual(Object.keys(red.layers.glow.frames));
    for (const [id, redFrame] of Object.entries(red.layers.back.frames)) for (const segment of SEGMENTS) {
      const redGlow = red.layers.glow.frames[id]?.[segment], blueGlow = blue.layers.glow.frames[id]?.[segment];
      const badge = (grid: readonly string[] | undefined, y: number, x: number) => grid?.[y][x] === 'W';
      const painted = recolour(redFrame[segment]!, { r: 'b', R: 'B' });
      blue.layers.back.frames[id][segment]!.forEach((row, y) => [...row].forEach((code, x) => {
        // Cells where either badge lies may be a hole in one and the plate in the other; every other cell matches.
        if (!badge(redGlow, y, x) && !badge(blueGlow, y, x)) expect(`${id}.${segment} ${x},${y} ${code}`).toBe(`${id}.${segment} ${x},${y} ${painted[y][x]}`);
      }));
      // The badges sit in the same place: the same rows and columns are used by both shapes' 7 by 7 box.
      if (redGlow && blueGlow) {
        const box = (grid: readonly string[]) => { const cells = grid.flatMap((row, y) => [...row].flatMap((code, x) => code === 'W' ? [[x, y]] : [])); return [Math.min(...cells.map(c => c[0])), Math.max(...cells.map(c => c[0]))]; };
        expect(box(blueGlow)).toEqual(box(redGlow));
        expect(opaqueMask(redGlow)).not.toBe(opaqueMask(blueGlow));
      }
    }
  }
});

test('exits sit on the far-plane sill: 20 by 35, a 6-row front lip and a 14 by 32 glow piece', () => {
  for (const design of exits) {
    expect(design.size).toEqual({ w: 20, h: 35 });
    expect(design.placement).toMatchObject({ anchor: 'far-plane sill', x: 4, y: -35 });
    expect(design.layers.back).toMatchObject({ x: 0, y: 0, w: 20, h: 29 });
    expect(design.layers.front).toMatchObject({ x: 0, y: 29, w: 20, h: 6 });
    expect(design.layers.glow).toMatchObject({ x: 3, y: 3, w: 14, h: 32 });
    for (const layer of [design.layers.back, design.layers.front, design.layers.glow]) if (layer) expect(Object.keys(layer.frames).length).toBeLessThanOrEqual(8);
    // Every step of every sequence draws the lip.
    for (const sequence of Object.values(design.sequences)) for (const step of sequence.frames) expect(step.front).toBe('lip');
  }
  for (const design of keyed) expect(design.placement.anchor).toBe('floor-line column');
});

test('the walk-in follows the lab door-pass contract and ends with Ben gone', () => {
  const frames = pass.farPlaneWalkIn.perFrame;
  expect(data.walkIn.contract).toBe('source/ben-door-pass.json');
  expect(data.walkIn.spriteLeft).toBe(pass.farPlaneWalkIn.placement.spriteLeft);
  for (const design of exits) {
    const enter = design.sequences.enter;
    const walking = enter.frames.filter(step => step.ben && !step.ben.hidden);
    expect(walking.map(step => step.ben!.frame)).toEqual(frames.map(frame => frame.name));
    expect(walking.map(step => step.ben!.rise)).toEqual(pass.farPlaneWalkIn.motion.rise);
    expect(walking.map(step => step.ben!.visibleRows)).toEqual(frames.map(frame => frame.visibleRows));
    expect(enter.durationsMs.slice(0, frames.length)).toEqual(frames.map(frame => frame.durationMs));
    // During the walk-in the lip is drawn after Ben; at the end he is not drawn at all.
    expect(enter.frames.every(step => step.ben?.behind)).toBe(true);
    expect(enter.frames.at(-1)!.ben?.hidden).toBe(true);
  }
});

test('byte costs are ceil(w × h / 2) for each distinct grid, as stored', () => {
  expect(frameBytes(16, 16)).toBe(128);
  expect(frameBytes(16, 48)).toBe(384);
  expect(frameBytes(20, 35)).toBe(350);
  expect(frameBytes(3, 3)).toBe(5);
  for (const design of keyed) {
    expect(design.bytes).toEqual(keyedBytes(design.layers));
    const grids = new Set(Object.values(design.layers.back.frames).flatMap(frame => SEGMENTS.map(segment => frame[segment]!.join('\n'))));
    expect(design.bytes.segments.back.bytes).toBe(grids.size * 128);
    expect(design.bytes.composed48.back.bytesPerFrame).toBe(384);
    expect(design.bytes.composed32.back.bytesPerFrame).toBe(256);
    // About 2 KB a design, stored as segments.
    expect(design.bytes.segments.total).toBeLessThanOrEqual(2304);
  }
  for (const design of exits) {
    expect(design.bytes).toEqual(exitBytes(design.layers));
    expect(design.bytes.total).toBeLessThanOrEqual(2048);
  }
});
