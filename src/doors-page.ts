// Builds the Fizz 2 door design gallery: keyed doors and exits side by side with animated, layered previews.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import doorData from '../source/door-designs.json';
import palette from '../source/game-palette.json';
import workshop from '../assets.json';
import './style.css';
import './doors.css';
import { composeKeyed, isKeyed, SEGMENTS, stackFor, TILE, type Design, type DoorDesigns, type ExitDesign, type ExitLayer, type Grid, type KeyedDesign, type LayerBytes, type Step } from './doors.ts';
import { frameIndexAt } from './sprite-checklist.ts';
import type { WorkshopData } from './types.ts';

const data = doorData as unknown as DoorDesigns;
const lab = workshop as WorkshopData;
const rgb: Record<string, readonly [number, number, number] | null> = Object.fromEntries(Object.entries(palette as Record<string, string | null>).map(([code, hex]) => [code, hex ? [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)) as unknown as [number, number, number] : null]));

type Child = Node | string | null | undefined | false;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  for (const child of children) if (child) node.append(child);
  return node;
}
const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const bytes = (value: number): string => `${value.toLocaleString('en-CA')} B`;

// ---------- settings ----------

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const settings = {
  paused: reducedMotion,
  scale: innerWidth < 600 ? 2 : innerWidth < 1500 ? 3 : 4,
  layers: 'all' as 'all' | 'back' | 'front' | 'glow',
  background: 'wall' as 'wall' | 'sky' | 'none',
  ben: true,
  night: false,
  height: 3,
  ending: 'held' as 'held' | 'empty',
  startBelowSill: data.walkIn.previewStartBelowSill,
};

// ---------- Ben ----------

/** A workshop frame with the bottom of its lowest opaque row and the middle of its opaque columns. */
interface Sprite { grid: Grid; foot: number; centre: number }
function sprite(name: string): Sprite | null {
  const frame = lab.frames[name];
  if (!frame) return null;
  const rows = frame.grid.flatMap((row, y) => /[^.]/.test(row) ? [y] : []);
  const columns = frame.grid.flatMap(row => [...row].flatMap((code, x) => code === '.' ? [] : [x]));
  return { grid: frame.grid, foot: Math.max(...rows) + 1, centre: Math.round((Math.min(...columns) + Math.max(...columns) + 1) / 2) };
}
const benSide = sprite('ben_standRight'), benBack = sprite('ben_turn180');
const runFrames = (lab.animations['walk-run-6']?.frames ?? []).map(sprite).filter((entry): entry is Sprite => !!entry);
const runMs = lab.animations['walk-run-6']?.durationsMs ?? [];
const walkInSprites = new Map(data.designs.flatMap(design => Object.values(design.sequences).flatMap(sequence => sequence.frames.flatMap(step => step.ben ? [step.ben.frame] : []))).map(name => [name, sprite(name)]));

// ---------- pixels ----------

class Picture {
  readonly image: ImageData;
  constructor(readonly w: number, readonly h: number) { this.image = new ImageData(w, h); }
  /** Puts palette cells, darkened to `level` (1 is full) for the night preview; `rows` limits how many top rows are drawn. */
  grid(grid: Grid | undefined | null, ox: number, oy: number, level = 1, rows = Infinity): void {
    if (!grid) return;
    grid.forEach((row, y) => { if (y < rows) for (let x = 0; x < row.length; x++) this.cell(row[x], ox + x, oy + y, level); });
  }
  cell(code: string, x: number, y: number, level = 1): void {
    const colour = rgb[code];
    if (!colour || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const at = (y * this.w + x) * 4;
    this.image.data[at] = colour[0] * level; this.image.data[at + 1] = colour[1] * level; this.image.data[at + 2] = colour[2] * level; this.image.data[at + 3] = 255;
  }
}
const hash = (x: number, y: number): number => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const AMBIENT = 0.38, ACTOR = 0.62;
const level = (glow = false): number => settings.night && !glow ? AMBIENT : 1;
const shows = (layer: 'back' | 'front' | 'glow'): boolean => settings.layers === 'all' || settings.layers === layer;
const benShown = (): boolean => settings.ben && settings.layers === 'all';

/**
 * Approximate surroundings. Above `far` the back wall or the night sky; from `far` to `line` the floor's top strip, its
 * flagstones slanting with the depth; at `line` the floor's white lit edge, then its stone front face.
 */
function context(picture: Picture, far: number, line: number): void {
  if (settings.background === 'none') return;
  const lit = level();
  for (let y = 0; y < picture.h; y++) for (let x = 0; x < picture.w; x++) {
    let code: string;
    if (y > line) { const row = y - line - 1; code = row % 6 === 5 || (x + (Math.floor(row / 6) % 2) * 6) % 12 === 0 ? 'k' : row % 6 === 0 ? 'L' : 'D'; }
    else if (y === line) code = 'W';
    else if (y >= far) code = (x - Math.floor((y - far) * 10 / 26)) % 14 === 0 || y === far ? 'k' : 'D';
    else if (settings.background === 'wall') code = x % 8 === 7 ? 'D' : hash(x, y) < 0.01 ? 'k' : 'L';
    else code = hash(x, y) < 0.012 ? 'W' : y < far / 2 ? 'k' : 'B';
    picture.cell(code, x, y, lit);
  }
}
/** Ben with his soles on `feet` and his body centred on `x`. */
function standingBen(picture: Picture, ben: Sprite | null, x: number, feet: number): void {
  if (!ben || !benShown()) return;
  picture.grid(ben.grid, x - ben.centre, feet - ben.foot, settings.night ? ACTOR : 1);
}

// ---------- keyed doors: a floor-line column ----------

const KEYED_LEFT = 24, BESIDE = -9, PASS_FROM = -9, PASS_TO = 25;
/** The keyed scene: room on the left for Ben beside the door, and on the right too when he runs past it. */
function keyedStage(wide = false): { w: number; h: number; top: number; line: number } {
  const h = settings.height * TILE;
  const top = Math.max(4, 34 - h + 4);
  return { w: KEYED_LEFT + TILE + (wide ? 24 : 6), h: top + h + 10, top, line: top + h };
}
function drawKeyedDoor(picture: Picture, design: KeyedDesign, step: Step): void {
  const { top, line } = keyedStage();
  // The door stands on the floor line: no top strip is drawn in front of it.
  context(picture, line, line);
  if (shows('back') && step.back) picture.grid(composeKeyed(design.layers.back.frames[step.back], settings.height), KEYED_LEFT, top, level());
  if (shows('glow') && step.glow) picture.grid(composeKeyed(design.layers.glow.frames[step.glow], settings.height), KEYED_LEFT, top, level(true));
}

// ---------- exits: on the far-plane sill ----------

const EXIT_OX = 14, EXIT_OY = 9;
function exitStage(design: ExitDesign): { w: number; h: number; sill: number; line: number } {
  const sill = EXIT_OY + design.size.h;
  const line = sill + Math.max(settings.startBelowSill, 1);
  return { w: EXIT_OX + design.size.w + 14, h: line + 12, sill, line };
}
function putLayer(picture: Picture, layer: ExitLayer | null, id: string | null | undefined, lit: number): void {
  if (layer && id) picture.grid(layer.frames[id], EXIT_OX + layer.x, EXIT_OY + layer.y, lit);
}
/** The exit as the ground pass draws it, then Ben, then (during the walk-in) the glowOver and the front lip again. */
function drawExit(picture: Picture, design: ExitDesign, step: Step, waiting: boolean): void {
  const { back, front, glow } = design.layers;
  const { sill, line } = exitStage(design);
  context(picture, sill, line);
  if (shows('back')) putLayer(picture, back, step.back, level());
  if (shows('glow')) putLayer(picture, glow, step.glow, level(true));
  if (shows('front')) putLayer(picture, front, step.front, level());
  if (waiting) {
    // Waiting in the room: Ben stands on the floor line in front of the exit, lower than its sill.
    standingBen(picture, benBack, EXIT_OX + 9, line);
    return;
  }
  const ben = step.ben;
  if (ben && !ben.hidden && benShown()) {
    const frame = walkInSprites.get(ben.frame);
    // source/ben-door-pass.json: spriteX = exitX + spriteLeft; spriteY = (sill + startBelowSill) - 36 - rise; only the top
    // visibleRows rows are drawn.
    if (frame) picture.grid(frame.grid, EXIT_OX + ben.left, sill + settings.startBelowSill - 36 - ben.rise, settings.night ? ACTOR : 1, ben.visibleRows);
  }
  if (ben?.behind) {
    if (shows('glow')) putLayer(picture, glow, step.glowOver, level(true));
    if (shows('front')) putLayer(picture, front, step.front, level());
  }
}

// ---------- timelines ----------

interface Entry { readonly ms: number; readonly label: string; readonly paint: (picture: Picture, design: Design) => void }
function layersOf(step: Step): string {
  const used: string[] = (['back', 'glow', 'front'] as const).filter(layer => step[layer]);
  if (step.glowOver) used.push('glowOver');
  return used.length ? used.join(', ') : 'nothing drawn';
}
const keyedStep = (design: KeyedDesign, name: string, index = 0): Step => design.sequences[name].frames[index];
function endingName(design: KeyedDesign): 'open' | 'emptyEnding' {
  return settings.ending === 'empty' || !design.heldOpenFrame ? 'emptyEnding' : 'open';
}
/** Shut, opening, open, with Ben standing beside the door on the floor line, clear of the leaf. */
function besideTimeline(red: KeyedDesign): Entry[] {
  const beside = (name: string, index: number) => (picture: Picture, design: Design) => {
    drawKeyedDoor(picture, design as KeyedDesign, keyedStep(design as KeyedDesign, name, index));
    standingBen(picture, benSide, KEYED_LEFT + BESIDE, keyedStage().line);
  };
  const opening = red.sequences.opening.frames.map((step, index, all) => ({ ms: red.sequences.opening.durationsMs[index], label: `Opening ${index + 1} of ${all.length} · ${layersOf(step)}`, paint: beside('opening', index) }));
  const end = endingName(red);
  return [
    { ms: 800, label: `Shut · ${layersOf(keyedStep(red, 'closed'))}`, paint: beside('closed', 0) },
    ...opening,
    { ms: 1000, label: end === 'open' ? `Open, held frame · ${layersOf(keyedStep(red, 'open'))}` : 'Open, empty ending · nothing drawn', paint: beside(end, 0) },
  ];
}
/** The open doorway with Ben running across it in front of the whole door (walk-run-6). */
function passTimeline(red: KeyedDesign): Entry[] {
  const end = endingName(red);
  const count = runFrames.length * 2;
  const entries: Entry[] = Array.from({ length: count }, (_, index) => ({
    ms: runMs[index % runFrames.length] ?? 100,
    label: `Pass ${index + 1} of ${count} · door ${end === 'open' ? 'held open' : 'empty'}, Ben in front`,
    paint: (picture: Picture, design: Design) => {
      drawKeyedDoor(picture, design as KeyedDesign, keyedStep(design as KeyedDesign, end));
      standingBen(picture, runFrames[index % runFrames.length] ?? benSide, KEYED_LEFT + Math.round(PASS_FROM + (PASS_TO - PASS_FROM) * index / (count - 1)), keyedStage().line);
    },
  }));
  return [...entries, { ms: 500, label: 'Past the door', paint: (picture, design) => drawKeyedDoor(picture, design as KeyedDesign, keyedStep(design as KeyedDesign, end)) }];
}
const exitEntries = (design: ExitDesign, name: string, label: string, waiting: boolean): Entry[] => (design.sequences[name]?.frames ?? []).map((step, index, all) => ({
  ms: design.sequences[name].durationsMs[index],
  label: `${label} ${index + 1} of ${all.length} · ${layersOf(step)}${step.ben && !step.ben.hidden ? ` · ${step.ben.frame}, ${step.ben.visibleRows} rows` : step.ben?.hidden ? ' · Ben gone' : ''}`,
  paint: (picture: Picture) => drawExit(picture, design, step, waiting),
}));
function waitingTimeline(design: ExitDesign): Entry[] {
  return [{ ...exitEntries(design, 'idle', 'Waiting', true)[0], ms: 900 }, ...exitEntries(design, 'opening', 'Opening on Up', true)];
}
function walkInTimeline(design: ExitDesign): Entry[] {
  const opened = design.sequences.opening ? exitEntries(design, 'opening', 'Opened', false).slice(-1) : exitEntries(design, 'idle', 'Ready', false);
  return [{ ...opened[0], ms: 500, label: `Up pressed · ${opened[0].label.split(' · ').slice(1).join(' · ')}` }, ...exitEntries(design, 'enter', 'Walk-in', false)];
}

// ---------- previews ----------

interface Preview {
  canvases: { canvas: HTMLCanvasElement; design: Design }[];
  timeline: () => Entry[];
  size: (design: Design) => { w: number; h: number };
  caption: HTMLElement;
  button: HTMLButtonElement;
  paused: boolean;
  elapsed: number;
  drawn: number;
}
const previews: Preview[] = [];

function render(canvas: HTMLCanvasElement, w: number, h: number, fill: (picture: Picture) => void): void {
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  canvas.style.width = w * settings.scale + 'px';
  const picture = new Picture(w, h);
  fill(picture);
  canvas.getContext('2d')!.putImageData(picture.image, 0, 0);
}
function paint(preview: Preview, force = false): void {
  const timeline = preview.timeline();
  const index = Math.min(frameIndexAt(timeline.map(entry => entry.ms), preview.elapsed), timeline.length - 1);
  if (index === preview.drawn && !force) return;
  preview.drawn = index;
  const entry = timeline[index];
  for (const { canvas, design } of preview.canvases) { const size = preview.size(design); render(canvas, size.w, size.h, picture => entry.paint(picture, design)); }
  preview.caption.textContent = `${entry.label} · ${entry.ms} ms`;
}
function setPaused(preview: Preview, paused: boolean): void {
  preview.paused = paused;
  preview.button.textContent = paused ? 'Play' : 'Pause';
  preview.button.setAttribute('aria-pressed', String(!paused));
}
/** Moves a paused preview to the start of its next frame. */
function stepForward(preview: Preview): void {
  const timeline = preview.timeline();
  const index = (Math.max(0, preview.drawn) + 1) % timeline.length;
  preview.elapsed = timeline.slice(0, index).reduce((sum, entry) => sum + entry.ms, 0);
  setPaused(preview, true);
  paint(preview, true);
}

/** A titled preview row: a scene caption, the canvases, the frame caption and its own play, step and replay controls. */
function previewBlock(title: string, scene: string, name: string, canvases: { canvas: HTMLCanvasElement; design: Design; label: string }[], timeline: () => Entry[], size: (design: Design) => { w: number; h: number }): HTMLElement {
  const button = el('button', { type: 'button', class: 'mini', 'aria-label': `Play or pause: ${name}, ${title}` });
  const caption = el('p', { class: 'frame-caption' });
  const preview: Preview = { canvases, timeline, size, caption, button, paused: settings.paused, elapsed: 0, drawn: -1 };
  setPaused(preview, preview.paused);
  button.onclick = () => setPaused(preview, !preview.paused);
  const step = el('button', { type: 'button', class: 'mini', 'aria-label': `Next frame: ${name}, ${title}` }, 'Next frame');
  step.onclick = () => stepForward(preview);
  const replay = el('button', { type: 'button', class: 'mini', 'aria-label': `Replay: ${name}, ${title}` }, 'Replay');
  replay.onclick = () => { preview.elapsed = 0; if (preview.paused) setPaused(preview, false); paint(preview, true); };
  previews.push(preview);
  return el('section', { class: 'preview-block', 'aria-label': `${name}: ${title}` },
    el('h4', {}, title), el('p', { class: 'scene' }, scene),
    el('div', { class: 'pair' }, ...canvases.map(({ canvas, label }) => el('figure', {}, el('div', { class: 'door-stage' }, canvas), el('figcaption', {}, label)))),
    caption, el('div', { class: 'card-controls' }, button, step, replay));
}

// ---------- cards ----------

function layerBytesLine(name: string, layer: LayerBytes | null): string {
  return layer ? `${name} ${layer.uniqueFrames} × ${bytes(layer.bytesPerFrame)} = ${bytes(layer.bytes)}` : `${name} unused`;
}
function costTable(rows: [string, string, number][]): HTMLElement {
  return el('table', { class: 'cost' },
    el('caption', { class: 'sr-only' }, 'Byte cost at 4 bits a pixel'),
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Stored as'), el('th', { scope: 'col' }, 'Layers'), el('th', { scope: 'col' }, 'Total'))),
    el('tbody', {}, ...rows.map(([what, detail, total]) => el('tr', {}, el('th', { scope: 'row' }, what), el('td', {}, detail), el('td', {}, bytes(total))))));
}
const behaviourBadge = (design: Design) => el('span', { class: `badge ${design.behaviour}` }, design.behaviour === 'always-open' ? 'No opening animation' : 'Animated opening');
const colourLabel = (design: KeyedDesign) => design.kind === 'keyed-red' ? 'Red ▲' : 'Blue ●';
const colourWords = (design: KeyedDesign) => design.kind === 'keyed-red' ? 'red door with a triangle badge' : 'blue door with a disc badge';

function segmentStack(design: KeyedDesign): HTMLElement {
  const wrap = el('details', { class: 'segments' }, el('summary', {}, 'Segment stack: every frame as top, middle and bottom'));
  const list = el('div', { class: 'segment-list' });
  for (const [id, frame] of Object.entries(design.layers.back.frames)) {
    const row = el('figure', { class: 'segment-row' });
    for (const segment of SEGMENTS) {
      const canvas = el('canvas', { role: 'img', 'aria-label': `${design.name}, ${id}, ${segment} segment` });
      render(canvas, TILE, TILE, picture => { picture.grid(frame[segment], 0, 0); picture.grid(design.layers.glow.frames[id]?.[segment], 0, 0); });
      canvas.style.width = TILE * 3 + 'px';
      row.append(el('span', { class: 'segment' }, canvas, el('span', {}, segment)));
    }
    row.append(el('figcaption', {}, id, design.layers.glow.frames[id] ? ' · badge lit' : ''));
    list.append(row);
  }
  wrap.append(list, el('p', { class: 'small' }, `1 tile: ${stackFor(1).join(' + ')}. 2 tiles: ${stackFor(2).join(' + ')}. 3 tiles: ${stackFor(3).join(' + ')}. Taller doors repeat the middle.`));
  return wrap;
}

function keyedCard(red: KeyedDesign, blue: KeyedDesign): HTMLElement {
  const canvasesFor = (designs: KeyedDesign[], what: string) => designs.map(design => ({ canvas: el('canvas', { role: 'img', 'aria-label': `${design.name}, ${colourWords(design)}: ${what}` }), design: design as Design, label: colourLabel(design) }));
  const b = red.bytes;
  return el('article', { class: 'door-card', 'aria-labelledby': `${red.family}-name` },
    el('h3', { id: `${red.family}-name` }, red.name), behaviourBadge(red),
    previewBlock('Opening, Ben beside the door', 'Floor-line keyed door with Ben beside it: the door stands on the floor line and Ben waits clear of the leaf while it opens.', red.name, canvasesFor([red, blue], 'opening with Ben standing beside it'), () => besideTimeline(red), () => keyedStage()),
    previewBlock('Passing through', 'The open doorway with Ben running across it: the door is drawn before Ben, so he is in front of the whole door, and he only overlaps it once it is open. Blue passes the same way.', red.name, canvasesFor([red], 'open, with Ben running across in front'), () => passTimeline(red), () => keyedStage(true)),
    el('p', {}, red.idea), el('p', { class: 'why' }, el('strong', {}, 'Why: '), red.why),
    el('p', { class: 'small' }, `Frames: ${Object.keys(red.layers.back.frames).join(', ')}. Opening: ${red.sequences.opening.durationsMs.length ? red.sequences.opening.durationsMs.join(' + ') + ' ms' : 'none'}. Held open frame: ${red.heldOpenFrame ?? 'none (empty only)'}. Badge on the ${red.badgeSegment} segment.`),
    costTable([
      ['16 × 16 segments', `${layerBytesLine('back', b.segments.back)}; ${layerBytesLine('glow', b.segments.glow)}`, b.segments.total],
      ['Baked 16 × 48', `${layerBytesLine('back', b.composed48.back)}; ${layerBytesLine('glow', b.composed48.glow)}`, b.composed48.total],
      ['Baked 16 × 32', `${layerBytesLine('back', b.composed32.back)}; ${layerBytesLine('glow', b.composed32.glow)}`, b.composed32.total],
    ]),
    el('p', { class: 'small' }, 'Each colour costs this; red and blue share the grids, so a colour-swapping bake would pay once.'),
    el('ul', { class: 'notes small' }, ...red.notes.map(note => el('li', {}, note))),
    segmentStack(red),
  );
}

function exitCard(design: ExitDesign): HTMLElement {
  const size = () => exitStage(design);
  const one = (what: string) => [{ canvas: el('canvas', { role: 'img', 'aria-label': `${design.name} exit: ${what}` }), design: design as Design, label: 'Exit, 20 × 35' }];
  const b = design.bytes;
  const strip = el('div', { class: 'segment-list' });
  for (const [id, grid] of Object.entries(design.layers.back?.frames ?? {})) {
    const frameCanvas = el('canvas', { role: 'img', 'aria-label': `${design.name}, back frame ${id} with its glow and the lip` });
    render(frameCanvas, design.size.w, design.size.h, picture => {
      const { back, front, glow } = design.layers;
      if (back) picture.grid(grid, back.x, back.y);
      if (glow?.frames[id]) picture.grid(glow.frames[id], glow.x, glow.y);
      else if (glow) picture.grid(Object.values(glow.frames)[0], glow.x, glow.y);
      if (front) picture.grid(Object.values(front.frames)[0], front.x, front.y);
    });
    frameCanvas.style.width = design.size.w * 3 + 'px';
    strip.append(el('figure', { class: 'segment-row' }, frameCanvas, el('figcaption', {}, id)));
  }
  return el('article', { class: 'door-card', 'aria-labelledby': `${design.id}-name` },
    el('h3', { id: `${design.id}-name` }, design.name), behaviourBadge(design),
    previewBlock('Waiting, Ben in front', 'Far-plane exit with Ben in front: the sill is on the far edge of the floor, higher on screen than the floor line Ben stands on.', design.name, one('Ben standing in front of it, lower than its sill'), () => waitingTimeline(design), size),
    previewBlock('Walk-in', `Ben presses Up: ben_doorIn1 to 8 rise one pixel a frame from the floor line; the front lip is drawn over his feet and the game crops the rest (${data.walkIn.contract}).`, design.name, one('Ben walking in, hidden by the front lip'), () => walkInTimeline(design), size),
    el('p', {}, design.idea), el('p', { class: 'why' }, el('strong', {}, 'Why: '), design.why),
    el('p', { class: 'small' }, `Sequences: ${Object.entries(design.sequences).map(([name, sequence]) => `${name} ${sequence.frames.length} ${sequence.frames.length === 1 ? 'frame' : 'frames'}`).join(', ')}.`),
    costTable([['Pieces', `${layerBytesLine('back', b.back)}; ${layerBytesLine('front lip', b.front)}; ${layerBytesLine('glow', b.glow)}`, b.total]]),
    el('ul', { class: 'notes small' }, ...design.notes.map(note => el('li', {}, note))),
    el('details', { class: 'segments' }, el('summary', {}, 'Back frames with their glow and the lip'), strip),
  );
}

// ---------- page ----------

function build(): void {
  const keyed = data.designs.filter(isKeyed);
  const families = [...new Set(keyed.map(design => design.family))];
  $('#keyed').replaceChildren(...families.map(family => keyedCard(keyed.find(d => d.family === family && d.kind === 'keyed-red')!, keyed.find(d => d.family === family && d.kind === 'keyed-blue')!)));
  $('#exits').replaceChildren(...data.designs.filter((design): design is ExitDesign => !isKeyed(design)).map(exitCard));
  repaintAll();
}
function repaintAll(): void { for (const preview of previews) paint(preview, true); }

function setup(): void {
  $('#generated').textContent = `Designs generated ${data.generated} · palette ${data.palette} · ${data.designs.length} designs`;
  $('#draw-order').replaceChildren(...data.drawOrder.map(line => el('li', {}, line)));
  $('#motion-note').textContent = reducedMotion ? 'Your system asks for reduced motion, so previews start paused. Use Play, Next frame or Replay under a preview.' : '';
  const pause = $<HTMLButtonElement>('#pause-all');
  const label = () => { pause.textContent = settings.paused ? 'Play all' : 'Pause all'; pause.setAttribute('aria-pressed', String(!settings.paused)); };
  pause.onclick = () => { settings.paused = !settings.paused; for (const preview of previews) setPaused(preview, settings.paused); label(); };
  label();
  $('#replay-all').onclick = () => { for (const preview of previews) preview.elapsed = 0; repaintAll(); };
  const scale = $<HTMLSelectElement>('#scale');
  scale.value = String(settings.scale);
  scale.onchange = () => { settings.scale = Number(scale.value); repaintAll(); };
  const pick = <K extends 'layers' | 'background'>(id: string, key: K) => { const select = $<HTMLSelectElement>(id); select.value = settings[key]; select.onchange = () => { (settings[key] as string) = select.value; repaintAll(); }; };
  pick('#layers', 'layers'); pick('#background', 'background');
  const sill = $<HTMLSelectElement>('#sill');
  if (![...sill.options].some(option => option.value === String(settings.startBelowSill))) sill.append(el('option', { value: String(settings.startBelowSill) }, `${settings.startBelowSill} px`));
  sill.value = String(settings.startBelowSill);
  sill.onchange = () => { settings.startBelowSill = Number(sill.value); repaintAll(); };
  const ben = $<HTMLInputElement>('#ben'), night = $<HTMLInputElement>('#night');
  ben.onchange = () => { settings.ben = ben.checked; repaintAll(); };
  night.onchange = () => { settings.night = night.checked; repaintAll(); };
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name=height]')) radio.onchange = () => { settings.height = Number(radio.value); repaintAll(); };
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name=ending]')) radio.onchange = () => { settings.ending = radio.value as 'held' | 'empty'; for (const preview of previews) preview.elapsed = 0; repaintAll(); };
  $('#controls').addEventListener('submit', event => event.preventDefault());
}

let last = performance.now();
function tick(now: number): void {
  const delta = Math.max(0, Math.min(now - last, 250));
  last = now;
  for (const preview of previews) if (!preview.paused) { preview.elapsed += delta; paint(preview); }
  requestAnimationFrame(tick);
}

setup();
build();
requestAnimationFrame(tick);
