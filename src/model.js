// Validates frame edits and records reversible pixel strokes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export function validateFrames(frames, reference, palette) {
  if (!frames || typeof frames !== 'object' || Array.isArray(frames)) throw new Error('Choose a frame JSON export.');
  const entries = Object.entries(frames);
  if (!entries.length) throw new Error('The file has no frames.');
  for (const [name, frame] of entries) {
    const expected = Object.hasOwn(reference, name) && reference[name];
    if (!expected || !frame || frame.width !== expected.width || frame.height !== expected.height || !Array.isArray(frame.grid) || frame.grid.length !== expected.height || frame.grid.some(row => typeof row !== 'string' || row.length !== expected.width || [...row].some(code => !Object.hasOwn(palette, code)))) {
      throw new Error(`Invalid pixels or dimensions in ${name}.`);
    }
  }
  return structuredClone(frames);
}

export function setPixel(frame, x, y, code) {
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height || frame.grid[y][x] === code) return false;
  frame.grid[y] = frame.grid[y].slice(0, x) + code + frame.grid[y].slice(x + 1);
  return true;
}

export function createHistory() {
  const undo = [], redo = [];
  return {
    record(before, after) {
      if (JSON.stringify(before) === JSON.stringify(after)) return false;
      undo.push({ before: structuredClone(before), after: structuredClone(after) });
      if (undo.length > 100) undo.shift();
      redo.length = 0;
      return true;
    },
    undo() { const item = undo.pop(); if (!item) return null; redo.push(item); return structuredClone(item.before); },
    redo() { const item = redo.pop(); if (!item) return null; undo.push(item); return structuredClone(item.after); },
    get canUndo() { return undo.length > 0; },
    get canRedo() { return redo.length > 0; },
  };
}
