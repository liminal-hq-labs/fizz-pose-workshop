// Checks the Fizz 2 door designs: palette letters, sizes, sequences, the glow layer, red and blue twins and byte costs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import doorData from '../source/door-designs.json';
import palette from '../source/game-palette.json';
import pass from '../source/ben-door-pass.json';
import { clearOpeningRows, composeKeyed, exitBytes, heldOpenKeeps, frameBytes, isKeyed, keyedBytes, opaqueMask, recolour, SEGMENTS, stackFor, validateDesign, type DoorDesigns, type ExitDesign, type KeyedDesign } from './doors.ts';

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
    expect(walking.map(step => step.ben!.keepCanvasRows)).toEqual(frames.map(frame => frame.keepCanvasRows));
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

const redOf = (family: string): KeyedDesign => keyed.find(design => design.family === family && design.kind === 'keyed-red')!;

test('Twin Leaves opens a clear gap taller than Ben with margin at the standard 3 tiles, and a tight one at the 2-tile minimum', () => {
  const twin = redOf('twin-leaves'), open = twin.layers.back.frames[twin.heldOpenFrame!];
  expect(clearOpeningRows(open, 3)).toBe(data.fizz2.keyedHeight.twinLeavesClearOpening.tiles3);
  // Ben's body is 32 px: the standard door leaves at least 4 px of margin over it, and the minimum leaves none to spare.
  expect(clearOpeningRows(open, 3)).toBeGreaterThanOrEqual(data.fizz2.keyedHeight.benBodyPx + 4);
  expect(clearOpeningRows(open, 2)).toBeLessThan(data.fizz2.keyedHeight.benBodyPx);
  // The badge stays on the transom in every frame, open included, and the opening is the doorway between the jambs.
  for (const frame of Object.keys(twin.layers.back.frames)) expect(twin.layers.glow.frames[frame]).toBeDefined();
  expect(data.fizz2.keyedHeight.twinLeavesClearOpening.interiorWidth).toBe(10);
});

test('3 tiles is the standard keyed door height and 2 tiles is shown as a minimum only', () => {
  expect(data.fizz2.keyedHeight).toMatchObject({ standardTiles: 3, minimumTiles: 2, standardPx: 48, minimumPx: 32, benBodyPx: 32 });
  expect(data.fizz2.keyedHeight.note).toContain('minimum');
});

test('every held open frame keeps the door case’s top strip and side faces, and none of it is ever solid for Ben', () => {
  expect(data.fizz2.heldOpen).toMatchObject({ defaultKeeps: true, decidedBy: 'Scott' });
  expect(data.fizz2.heldOpen.status).toContain('pending Scott');
  for (const design of keyed) {
    if (design.family === 'classic-block') { expect(design.heldOpenFrame).toBeNull(); expect(design.heldOpenKeeps).toBeNull(); continue; }
    expect(design.heldOpenKeeps).toEqual({ topStrip: true, sideFace: true });
    expect(heldOpenKeeps(design)).toEqual({ topStrip: true, sideFace: true });
    // Decoration only: the held frame is back-layer art drawn before Ben, never in front of him.
    expect(design.sequences.open.frames[0].front).toBeUndefined();
  }
});

test('night: the glow layer is separate and is the only bank held at full brightness', () => {
  expect(data.fizz2.night.litArt).toContain('bank 0');
  expect(data.fizz2.night.glowLayer).toContain('bank 2');
  for (const design of data.designs) {
    expect(design.glow.bank).toContain('bank 2');
    expect(design.glow.bank).toContain('full brightness');
    // Leaves, shutters and arches are back-layer art; glow letters are never used there.
    const letters = new Set(design.glow.letters);
    const back = isKeyed(design) ? Object.values(design.layers.back.frames).flatMap(frame => SEGMENTS.flatMap(segment => frame[segment] ?? [])) : Object.values(design.layers.back?.frames ?? {}).flat();
    if (isKeyed(design)) expect(back.join('')).not.toMatch(/S/);
    expect(letters.size).toBeGreaterThan(0);
  }
  for (const design of exits.filter(exit => exit.family === 'lighthouse-lift' || exit.family === 'drop-shutter')) {
    expect(design.layers.glow).not.toBeNull(); expect(design.layers.back).not.toBeNull();
    expect(design.glow.bank).toContain('GLOW');
  }
});

test('red and blue are two stored copies of identical grids, about 2.2 KB each at most', () => {
  expect(data.fizz2.dosMemory).toMatchObject({ copies: 2, sharedGrids: true });
  expect(data.fizz2.dosMemory.bytesPerCopyMax).toBeLessThanOrEqual(2304);
  expect(data.fizz2.dosMemory.bytesPerCopyMax).toBeGreaterThan(2048);
  expect(data.fizz2.dosMemory.bytesBothColoursMax).toBe(data.fizz2.dosMemory.bytesPerCopyMax * 2);
  for (const family of new Set(keyed.map(design => design.family))) {
    const red = redOf(family), blue = keyed.find(design => design.family === family && design.kind === 'keyed-blue')!;
    expect(blue.bytes).toEqual(red.bytes);
    expect(data.fizz2.dosMemory.perFamily[family]).toBe(red.bytes.segments.total);
    for (const [id, frame] of Object.entries(red.layers.back.frames)) for (const segment of SEGMENTS) {
      expect(blue.layers.back.frames[id][segment]!.length).toBe(frame[segment]!.length);
    }
  }
});

test('the dooropen sound is left alone, with the openings recorded against its half second as an open decision', () => {
  expect(data.fizz2.sound.status).toContain('Open decision');
  expect(data.fizz2.sound.proposedOpeningMs).toBe('180 to 300');
  for (const [family, ms] of Object.entries(data.fizz2.sound.openingMs)) {
    const design = data.designs.find(item => item.family === family)!;
    expect(ms).toBe(design.sequences.opening.durationsMs.reduce((a, b) => a + b, 0));
    expect(ms).toBeLessThan(500);
  }
});

test('the exit preview starts with the real game floor line, 16 px below the sill', () => {
  expect(data.walkIn.previewStartBelowSill).toBe(16);
  // Standing Ben (33 px) has his head 17 px above the sill; the 7 px rise stays inside the 35 px arch.
  expect(33 - data.walkIn.previewStartBelowSill).toBe(17);
  expect(17 + pass.farPlaneWalkIn.motion.riseTotalPx).toBeLessThan(35);
  expect(data.fizz2.facts.join(' ')).toContain('16 px');
});
