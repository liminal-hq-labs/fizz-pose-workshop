// Converts supersampled 3D model passes into cel-shaded, outlined, palette-indexed sprite grids.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { PNG } from "pngjs";
import { rgb } from "./images.ts";
import type { Frame, Palette } from "../src/types.ts";

/** Raw browser passes, top row first; see `src/model-3d/sprite-passes.ts`. */
export interface RenderPasses {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly colour: Uint8Array;
  readonly normal: Uint8Array;
  readonly depth: Uint8Array;
  readonly depthRange: number;
}
/** One palette letter (or `.`) and one depth byte per supersample; 255 is nearest the camera. */
export interface CelCapture {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly letters: string;
  readonly depth: Uint8Array;
  readonly depthRange: number;
}
export interface SpriteCanvas {
  readonly width: number;
  readonly height: number;
  readonly centreX: number;
  readonly groundY: number;
}
/** A shade or highlight swap for one base letter, decided by the facing towards the screen light. */
interface CelShade {
  readonly shadow?: string;
  readonly shadowBelow?: number;
  readonly light?: string;
  readonly lightAbove?: number;
}
/**
 * The sprites are lit from the upper left and slightly in front, whichever way Ben faces, so the
 * light is fixed in view space. Skin, collar and soles darken to grey on the far side; the helmet,
 * shirt, jeans and Stunner gain their bright EGA partner on surfaces facing the light.
 */
export const celLight = normalise([-0.5, 0.72, 0.48]);
export const celShades: Readonly<Record<string, CelShade>> = {
  W: { shadow: "L", shadowBelow: -0.2 },
  G: { light: "g", lightAbove: 0.6 },
  R: { light: "r", lightAbove: 0.85 },
  B: { light: "b", lightAbove: 0.9 },
  L: { shadow: "D", shadowBelow: -0.45 },
  M: { light: "m", lightAbove: 0.55 },
};
/**
 * The model blends some surfaces between an EGA colour and its bright partner (the lighter
 * sleeves and the bright helmet shell). Sprite shading comes from the light alone, so each bright
 * partner first folds back to its base colour.
 */
export const celFamilies: Readonly<Record<string, string>> = {
  r: "R",
  g: "G",
  b: "B",
  m: "M",
};
/**
 * Small features that must survive the downsample even when they cover only part of a pixel: the
 * eyes (iris and pupil read as one blue dot), the mouth, the chest emblem, the helmet stripe, the
 * jeans seam and the shoe badge. Each wins its pixel over the surrounding base colour at `share`.
 */
export const spriteDetails: readonly {
  readonly on: readonly string[];
  readonly detail: readonly string[];
  readonly share: number;
  readonly as: string;
}[] = [
  { on: ["W", "L"], detail: ["B", "k"], share: 0.12, as: "B" },
  { on: ["W", "L"], detail: ["R", "r"], share: 0.25, as: "R" },
  { on: ["R", "r"], detail: ["y", "N"], share: 0.2, as: "y" },
  { on: ["G", "g"], detail: ["W"], share: 0.22, as: "W" },
  { on: ["G", "g"], detail: ["L", "D"], share: 0.25, as: "L" },
  { on: ["B", "b"], detail: ["c"], share: 0.15, as: "c" },
];
/** Shade partners: a lone pixel of the first letter inside the second is noise. */
const shadePairs: readonly (readonly [string, string])[] = [
  ["L", "W"],
  ["r", "R"],
  ["g", "G"],
  ["G", "g"],
  ["b", "B"],
  ["D", "L"],
  ["m", "M"],
];
/**
 * Maps the realistic model's proportions onto the sprite's. `heights` pairs a model height with
 * the sprite height it lands on (both in model units above the ground, increasing); `widths` pairs
 * a sprite height with a horizontal scale about the body's centre line. Both are linear between
 * entries. Without it the render keeps the model's 3.6-head proportions.
 */
export interface SpriteProportions {
  readonly heights: readonly (readonly [number, number])[];
  readonly widths: readonly (readonly [number, number])[];
}
/**
 * The saved standing sprites are 2.9 heads tall: a deep helmet ending on row 8, eyes on row 9,
 * the mouth on row 11, the collar on row 14, the belt on row 23 and four rows of shoe from row 31.
 * Their shirt with arms is about 1.2 times the model's width and their shoes about 1.3 times.
 */
export const spriteProportions: SpriteProportions = {
  heights: [
    [-0.5, -0.5], // ground
    [1.5, 3.5], // shoe top and trouser cuff
    [10.5, 10.5], // belt bottom
    [11.5, 11.5], // belt top
    [20.5, 19.5], // collar bottom, where the shirt starts
    [22.2, 21.5], // chin
    [26.0, 25.0], // eyes
    [27.4, 25.5], // helmet rim at the brow
    [31.0, 31.5], // helmet crown
  ],
  widths: [
    [-0.5, 1.3],
    [3.0, 1.3],
    [4.5, 1.05],
    [9.5, 1.05],
    [11.5, 1.2],
    [19.0, 1.2],
    [20.5, 1.05],
    [24.5, 1.05],
    [25.5, 1.12],
    [26.5, 1.25],
    [32.0, 1.25],
  ],
};
export interface SpriteOptions {
  /** Fraction of a pixel the model must cover to fill it. */
  readonly coverage: number;
  /** Depth step, in model units, at which a farther neighbour gets an ink line. */
  readonly inkStep: number;
  /** Optional proportion map applied before downsampling. */
  readonly proportions?: SpriteProportions;
  /**
   * Model height above which hair and foam glimpsed through the helmet vents become shell green;
   * the vents are far smaller than a sprite pixel and the sprites draw a solid shell.
   */
  readonly ventFloor?: number;
}
export const defaultSpriteOptions: SpriteOptions = {
  coverage: 0.5,
  inkStep: 1.6,
  proportions: spriteProportions,
  ventFloor: 28.2,
};
/** Fills the helmet vents with shell green above `floor` (model units). */
export function closeVents(
  capture: CelCapture,
  canvas: SpriteCanvas,
  floor: number,
): CelCapture {
  const letters = [...capture.letters],
    top = canvas.groundY + 0.5;
  for (let ty = 0; ty < capture.height; ty++) {
    if (top - (ty + 0.5) / capture.scale <= floor) break;
    for (let tx = 0; tx < capture.width; tx++) {
      const i = ty * capture.width + tx;
      if (letters[i] === "N" || letters[i] === "D") letters[i] = "G";
    }
  }
  return { ...capture, letters: letters.join("") };
}

function piecewise(points: readonly (readonly [number, number])[], x: number, invert = false): number {
  const pairs = invert ? points.map(([a, b]) => [b, a] as const) : points;
  if (x <= pairs[0][0]) return pairs[0][1] + (x - pairs[0][0]) * slope(pairs, 0);
  for (let i = 1; i < pairs.length; i++)
    if (x <= pairs[i][0]) {
      const [x0, y0] = pairs[i - 1],
        [x1, y1] = pairs[i];
      return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
    }
  const last = pairs.length - 1;
  return pairs[last][1] + (x - pairs[last][0]) * slope(pairs, last - 1);
}
function slope(pairs: readonly (readonly [number, number])[], i: number): number {
  return (pairs[i + 1][1] - pairs[i][1]) / (pairs[i + 1][0] - pairs[i][0]);
}
/** Resamples a capture through a proportion map, nearest supersample, keeping letters and depth. */
export function reproportion(
  capture: CelCapture,
  canvas: SpriteCanvas,
  proportions: SpriteProportions,
): CelCapture {
  const s = capture.scale,
    letters: string[] = new Array(capture.width * capture.height),
    depth = new Uint8Array(capture.width * capture.height),
    top = canvas.groundY + 0.5;
  for (let ty = 0; ty < capture.height; ty++) {
    const spriteY = top - (ty + 0.5) / s,
      modelY = piecewise(proportions.heights, spriteY, true),
      sy = Math.floor((top - modelY) * s),
      widen = piecewise(proportions.widths, spriteY);
    for (let tx = 0; tx < capture.width; tx++) {
      const spriteX = (tx + 0.5) / s - canvas.centreX - 0.5,
        sx = Math.floor((spriteX / widen + canvas.centreX + 0.5) * s),
        to = ty * capture.width + tx;
      if (sy < 0 || sy >= capture.height || sx < 0 || sx >= capture.width) {
        letters[to] = ".";
        continue;
      }
      const from = sy * capture.width + sx;
      letters[to] = capture.letters[from];
      depth[to] = capture.depth[from];
    }
  }
  return { ...capture, letters: letters.join(""), depth };
}

function normalise(v: readonly number[]): readonly [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}
const toSrgb = (linear: number): number => {
  const c = linear / 255,
    s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
};
/** Opaque palette entries in a fixed order, so ties and searches never depend on object order. */
export function paletteEntries(
  palette: Palette,
): readonly (readonly [string, readonly [number, number, number]])[] {
  return Object.entries(palette)
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([code, hex]) => [code, rgb(hex)] as const);
}
export function nearestLetter(
  colour: readonly number[],
  entries: ReturnType<typeof paletteEntries>,
): string {
  let best = entries[0][0],
    distance = Infinity;
  for (const [code, value] of entries) {
    const d =
      (colour[0] - value[0]) ** 2 +
      (colour[1] - value[1]) ** 2 +
      (colour[2] - value[2]) ** 2;
    if (d < distance) {
      distance = d;
      best = code;
    }
  }
  return best;
}

/** Quantises the unlit colour pass to palette letters, then swaps in shades by facing. */
export function celShade(passes: RenderPasses, palette: Palette): CelCapture {
  const entries = paletteEntries(palette),
    count = passes.width * passes.height,
    letters: string[] = new Array(count),
    depth = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    if (passes.colour[o + 3] === 0) {
      letters[i] = ".";
      continue;
    }
    const nearest = nearestLetter(
        [
          toSrgb(passes.colour[o]),
          toSrgb(passes.colour[o + 1]),
          toSrgb(passes.colour[o + 2]),
        ],
        entries,
      ),
      base = celFamilies[nearest] ?? nearest,
      n = [0, 1, 2].map((c) => (passes.normal[o + c] / 255) * 2 - 1),
      facing = n[0] * celLight[0] + n[1] * celLight[1] + n[2] * celLight[2],
      shade = celShades[base];
    letters[i] =
      shade?.shadow && facing < (shade.shadowBelow ?? -1)
        ? shade.shadow
        : shade?.light && facing > (shade.lightAbove ?? 1)
          ? shade.light
          : base;
    depth[i] = Math.max(1, passes.depth[o]);
  }
  return {
    width: passes.width,
    height: passes.height,
    scale: passes.scale,
    letters: letters.join(""),
    depth,
    depthRange: passes.depthRange,
  };
}

/** Saves a capture as two lossless images: the cel-shaded colours and a greyscale depth map. */
export function captureImages(
  capture: CelCapture,
  palette: Palette,
): { flat: Buffer; depth: Buffer } {
  const flat = new PNG({ width: capture.width, height: capture.height }),
    depth = new PNG({ width: capture.width, height: capture.height });
  for (let i = 0; i < capture.letters.length; i++) {
    const code = capture.letters[i],
      hex = palette[code];
    if (!hex) continue;
    const [r, g, b] = rgb(hex),
      o = i * 4;
    flat.data[o] = r;
    flat.data[o + 1] = g;
    flat.data[o + 2] = b;
    flat.data[o + 3] = 255;
    depth.data[o] = depth.data[o + 1] = depth.data[o + 2] = capture.depth[i];
    depth.data[o + 3] = 255;
  }
  return { flat: PNG.sync.write(flat), depth: PNG.sync.write(depth) };
}
/** Reads a capture back from `captureImages`, exactly. */
export function captureFromImages(
  flatImage: Buffer,
  depthImage: Buffer,
  palette: Palette,
  scale: number,
  depthRange: number,
): CelCapture {
  const flat = PNG.sync.read(flatImage),
    depthPng = PNG.sync.read(depthImage),
    byColour = new Map(
      paletteEntries(palette).map(([code, [r, g, b]]) => [
        (r << 16) | (g << 8) | b,
        code,
      ]),
    ),
    count = flat.width * flat.height,
    letters: string[] = new Array(count),
    depth = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    if (flat.data[o + 3] === 0) {
      letters[i] = ".";
      continue;
    }
    const code = byColour.get(
      (flat.data[o] << 16) | (flat.data[o + 1] << 8) | flat.data[o + 2],
    );
    if (!code) throw new Error(`Capture pixel ${i} is not a palette colour.`);
    letters[i] = code;
    depth[i] = depthPng.data[o];
  }
  return {
    width: flat.width,
    height: flat.height,
    scale,
    letters: letters.join(""),
    depth,
    depthRange,
  };
}

interface Cell {
  letter: string;
  depth: number;
}
const neighbours4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const neighbours8 = [
  ...neighbours4,
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** Chooses each pixel's letter by majority, letting small details win at their share. */
function downsample(
  capture: CelCapture,
  canvas: SpriteCanvas,
  options: SpriteOptions,
): (Cell | null)[][] {
  const s = capture.scale;
  if (capture.width !== canvas.width * s || capture.height !== canvas.height * s)
    throw new Error("The capture does not match the sprite canvas.");
  return Array.from({ length: canvas.height }, (_, y) =>
    Array.from({ length: canvas.width }, (_, x): Cell | null => {
      const counts = new Map<string, number>();
      let covered = 0,
        depthSum = 0;
      for (let dy = 0; dy < s; dy++)
        for (let dx = 0; dx < s; dx++) {
          const i = (y * s + dy) * capture.width + x * s + dx,
            code = capture.letters[i];
          if (code === ".") continue;
          covered++;
          depthSum += capture.depth[i];
          counts.set(code, (counts.get(code) ?? 0) + 1);
        }
      if (covered < options.coverage * s * s) return null;
      const ranked = [...counts].sort((a, b) =>
        b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1,
      );
      let letter = ranked[0][0];
      for (const rule of spriteDetails) {
        if (!rule.on.includes(letter)) continue;
        const share =
          rule.detail.reduce((sum, code) => sum + (counts.get(code) ?? 0), 0) /
          covered;
        if (share >= rule.share) {
          letter = rule.as;
          break;
        }
      }
      return {
        letter,
        depth: ((depthSum / covered) * capture.depthRange) / 255,
      };
    }),
  );
}

const at = <T>(rows: T[][], x: number, y: number): T | undefined =>
  rows[y]?.[x];

/**
 * Turns a capture into a sprite: majority downsample with protected details, ink where a part
 * steps behind its neighbour, stray-pixel clean-up and a one-pixel outline drawn outside the
 * silhouette (ink, not volume). The ground row gets no ink beneath it, as in the saved sprites.
 */
export function spriteFromCapture(
  capture: CelCapture,
  canvas: SpriteCanvas,
  options: SpriteOptions = defaultSpriteOptions,
): Frame {
  const vented =
      options.ventFloor === undefined
        ? capture
        : closeVents(capture, canvas, options.ventFloor),
    cells = downsample(
      options.proportions
        ? reproportion(vented, canvas, options.proportions)
        : vented,
      canvas,
      options,
    ),
    { width, height } = canvas;
  // The sole's grey underside is not drawn from a level camera: the ground row stays white rubber.
  for (const cell of cells[canvas.groundY] ?? [])
    if (cell && (cell.letter === "D" || cell.letter === "L")) cell.letter = "W";
  // Specks: a filled pixel with no filled side neighbour is a sliver of strap or finger.
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (
        cells[y][x] &&
        neighbours4.every(([dx, dy]) => !at(cells, x + dx, y + dy))
      )
        cells[y][x] = null;
  // Interior ink: a pixel whose left or right neighbour is clearly nearer is the far edge of an
  // overlap (an arm over the shirt, one shoe over the other). Vertical overlaps (the helmet over
  // the brow, a cuff over the shoe) stay uninked, as in the saved sprites.
  const ink = cells.map((row) => row.map(() => false));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      if (!cell) continue;
      ink[y][x] = neighbours4.slice(0, 2).some(([dx, dy]) => {
        const other = at(cells, x + dx, y + dy);
        return !!other && other.depth - cell.depth > options.inkStep;
      });
    }
  // A lone interior ink dot is depth noise, not a contour.
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (
        ink[y][x] &&
        neighbours8.every(([dx, dy]) => !at(ink, x + dx, y + dy))
      )
        ink[y][x] = false;
  const grid = cells.map((row, y) =>
    row.map((cell, x) => (cell ? (ink[y][x] ? "k" : cell.letter) : ".")),
  );
  // Stray shades: a lone shade pixel joins its base colour, a lone base pixel inside shade joins it.
  const before = grid.map((row) => [...row]);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const code = before[y][x];
      for (const [shade, base] of shadePairs) {
        if (code !== shade) continue;
        const around = neighbours8.map(([dx, dy]) => at(before, x + dx, y + dy));
        if (around.includes(shade)) continue;
        const sides = neighbours4.map(([dx, dy]) => at(before, x + dx, y + dy));
        if (sides.filter((other) => other === base).length >= 2)
          grid[y][x] = base;
        break;
      }
    }
  // The silhouette outline: every empty pixel beside the figure, above the ground row.
  const outlined = grid.map((row) => [...row]);
  for (let y = 0; y <= Math.min(canvas.groundY, height - 1); y++)
    for (let x = 0; x < width; x++)
      if (
        grid[y][x] === "." &&
        neighbours4.some(([dx, dy]) => {
          const other = at(grid, x + dx, y + dy);
          return other !== undefined && other !== ".";
        })
      )
        outlined[y][x] = "k";
  // Pinholes: an empty pixel boxed in by ink on three sides closes up.
  for (let y = 0; y <= Math.min(canvas.groundY, height - 1); y++)
    for (let x = 0; x < width; x++)
      if (
        outlined[y][x] === "." &&
        neighbours4.filter(([dx, dy]) => at(outlined, x + dx, y + dy) === "k").length >= 3
      )
        outlined[y][x] = "k";
  return { width, height, grid: outlined.map((row) => row.join("")) };
}

/** Mirrors a grid about the canvas centre column, as a turn of −angle would show it. */
export function mirrorGrid(frame: Frame, centreX: number): Frame {
  return {
    ...frame,
    grid: frame.grid.map((row) =>
      Array.from({ length: frame.width }, (_, x) => row[2 * centreX - x] ?? ".").join(""),
    ),
  };
}
