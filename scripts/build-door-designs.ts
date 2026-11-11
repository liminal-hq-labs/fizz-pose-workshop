// Draws the Fizz 2 door design study and writes it to source/door-designs.json.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
//   bun scripts/build-door-designs.ts           writes source/door-designs.json
//   bun scripts/build-door-designs.ts --check   exits non-zero if the committed file differs
//
// Keyed doors are drawn once from a template whose paint letters `P` (light) and `Q` (dark) become r and R for the
// red door and b and B for the blue one; the badge cells `S` become the white triangle or disc on the glow layer. So
// the red and blue twins share every grid and differ only in colour and badge shape. Nothing here reads or writes the
// workshop's sprite frames.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import palette from '../source/game-palette.json';
import pass from '../source/ben-door-pass.json';
import { exitBytes, keyedBytes, validateDesign, type DoorDesigns, type ExitDesign, type ExitLayer, type Grid, type KeyedDesign, type Segment, type SegmentGrids, type Sequence, type Step } from '../src/doors.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = root + 'source/door-designs.json';
const GENERATED = '2026-11-11';
const T = 16;

// ---------- a tiny canvas ----------

class Canvas {
  readonly cells: string[][];
  constructor(readonly w: number, readonly h: number, fill = '.') { this.cells = Array.from({ length: h }, () => Array.from({ length: w }, () => fill)); }
  put(x: number, y: number, code: string): void { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y][x] = code; }
  get(x: number, y: number): string { return this.cells[y]?.[x] ?? '.'; }
  rows(): string[] { return this.cells.map(row => row.join('')); }
}
const hash = (x: number, y: number, seed: number): number => {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------- keyed doors: 16 by 16 segments ----------

/** Where each segment sits in a 48 px door, so textures read top to bottom; a 32 px door is top then bottom. */
const SEG_Y: Record<Segment, number> = { top: 0, mid: 16, bot: 32 };
const SEGS: readonly Segment[] = ['top', 'mid', 'bot'];
type Cell = (x: number, y: number) => string | null;

/** The stone case every keyed door stands in: lit left jamb, shaded right jamb, a lintel on the top segment and a k foot. */
function caseCell(seg: Segment, x: number, y: number): string | null {
  if (seg === 'top' && y === 0) return 'k';
  if (seg === 'bot' && y === 15) return 'k';
  if (x === 0 || x === 15) return 'k';
  if (x === 1) return (SEG_Y[seg] + y) % 8 === 7 ? 'D' : 'L';
  if (x === 14) return (SEG_Y[seg] + y) % 8 === 3 ? 'k' : 'D';
  if (seg === 'top' && y === 1) return 'L';
  if (seg === 'top' && y === 2) return 'D';
  return null;
}
/** The doorway once the leaf is gone: the case, a shaded inner face on the left jamb and the back wall showing through. */
function openCell(seg: Segment, x: number, y: number): string {
  const edge = caseCell(seg, x, y);
  if (edge) return edge;
  if (x === 2) return 'k';
  if (x === 3) return (y + SEG_Y[seg]) % 2 ? 'D' : 'k';
  if (seg === 'top' && y === 3 && x < 13) return 'k';
  return '.';
}

/** The badge plate: a k plate with a lit D rim and badge cells `S`, 9 by 9 with the badge 7 by 7 inside. */
function plateCell(px: number, py: number): string {
  if (py === 0 || px === 0) return 'D';
  if (px >= 1 && px <= 7 && py >= 1 && py <= 7 && BADGES[activeBadge].wide[py - 1][px - 1]) return 'S';
  return 'k';
}
/** The plate on a leaf turned halfway: 6 wide with the badge drawn 5 by 7, so it is still a triangle or a disc, not a sliver. */
function narrowPlateCell(px: number, py: number): string {
  if (py === 0 || px === 0) return 'D';
  if (px >= 1 && px <= 5 && py >= 1 && py <= 7 && BADGES[activeBadge].narrow[py - 1][px - 1]) return 'S';
  return 'k';
}
const shape = (rows: string[]): boolean[][] => rows.map(row => [...row].map(code => code === 'W'));
const or = (a: boolean[][], b: boolean[][]): boolean[][] => a.map((row, y) => row.map((on, x) => on || b[y][x]));
const TRIANGLE = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => y >= 1 && Math.abs(x - 3) <= Math.floor(y / 2)));
const DISC = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => (x - 3) ** 2 + (y - 3) ** 2 <= 10));
const TRIANGLE_NARROW = shape(['.....', '..W..', '..W..', '.WWW.', '.WWW.', 'WWWWW', 'WWWWW']);
const DISC_NARROW = shape(['.WWW.', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', '.WWW.']);
/** The union of the triangle and the disc, so the red and blue back layers share one plate with the same holes. */
const BADGES = {
  union: { wide: or(TRIANGLE, DISC), narrow: or(TRIANGLE_NARROW, DISC_NARROW) },
  triangle: { wide: TRIANGLE, narrow: TRIANGLE_NARROW },
  disc: { wide: DISC, narrow: DISC_NARROW },
} as const;
/** The badge the plate cuts: the union while the shared back layer is drawn, one colour's shape while its glow is drawn. */
let activeBadge: keyof typeof BADGES = 'union';

/** The planked leaf of most designs, by leaf column 0 to 11 (x 2 to 13): boards, grain, iron straps, the lock and the badge plate. */
function plankLeaf(seg: Segment, lx: number, y: number): string | null {
  const yg = SEG_Y[seg] + y, x = lx + 2;
  if (seg === 'top' && y < 3) return null;
  if (seg === 'bot' && y === 15) return null;
  if (seg === 'top' && y >= 4 && y <= 12 && x >= 3 && x <= 11) return plateCell(x - 3, y - 4);
  if (seg === 'bot' && y >= 2 && y <= 7 && x >= 8 && x <= 12) return LOCK[y - 2][x - 8];
  const strap = seg === 'top' ? 14 : seg === 'mid' ? 7 : 10;
  if (y === strap) return lx === 1 || lx === 10 ? 'L' : 'D';
  if (y === strap + 1) return 'k';
  if (seg === 'bot' && y === 14) return 'Q';
  if (seg === 'top' && y === 3) return lx === 11 ? 'Q' : 'P';
  if (lx === 3 || lx === 8 || lx === 11) return 'Q';
  if (hash(x, yg, 3) < 0.07) return 'Q';
  return 'P';
}
const LOCK = ['.kkk.', 'kWyyk', 'kykyk', 'kykyk', 'kyyNk', '.kkk.'];

interface KeyedFrame { back: Record<Segment, string[]>; glow: Partial<Record<Segment, string[]>> }
/**
 * Builds one keyed frame from a cell function that may return `S` for a badge cell. With `badge` the S cells are
 * transparent on the back layer and white on the glow layer; without it the plate is filled with k.
 */
function keyedFrame(cell: (seg: Segment, x: number, y: number) => string, badge: boolean): KeyedFrame {
  const back = {} as Record<Segment, string[]>, glow: Partial<Record<Segment, string[]>> = {};
  for (const seg of SEGS) {
    const b = new Canvas(T, T), g = new Canvas(T, T);
    let lit = false;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const code = cell(seg, x, y);
      if (code === 'S') { if (badge) { g.put(x, y, 'S'); lit = true; } else b.put(x, y, 'k'); }
      else b.put(x, y, code);
    }
    back[seg] = b.rows();
    if (lit) glow[seg] = g.rows();
  }
  return { back, glow };
}

// Leaf column maps for the moving designs: which leaf column shows at x, or null for the open doorway.
const closedCell = (seg: Segment, x: number, y: number): string => caseCell(seg, x, y) ?? plankLeaf(seg, x - 2, y) ?? openCell(seg, x, y);

/** Plank Swing: the leaf turns away on its left hinge, foreshortened toward the hinge and darker as it turns from the light. */
function swingCell(width: number) {
  return (seg: Segment, x: number, y: number): string => {
    const edge = caseCell(seg, x, y);
    if (edge) return edge;
    const i = x - 2;
    if (i < 0 || i >= width) return openCell(seg, x, y);
    const lx = Math.min(11, Math.floor((i * 12) / width + (width < 12 ? 0.5 : 0)));
    const code = plankLeaf(seg, lx, y) ?? openCell(seg, x, y);
    if (i === width - 1 && width < 12) return code === '.' ? '.' : 'k';
    if (width >= 6 && width < 12 && seg === 'top' && y >= 4 && y <= 12 && i >= 1 && i <= 6) return narrowPlateCell(i - 1, y - 4);
    // Nearly edge-on: one dark board, the straps as black bands and the lock as a brown glint.
    if (width <= 4) {
      if (code === '.') return '.';
      if (code === 'k' || code === 'D' || code === 'S' || code === 'L') return 'k';
      if (code === 'y' || code === 'W' || code === 'N') return 'N';
      return i === 0 ? 'P' : 'Q';
    }
    return code === 'P' && i >= width - 2 ? 'Q' : code;
  };
}
const swingOpenCell = (seg: Segment, x: number, y: number): string => {
  const edge = caseCell(seg, x, y);
  if (edge) return edge;
  const leaf = plankLeaf(seg, 0, y);
  if (leaf !== null && x === 2) return 'Q';
  if (leaf !== null && x === 3) return 'k';
  return openCell(seg, x, y);
};

/** Pocket Slide: the leaf slides right into a slot in the right jamb. */
function slideCell(shift: number) {
  return (seg: Segment, x: number, y: number): string => {
    const edge = caseCell(seg, x, y);
    if (edge) return edge;
    const leafRow = plankLeaf(seg, 0, y) !== null;
    if (x === 13 && leafRow) return shift >= 12 ? 'Q' : 'k';
    const lx = x - 2 - shift;
    if (lx < 0 || lx > 11) return openCell(seg, x, y);
    return plankLeaf(seg, lx, y) ?? openCell(seg, x, y);
  };
}

/** Twin Leaves: a fixed transom with the badge over two leaves that slide apart into the jambs; the lock splits at the seam. */
const TWIN_LOCK = ['.kkkk.', 'kWyyyk', 'kykkyk', 'kykkyk', 'kyyyNk', '.kkkk.'];
function twinLeaf(seg: Segment, side: 'left' | 'right', col: number, y: number): string | null {
  if (seg === 'top' && y < 13) return null;
  if (seg === 'bot' && y === 15) return null;
  const x = side === 'left' ? 2 + col : 8 + col;
  if (seg === 'bot' && y >= 2 && y <= 7 && x >= 5 && x <= 10) { const code = TWIN_LOCK[y - 2][x - 5]; if (code !== '.') return code; }
  if (seg === 'bot' && y === 14) return 'Q';
  if (seg === 'top' && y === 13) return side === 'left' ? 'P' : col === 5 ? 'Q' : 'P';
  const rail = seg === 'mid' ? y === 6 : seg === 'bot' ? y === 11 : false;
  if (side === 'left') { if (col === 5) return 'k'; if (col === 4) return 'Q'; if (col === 0) return 'P'; if (rail) return 'Q'; return col === 1 ? 'P' : (hash(x, SEG_Y[seg] + y, 5) < 0.06 ? 'Q' : 'P'); }
  if (col === 0) return 'P'; if (col === 5) return 'Q'; if (rail) return 'Q'; return hash(x, SEG_Y[seg] + y, 5) < 0.06 ? 'Q' : 'P';
}
function twinTransom(seg: Segment, x: number, y: number): string | null {
  if (seg !== 'top' || y < 2 || y > 12) return null;
  if (y === 11) return 'D';
  if (y === 12) return 'k';
  if (x >= 3 && x <= 11 && y >= 2 && y <= 10) return plateCell(x - 3, y - 2);
  return x === 2 || y === 2 ? 'Q' : 'Q';
}
function twinCell(part: number) {
  return (seg: Segment, x: number, y: number): string => {
    const edge = caseCell(seg, x, y);
    if (edge && !(seg === 'top' && y === 2 && x >= 2 && x <= 13)) return edge;
    const transom = twinTransom(seg, x, y);
    if (transom) return transom;
    if (x >= 2 && x <= 7) { const col = x - 2 + part; if (col <= 5) return twinLeaf(seg, 'left', col, y) ?? openCell(seg, x, y); }
    if (x >= 8 && x <= 13) { const col = x - 8 - part; if (col >= 0) return twinLeaf(seg, 'right', col, y) ?? openCell(seg, x, y); }
    return seg === 'top' && y === 13 && x < 13 ? 'k' : openCell(seg, x, y);
  };
}

/** Lock Pop: the keyhole turns a quarter, the lock flashes, the leaf pops out of the frame as a ring of sparks. */
function lockCell(stage: 'turn1' | 'turn2') {
  return (seg: Segment, x: number, y: number): string => {
    const base = closedCell(seg, x, y);
    if (seg !== 'bot' || y < 3 || y > 6 || x < 9 || x > 11) return base;
    const hole = stage === 'turn1' ? (x === 10 && y === 4) || (x === 11 && y === 5) || (x === 9 && y === 3 && false) : y === 4 && x >= 9 && x <= 11;
    if (stage === 'turn2') return hole ? 'k' : 'W';
    return hole ? 'k' : 'y';
  };
}
const popCell = (seg: Segment, x: number, y: number): string => {
  const edge = caseCell(seg, x, y);
  if (edge) return edge;
  const yg = SEG_Y[seg] + y;
  const inLeaf = plankLeaf(seg, 0, y) !== null;
  if (!inLeaf) return openCell(seg, x, y);
  // The leaf's outline, dashed white, one pixel inside the case, and two yellow sparks.
  if ((x === 3 || x === 12) && yg % 3 !== 2) return 'W';
  if (seg === 'top' && y === 4 && x >= 3 && x <= 12 && x % 3 !== 2) return 'W';
  if (seg === 'bot' && y === 13 && x >= 3 && x <= 12 && x % 3 !== 2) return 'W';
  const spark = (cx: number, cy: number) => (x === cx && Math.abs(y - cy) <= 1) || (y === cy && Math.abs(x - cx) <= 1);
  if (seg === 'top' && spark(7, 9)) return x === 7 && y === 9 ? 'W' : 'y';
  if (seg === 'bot' && spark(9, 6)) return x === 9 && y === 6 ? 'W' : 'y';
  if (seg === 'mid' && spark(6, 8)) return x === 6 && y === 8 ? 'W' : 'y';
  return openCell(seg, x, y);
};

/** Fizz Dissolve: the leaf fizzes away from the floor up in a scatter of bubbles; the badge plate is the last to go. */
function fizzCell(threshold: number) {
  return (seg: Segment, x: number, y: number): string => {
    const edge = caseCell(seg, x, y);
    if (edge) return edge;
    const leaf = plankLeaf(seg, x - 2, y);
    if (leaf === null) return openCell(seg, x, y);
    const yg = SEG_Y[seg] + y;
    const onPlate = seg === 'top' && y >= 4 && y <= 12 && x >= 3 && x <= 11;
    const t = onPlate ? 0.95 : 0.55 * hash(x, yg, 11) + 0.45 * (1 - yg / 47);
    if (t < threshold) return hash(x, yg, 17) < 0.12 && t > threshold - 0.18 ? 'W' : openCell(seg, x, y);
    if (t < threshold + 0.09 && !onPlate) return hash(x, yg, 23) < 0.3 ? 'W' : 'Q';
    return leaf;
  };
}

/** Signpost Arch: a stone arch with the badge on a sign hung from it, iron bars in the door's colour while it is shut. */
function archEdge(seg: Segment, x: number, y: number): string | null {
  const edge = caseCell(seg, x, y);
  if (edge) return edge;
  if (seg !== 'top' || y < 2 || y > 5) return null;
  // A round head springing from the jambs: the opening is 4, 8, 10 then 12 px wide over rows 3 to 6.
  const open = (row: number, col: number) => row >= 6 || (row === 3 && col >= 6 && col <= 9) || (row === 4 && col >= 4 && col <= 11) || (row === 5 && col >= 3 && col <= 12);
  if (open(y, x)) return null;
  if (open(y + 1, x) || open(y, x - 1) || open(y, x + 1)) return 'k';
  return x <= 7 ? 'L' : 'D';
}
function signCell(seg: Segment, x: number, y: number): string | null {
  if (seg !== 'top') return null;
  if ((x === 5 || x === 9) && y === 4) return 'D';
  if (y >= 5 && y <= 13 && x >= 3 && x <= 11) return plateCell(x - 3, y - 5);
  return null;
}
function archCell(bars: boolean) {
  return (seg: Segment, x: number, y: number): string => {
    const edge = archEdge(seg, x, y);
    if (edge) return edge;
    const sign = signCell(seg, x, y);
    if (sign) return sign;
    if (bars && !(seg === 'bot' && y === 15)) {
      const cross = (seg === 'mid' && (y === 8 || y === 9)) || (seg === 'bot' && (y === 8 || y === 9)) || (seg === 'top' && (y === 14 || y === 15));
      if (cross && x >= 2 && x <= 13) return (seg === 'top' ? y === 14 : y === 8) ? 'P' : 'Q';
      if (x === 4 || x === 8 || x === 12) return 'P';
      if (x === 5 || x === 9 || x === 13) return 'Q';
    }
    return seg === 'top' && y < 6 ? '.' : openCell(seg, x, y);
  };
}

/** Classic Block: Fizz 1's door tile grown up: a painted frame round brown boards with diagonal grain, gone once open. */
const classicCell = (seg: Segment, x: number, y: number): string => {
  const yg = SEG_Y[seg] + y;
  if (seg === 'top' && y === 0) return 'k';
  if (seg === 'bot' && y === 15) return 'k';
  if (x === 0 || x === 15) return 'k';
  if (x === 1) return 'P';
  if (x === 14) return 'Q';
  if (seg === 'top' && y === 1) return 'P';
  if (seg === 'bot' && y === 14) return 'Q';
  if (seg === 'top' && y >= 4 && y <= 12 && x >= 3 && x <= 11) return plateCell(x - 3, y - 4);
  if (seg === 'bot' && y >= 2 && y <= 7 && x >= 8 && x <= 12) return LOCK[y - 2][x - 8] === '.' ? 'N' : LOCK[y - 2][x - 8];
  if (x === 2) return 'k';
  return ((x - yg) % 8 + 8) % 8 === 0 ? 'k' : 'N';
};

// ---------- keyed design assembly ----------

interface KeyedPlan {
  family: string; name: string; idea: string; why: string; behaviour: KeyedDesign['behaviour']; notes: string[];
  frames: Record<string, { cell: (seg: Segment, x: number, y: number) => string; badge: boolean }>;
  closed: string; opening: { frame: string; ms: number }[]; held: string | null;
}
const COLOURS = { red: { P: 'r', Q: 'R', badge: 'triangle' }, blue: { P: 'b', Q: 'B', badge: 'disc' } } as const;
const paint = (grid: readonly string[], colour: 'red' | 'blue'): string[] => grid.map(row => row.replace(/P/g, COLOURS[colour].P).replace(/Q/g, COLOURS[colour].Q));
/** The glow grid for a colour: the cells that fall on that colour's badge shape, wherever the frame put the badge. */
function badgeGlow(cell: (seg: Segment, x: number, y: number) => string, seg: Segment, colour: 'red' | 'blue'): string[] {
  const out = new Canvas(T, T);
  activeBadge = COLOURS[colour].badge;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (cell(seg, x, y) === 'S') out.put(x, y, 'W');
  activeBadge = 'union';
  return out.rows();
}
/** The back layer for a colour: the union holes stay open only where this colour's badge is, the rest of the plate is k. */
function backFor(frame: KeyedFrame, glow: Partial<Record<Segment, string[]>>, colour: 'red' | 'blue'): Record<Segment, string[]> {
  const out = {} as Record<Segment, string[]>;
  for (const seg of SEGS) out[seg] = paint(frame.back[seg], colour).map((row, y) => [...row].map((code, x) => code === '.' && frame.glow[seg]?.[y][x] === 'S' && glow[seg]?.[y][x] !== 'W' ? 'k' : code).join(''));
  return out;
}

const KEYED_GLOW = { bank: 'GLOW: bank 2, level 14, left at full brightness by the night pass (`light.rs`)', letters: ['W'], draw: 'Drawn straight after the back layer at the same position, before Ben.' } as const;
const step = (back: string | null, glow: string | null): Step => ({ back, glow });

function keyedDesigns(plan: KeyedPlan): KeyedDesign[] {
  return (['red', 'blue'] as const).map(colour => {
    const back: Record<string, SegmentGrids> = {}, glow: Record<string, SegmentGrids> = {};
    for (const [id, spec] of Object.entries(plan.frames)) {
      const frame = keyedFrame(spec.cell, spec.badge);
      const glowGrids: Partial<Record<Segment, string[]>> = {};
      for (const seg of SEGS) if (frame.glow[seg]) glowGrids[seg] = badgeGlow(spec.cell, seg, colour);
      back[id] = backFor(frame, glowGrids, colour);
      if (Object.keys(glowGrids).length) glow[id] = glowGrids;
    }
    const glowId = (id: string): string | null => glow[id] ? id : null;
    const sequences: Record<string, Sequence> = {
      closed: { loop: true, note: 'Shut and locked: drawn in the ground pass with the terrain, before Ben.', frames: [step(plan.closed, glowId(plan.closed))], durationsMs: [1000] },
      opening: { loop: false, note: 'Plays once after the `dooropen` event. Presentation only: the door is already passable and Ben is drawn over it.', frames: plan.opening.map(entry => step(entry.frame, glowId(entry.frame))), durationsMs: plan.opening.map(entry => entry.ms) },
      open: plan.held
        ? { loop: true, note: 'The held open frame: the doorway stays drawn for the rest of the room.', frames: [step(plan.held, glowId(plan.held))], durationsMs: [1000] }
        : { loop: true, note: 'Nothing is drawn once open, as in Fizz 1.', frames: [step(null, null)], durationsMs: [1000] },
      emptyEnding: { loop: true, note: 'The optional ending: after the opening frames the door is not drawn at all, as in Fizz 1.', frames: [step(null, null)], durationsMs: [1000] },
    };
    const layers = { back: { frames: back }, glow: { frames: glow } };
    return {
      id: `${plan.family}-${colour}`, family: plan.family, kind: colour === 'red' ? 'keyed-red' : 'keyed-blue', name: plan.name, idea: plan.idea, why: plan.why, behaviour: plan.behaviour, notes: plan.notes,
      segment: { w: T, h: T }, badge: COLOURS[colour].badge, badgeSegment: 'top', heldOpenFrame: plan.held,
      placement: { anchor: 'floor-line column', note: 'A column of terrain tiles standing on the floor line, drawn in the ground pass with the terrain, before Ben.' },
      glow: KEYED_GLOW, sequences, layers, bytes: keyedBytes(layers),
    };
  });
}

const KEYED: KeyedPlan[] = [
  {
    family: 'plank-swing', name: 'Plank Swing', behaviour: 'animated-open',
    idea: 'A painted plank door in a stone case that swings away from you on its left hinge, foreshortening to its edge.',
    why: 'The classic door: everyone reads a swing, the leaf narrows instead of moving, so it stays inside its 16 px column at any height.',
    notes: ['The badge squeezes with the leaf and is still a triangle or a disc at 8 px wide; at 4 px it is hidden and the plate goes dark.', 'The held open frame keeps the leaf edge against the left jamb, so the room remembers a door was here.'],
    frames: { closed: { cell: closedCell, badge: true }, swing8: { cell: swingCell(8), badge: true }, swing4: { cell: swingCell(4), badge: false }, open: { cell: swingOpenCell, badge: false } },
    closed: 'closed', opening: [{ frame: 'swing8', ms: 90 }, { frame: 'swing4', ms: 90 }], held: 'open',
  },
  {
    family: 'pocket-slide', name: 'Pocket Slide', behaviour: 'animated-open',
    idea: 'The leaf slides sideways into a slot in the right jamb, like a ship\'s pocket door.',
    why: 'Pure sideways motion is the easiest opening to read at 16 px and needs no foreshortening; the slot says where it went.',
    notes: ['The badge rides with the leaf for the first step and is hidden once the jamb would cut it.', 'The held open frame leaves the leaf\'s edge showing in the slot.'],
    frames: { closed: { cell: closedCell, badge: true }, slide2: { cell: slideCell(2), badge: true }, slide6: { cell: slideCell(6), badge: false }, slide10: { cell: slideCell(10), badge: false }, open: { cell: slideCell(12), badge: false } },
    closed: 'closed', opening: [{ frame: 'slide2', ms: 70 }, { frame: 'slide6', ms: 70 }, { frame: 'slide10', ms: 80 }], held: 'open',
  },
  {
    family: 'twin-leaves', name: 'Twin Leaves', behaviour: 'animated-open',
    idea: 'Two half leaves part from the middle under a fixed transom that carries the badge; the lock splits at the seam.',
    why: 'The badge never moves, so the open doorway still says which key opened it; the split lock is a clear unlocked cue.',
    notes: ['The transom takes the top 13 rows of the top segment, so a two-tile door has a 19 px opening under it; three tiles give 35 px, taller than Ben.', 'The badge is visible in every frame, open included.'],
    frames: { closed: { cell: twinCell(0), badge: true }, part2: { cell: twinCell(2), badge: true }, part4: { cell: twinCell(4), badge: true }, open: { cell: twinCell(6), badge: true } },
    closed: 'closed', opening: [{ frame: 'part2', ms: 80 }, { frame: 'part4', ms: 80 }], held: 'open',
  },
  {
    family: 'lock-pop', name: 'Lock Pop', behaviour: 'animated-open',
    idea: 'The key turns the lock a quarter, the lock flashes white, then the whole leaf pops out of the frame in a ring of sparks.',
    why: 'It puts the key\'s job on screen: the lock is what changes first, so the player sees cause and effect before the door goes.',
    notes: ['Only the bottom segment changes during the turn, so those frames cost one new 16 by 16 grid each.', 'The badge is visible until the pop.'],
    frames: { closed: { cell: closedCell, badge: true }, turn1: { cell: lockCell('turn1'), badge: true }, turn2: { cell: lockCell('turn2'), badge: true }, pop: { cell: popCell, badge: false }, open: { cell: openCell, badge: false } },
    closed: 'closed', opening: [{ frame: 'turn1', ms: 90 }, { frame: 'turn2', ms: 120 }, { frame: 'pop', ms: 90 }], held: 'open',
  },
  {
    family: 'fizz-dissolve', name: 'Fizz Dissolve', behaviour: 'animated-open',
    idea: 'The leaf fizzes away from the floor up like a shaken soda, white bubbles at the edge, the badge plate the last thing left.',
    why: 'It is the Fizz joke made into a door: on-brand, unlike any real door, and the bubbles hide the cost of the in-between frames.',
    notes: ['The plate holds until the last moment, so the badge is readable in every frame but the open one.', 'The dissolve is worked out per segment from the floor up, so it stacks to any height.'],
    frames: { closed: { cell: closedCell, badge: true }, fizz1: { cell: fizzCell(0.3), badge: true }, fizz2: { cell: fizzCell(0.55), badge: true }, fizz3: { cell: fizzCell(0.8), badge: true }, open: { cell: openCell, badge: false } },
    closed: 'closed', opening: [{ frame: 'fizz1', ms: 80 }, { frame: 'fizz2', ms: 80 }, { frame: 'fizz3', ms: 100 }], held: 'open',
  },
  {
    family: 'signpost-arch', name: 'Signpost Arch', behaviour: 'always-open',
    idea: 'An open stone arch with the badge on a sign hung from its head; while locked, iron bars in the door\'s colour fill it.',
    why: 'The doorway itself never animates: one frame for the bars, one for the open arch, and the hanging sign keeps the badge in the room.',
    notes: ['No opening frames: the bars are gone on the `dooropen` tick, which the sound covers.', 'The sign hangs in the doorway; Ben is drawn over it as he walks through.'],
    frames: { closed: { cell: archCell(true), badge: true }, open: { cell: archCell(false), badge: true } },
    closed: 'closed', opening: [], held: 'open',
  },
  {
    family: 'classic-block', name: 'Classic Block', behaviour: 'always-open',
    idea: 'Fizz 1\'s door tile grown into segments: a painted frame round brown grained boards, badge and lock; it simply vanishes.',
    why: 'The cheapest and most faithful option: one frame, no open art, and it plays exactly as Fizz 1 did.',
    notes: ['There is no held open frame; the empty ending is the only ending.', 'The diagonal grain repeats every 4 rows, so stacked segments meet without a seam.'],
    frames: { closed: { cell: classicCell, badge: true } },
    closed: 'closed', opening: [], held: null,
  },
];

// ---------- exits: 20 by 35 on the far plane ----------

const EW = 20, EH = 35;
/** The lip: the bottom 6 rows above the sill, across the full width, drawn after Ben during the walk-in. */
const LIP_ROWS = 6;
const BACK_BOX = { x: 0, y: 0, w: EW, h: EH - LIP_ROWS };
const LIP_BOX = { x: 0, y: EH - LIP_ROWS, w: EW, h: LIP_ROWS };
const GLOW_BOX = { x: 3, y: 3, w: 14, h: 32 };
const inOpening = (x: number, y: number): boolean => x >= 3 && x <= 16 && y <= EH - 1 && (y >= 10 ? true : (x - 9.5) ** 2 + (y - 10) ** 2 <= 49);
const inOuter = (x: number, y: number): boolean => x >= 0 && x < EW && y >= 0 && y < EH && (y >= 10 || (x - 9.5) ** 2 + (y - 10) ** 2 <= 100);
/** The stone arch: an outlined ring of voussoirs, a lit left jamb and a shaded right jamb, mortar between the courses. */
function stoneCell(x: number, y: number): string {
  if (!inOuter(x, y) || inOpening(x, y)) return '.';
  const out = (dx: number, dy: number) => !inOuter(x + dx, y + dy);
  if (out(-1, 0) || out(1, 0) || out(0, -1)) return 'k';
  const touchesOpening = inOpening(x - 1, y) || inOpening(x + 1, y) || inOpening(x, y + 1) || inOpening(x, y - 1);
  if (y < 10) {
    const angle = Math.atan2(y - 10, x - 9.5) * 180 / Math.PI + 180; // 0 left, 90 top, 180 right
    const block = Math.floor((angle + 18) / 36);
    const edge = Math.abs(((angle + 18) % 36) - 0) < 5;
    if (edge && !touchesOpening) return 'k';
    if (block === 2) return touchesOpening ? 'D' : 'W'; // keystone
    if (touchesOpening) return 'k';
    return angle < 100 ? 'L' : 'D';
  }
  if (touchesOpening) return 'k';
  const left = x < 10;
  const mortar = left ? (y - 10) % 6 === 5 : (y - 10) % 6 === 2;
  if (mortar) return 'k';
  return left ? 'L' : 'D';
}
/** The lip: a stone threshold step with a white lit nosing, in front of the jambs and the bottom of the opening. */
function lipCell(x: number, y: number): string {
  const row = y - (EH - LIP_ROWS);
  if (x === 0 || x === EW - 1 || row === LIP_ROWS - 1) return 'k';
  if (row === 0) return 'W';
  if (row === 1) return 'L';
  const joint = row === 2 || row === 3 ? [6, 13] : [3, 10, 16];
  if (joint.includes(x)) return 'k';
  return x < 10 ? 'L' : 'D';
}
const ARROW = ['..WW..', '.WWWW.', 'WWWWWW', '..WW..', '..WW..', '..WW..'];
const ARROW_AT = { x: 7, y: 6 };
const isArrow = (x: number, y: number): boolean => ARROW[y - ARROW_AT.y]?.[x - ARROW_AT.x] === 'W';
/** The lit opening: light green, a dithered darker floor and a white up arrow; transparent outside the arch. */
function lightCell(x: number, y: number): string {
  if (!inOpening(x, y)) return '.';
  if (isArrow(x, y)) return 'W';
  if (y >= EH - 9) return (x + y) % 2 ? 'g' : 'G';
  if (x === 16 && y > 12) return 'G';
  return 'g';
}
function exitGrid(cell: (x: number, y: number) => string, box: { x: number; y: number; w: number; h: number }): string[] {
  const c = new Canvas(box.w, box.h);
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) c.put(x, y, cell(x + box.x, y + box.y));
  return c.rows();
}
/** A back frame drawn from a cell function over the whole piece, cut to the back box (the lip covers the rest). */
const backGrid = (cell: (x: number, y: number) => string) => exitGrid(cell, BACK_BOX);
const lip = exitGrid(lipCell, LIP_BOX);
const light = exitGrid(lightCell, GLOW_BOX);
/** The light that shows through a back frame: only where the back layer leaves the opening empty, so glow never covers a leaf. */
const lightThrough = (back: readonly string[]) => exitGrid((x, y) => inOpening(x, y) && (back[y]?.[x] ?? '.') === '.' ? lightCell(x, y) : '.', GLOW_BOX);
/** An ordered 4 by 4 dither of the light, for the veil that floods over Ben. */
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const veil = (level: number) => exitGrid((x, y) => inOpening(x, y) && BAYER[y % 4][x % 4] < level ? (isArrow(x, y) ? 'W' : 'g') : '.', GLOW_BOX);

/** Lighthouse Lift: a transom with the arrow lamp over two steel leaves that slide into the jambs. */
function liftCell(part: number) {
  return (x: number, y: number): string => {
    const stone = stoneCell(x, y);
    if (stone !== '.') return stone;
    if (!inOpening(x, y)) return '.';
    if (y <= 12) {
      if (isArrow(x, y)) return '.';
      if (y === 12) return 'k';
      if (y === 11) return 'D';
      return isArrow(x - 1, y) || isArrow(x, y - 1) ? 'D' : 'k';
    }
    const leftCol = x - 3 + part, rightCol = x - 10 - part;
    const leaf = (col: number, side: 'left' | 'right'): string => {
      if (side === 'left' && col === 6) return 'D';
      if (side === 'right' && col === 0) return 'k';
      if (y === 13) return 'W';
      if (y === 20 || y === 27) return 'D';
      if (side === 'left' && col === 0) return 'W';
      if (side === 'right' && col === 6) return 'D';
      if (y === 23 && ((side === 'left' && col === 5) || (side === 'right' && col === 1))) return 'k';
      return 'L';
    };
    if (x <= 9 && leftCol <= 6) return leaf(leftCol, 'left');
    if (x >= 10 && rightCol >= 0) return leaf(rightCol, 'right');
    return '.';
  };
}
/** Drop Shutter: an iron shutter of slats that drops from the arch head to the lip. */
function shutterCell(bottom: number) {
  return (x: number, y: number): string => {
    const stone = stoneCell(x, y);
    if (stone !== '.') return stone;
    if (!inOpening(x, y) || y > bottom) return '.';
    if (y === bottom) return 'k';
    if (y === bottom - 1) return x === 3 ? 'L' : 'W';
    const band = (bottom - y) % 3;
    if (x === 16) return band === 2 ? 'k' : 'D';
    return band === 2 ? 'k' : band === 1 ? 'D' : 'L';
  };
}
/** Lighthouse Door: a brown plank door hung on the left jamb with a lit window over the arrow; it swings in and back. */
function doorLeaf(col: number, y: number, width: number): string {
  const lx = Math.min(13, Math.floor(col * 14 / width));
  const window = y >= 5 && y <= 12 && lx >= 3 && lx <= 10 && ((lx - 6.5) ** 2 + (y - 9) ** 2 <= 14 || y >= 9);
  if (window && width >= 14) return '.';
  if (window) return 'k';
  if (col === width - 1 && width < 14) return 'k';
  if (y === 15 || y === 26) return lx === 1 || lx === 12 ? 'L' : 'D';
  if (y === 16 || y === 27) return 'k';
  if (lx === 11 && y >= 19 && y <= 21 && width >= 14) return y === 20 ? 'k' : 'y';
  if (lx === 4 || lx === 9) return 'k';
  if (lx === 13) return 'k';
  // Turned in, away from the light: the boards darken and the grain closes up.
  if (width < 14) return lx === 0 || lx === 1 ? 'N' : (lx + y) % 3 === 0 ? 'k' : 'N';
  return lx === 0 ? 'y' : hash(lx, y, 31) < 0.08 ? 'k' : 'N';
}
function doorCell(width: number) {
  return (x: number, y: number): string => {
    const stone = stoneCell(x, y);
    if (stone !== '.') return stone;
    if (!inOpening(x, y)) return '.';
    const col = x - 3;
    if (col < width) return doorLeaf(col, y, width);
    return '.';
  };
}

const EXIT_GLOW = { bank: 'GLOW: bank 2, level 14, left at full brightness by the night pass (`light.rs`)', letters: ['g', 'G', 'W'], draw: 'Glow draws after the back layer and before Ben; a step\'s `glowOver` draws again after Ben, before the front lip.' } as const;

// The walk-in is the lab's `door-walk-in` (`ben_doorIn1` to `ben_doorIn8`) placed by `source/ben-door-pass.json`: the
// sprite's left edge 2 px left of the exit, rising one pixel a frame, its bottom rows hidden by the lip and then cropped.
const WALK_IN = pass.farPlaneWalkIn;
/**
 * The preview's floor line below the sill; the game defines its own. At 10 Ben's crown stays inside the arch's opening for
 * all 7 px of the rise; any less and it ends above the 35 px arch.
 */
const PREVIEW_START_BELOW_SILL = 10;
const walkIn = (back: string, glow: string | null, over: (index: number) => string | null = () => null): Step[] => WALK_IN.perFrame.map((frame, index) => ({
  back, front: 'lip', glow, ...(over(index) ? { glowOver: over(index) } : {}),
  ben: { frame: frame.name, left: WALK_IN.placement.spriteLeft, rise: -frame.offsetFromStart.y, visibleRows: frame.visibleRows, behind: true },
}));
const WALK_MS = WALK_IN.perFrame.map(frame => frame.durationMs);
const last = WALK_IN.perFrame[WALK_IN.perFrame.length - 1];
const gone = { frame: last.name, left: WALK_IN.placement.spriteLeft, rise: -last.offsetFromStart.y, visibleRows: 0, behind: true, hidden: true };

interface ExitPlan { family: string; name: string; idea: string; why: string; behaviour: ExitDesign['behaviour']; notes: string[]; back: Record<string, string[]>; glow: Record<string, string[]>; sequences: Record<string, Sequence> }
function exitDesign(plan: ExitPlan): ExitDesign {
  const layers = {
    back: { ...BACK_BOX, frames: plan.back } satisfies ExitLayer,
    front: { ...LIP_BOX, frames: { lip } } satisfies ExitLayer,
    glow: { ...GLOW_BOX, frames: plan.glow } satisfies ExitLayer,
  };
  return {
    id: plan.family, family: plan.family, kind: 'exit', name: plan.name, idea: plan.idea, why: plan.why, behaviour: plan.behaviour, notes: plan.notes,
    size: { w: EW, h: EH },
    placement: { anchor: 'far-plane sill', x: 4, y: -35, note: 'The piece\'s top-left corner, relative to the exit cell\'s left edge and the top of the lower exit cell. Its bottom edge is the sill, on the far edge of the floor, higher on screen than the floor line Ben stands on in front of it.' },
    glow: EXIT_GLOW, sequences: plan.sequences, layers, bytes: exitBytes(layers),
  };
}
const seq = (note: string, frames: Step[], durationsMs: number[], loop = false): Sequence => ({ loop, note, frames, durationsMs });
const exitStep = (back: string, glow: string | null, extra: Partial<Step> = {}): Step => ({ back, front: 'lip', glow, ...extra });

const arch = backGrid(stoneCell);
const lift = { shut: backGrid(liftCell(0)), half: backGrid(liftCell(4)), open: backGrid(liftCell(7)) };
const shutter = { open: arch, drop1: backGrid(shutterCell(13)), drop2: backGrid(shutterCell(21)), shut: backGrid(shutterCell(EH - LIP_ROWS)) };
const door = { shut: backGrid(doorCell(14)), ajar: backGrid(doorCell(7)), open: backGrid(doorCell(2)) };
const glowFor = (frames: Record<string, string[]>) => Object.fromEntries(Object.entries(frames).map(([id, grid]) => [id, lightThrough(grid)]));

const EXITS: ExitPlan[] = [
  {
    family: 'green-arch', name: 'Into the Light', behaviour: 'always-open',
    idea: 'An open stone arch full of green light; as Ben steps in, the light floods over him and fades back to an empty doorway.',
    why: 'One doorway frame, and the walk-in is told by the light: two dither frames that glow at night with the rest of the exit, softening the crop.',
    notes: ['The veil is the glow layer drawn a second time after Ben (`glowOver`), at 6/16 and 12/16 coverage, then the full light, over the last three walk-in frames.'],
    back: { arch }, glow: { light, veil6: veil(6), veil12: veil(12) },
    sequences: {
      idle: seq('Waiting: back, glow and lip in the ground pass, before Ben.', [exitStep('arch', 'light')], [1000], true),
      enter: seq('After the exit event: the walk-in, the light flooding over Ben, then fading with him gone.', [
        ...walkIn('arch', 'light', index => index === 5 ? 'veil6' : index === 6 ? 'veil12' : index === 7 ? 'light' : null),
        exitStep('arch', 'light', { glowOver: 'veil12', ben: gone }), exitStep('arch', 'light', { glowOver: 'veil6', ben: gone }), exitStep('arch', 'light', { ben: gone }),
      ], [...WALK_MS, 90, 90, 600]),
    },
  },
  {
    family: 'stone-arch', name: 'Over the Lip', behaviour: 'always-open',
    idea: 'The plain open arch: Ben walks in over the threshold lip and is gone.',
    why: 'The cheapest exit that still shows Ben going in: the walk-in frames and the lip do all the work.',
    notes: ['The `ta-da!` sound carries the moment; nothing in the doorway moves.'],
    back: { arch }, glow: { light },
    sequences: {
      idle: seq('Waiting: back, glow and lip in the ground pass, before Ben.', [exitStep('arch', 'light')], [1000], true),
      enter: seq('The walk-in, then Ben is not drawn.', [...walkIn('arch', 'light'), exitStep('arch', 'light', { ben: gone })], [...WALK_MS, 600]),
    },
  },
  {
    family: 'lighthouse-lift', name: 'Lighthouse Lift', behaviour: 'animated-open',
    idea: 'A lift in the arch: the up arrow lights the transom, the steel leaves part when Ben presses Up and close once he is in.',
    why: 'Press Up to go up: a lift explains the control by itself, and the closing leaves end the level with a clear beat.',
    notes: ['The leaves are on the back layer; the glow frame for each leaf frame is the light only where the leaves leave the cab open.', 'The transom is lower than the arch head; Ben\'s crown stays in front of it, since he never passes under it.'],
    back: lift, glow: glowFor(lift),
    sequences: {
      idle: seq('Shut, arrow lit: in the ground pass, before Ben.', [exitStep('shut', 'shut')], [1000], true),
      opening: seq('On the Up press, before the walk-in, with Ben frozen in front.', [exitStep('half', 'half'), exitStep('open', 'open')], [90, 110]),
      enter: seq('The walk-in, then the leaves close.', [...walkIn('open', 'open'), exitStep('half', 'half', { ben: gone }), exitStep('shut', 'shut', { ben: gone })], [...WALK_MS, 90, 600]),
    },
  },
  {
    family: 'drop-shutter', name: 'Drop Shutter', behaviour: 'always-open',
    idea: 'An open arch with an iron shutter hidden in its head; once Ben is in, it drops in three steps to the lip.',
    why: 'The slam is a natural end-of-level beat, and the shut exit reads as spent if the camera lingers.',
    notes: ['The arch is always open while Ben plays; the shutter frames only follow the walk-in.', 'The shut shutter covers the arrow, so the shut frame has no glow.'],
    back: shutter, glow: { open: lightThrough(shutter.open), drop1: lightThrough(shutter.drop1), drop2: lightThrough(shutter.drop2) },
    sequences: {
      idle: seq('Open: in the ground pass, before Ben.', [exitStep('open', 'open')], [1000], true),
      enter: seq('The walk-in, then the shutter drops.', [...walkIn('open', 'open'), exitStep('drop1', 'drop1', { ben: gone }), exitStep('drop2', 'drop2', { ben: gone }), exitStep('shut', null, { ben: gone })], [...WALK_MS, 70, 70, 600]),
    },
  },
  {
    family: 'lighthouse-door', name: 'Lighthouse Door', behaviour: 'animated-open',
    idea: 'A brown plank door in the arch with a round window over the arrow; it swings in on its left hinge and swings shut behind Ben.',
    why: 'Matches the keyed doors\' plank language, so exits and doors read as one family; the lit window keeps the arrow visible while shut.',
    notes: ['The leaf is on the back layer and the same three frames open and close; the glow follows the leaf, lighting only the window when shut.'],
    back: door, glow: glowFor(door),
    sequences: {
      idle: seq('Shut, window lit: in the ground pass, before Ben.', [exitStep('shut', 'shut')], [1000], true),
      opening: seq('On the Up press: the door swings in before the walk-in.', [exitStep('ajar', 'ajar'), exitStep('open', 'open')], [100, 110]),
      enter: seq('The walk-in, then the door swings shut.', [...walkIn('open', 'open'), exitStep('ajar', 'ajar', { ben: gone }), exitStep('shut', 'shut', { ben: gone })], [...WALK_MS, 100, 600]),
    },
  },
];

// ---------- output ----------

const designs = [...KEYED.flatMap(keyedDesigns), ...EXITS.map(exitDesign)];
const data: DoorDesigns = {
  generated: GENERATED,
  palette: 'source/game-palette.json',
  paletteLetters: Object.keys(palette),
  tile: T,
  ben: { bodyHeight: 33, spriteWidth: 24, note: 'In game Ben is 33 px tall on a 0.8 by 2.0 tile body; the workshop frames pad him to 24 by 44.' },
  walkIn: {
    contract: 'source/ben-door-pass.json',
    animation: WALK_IN.animation,
    spriteLeft: WALK_IN.placement.spriteLeft,
    spriteRule: WALK_IN.placement.rule,
    startBelowSill: 'game-defined: the floor line in front of the exit less the sill baseline',
    previewStartBelowSill: PREVIEW_START_BELOW_SILL,
  },
  sidePass: { animation: 'walk-run-6', note: 'Keyed doors are drawn before Ben, so Ben is in front of the whole door; he overlaps it only once it is open and passable.' },
  drawOrder: [
    'Ground pass: back wall or sky, far-plane dressing, the exit (back, glow, then the front lip), terrain from the bottom row up with the keyed doors (back, then glow), spikes',
    'Keys and snacks', 'Chicken', 'Shots', 'Puffs',
    'Ben',
    'New exit pass, only during the walk-in: the step\'s glowOver, then the exit\'s front lip again over Ben',
    'At night, the light pass (the glow bank stays at full brightness)',
    'Captions',
  ],
  designs,
};
const problems = designs.flatMap(design => validateDesign(design, palette));
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
const text = JSON.stringify(data, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const current = await readFile(OUT, 'utf8').catch(() => '');
  if (current !== text) { console.error('source/door-designs.json is out of date: run bun scripts/build-door-designs.ts'); process.exit(1); }
} else {
  await writeFile(OUT, text);
  console.log(`Wrote ${designs.length} door designs to source/door-designs.json`);
}

