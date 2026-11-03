// Checks the 3D-to-sprite render path: reproducible grids, palette, canvas, outline, symmetry and the 135° pilot.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import rig from "../source/ben-turntable-rig.json";
import palette from "../source/game-palette.json";
import pilot from "../source/turntable-pilot-135.json";
import edits from "../edits.json";
import type { Frame } from "../src/types.ts";
import { referenceGrids, turntableAngle } from "../src/reference-underlay.ts";
import {
  canvas,
  gridFromCapture,
  referenceFolder,
  type TurntableReferenceSet,
} from "./render-turntable-reference.ts";
import {
  captureFromImages,
  captureImages,
  celShade,
  defaultSpriteOptions,
  mirrorGrid,
  spriteFromCapture,
  type CelCapture,
} from "./sprite-render.ts";

const set: TurntableReferenceSet = JSON.parse(
  await readFile(new URL("references.json", referenceFolder), "utf8"),
);
const frameOf = (grid: readonly string[]): Frame => ({
  width: rig.width,
  height: rig.height,
  grid: [...grid],
});
const view = (angle: number): Frame =>
  frameOf(set.views.find((entry) => entry.angle === angle)!.grid);
const codes = new Set(Object.keys(palette));
/** Colour pixels beside transparency or the canvas edge; the ground row may rest on nothing. */
function openEdges(frame: Frame, groundY: number): string[] {
  const open: string[] = [];
  frame.grid.forEach((row, y) =>
    [...row].forEach((code, x) => {
      if (code === "." || code === "k") return;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        if (dy === 1 && y === groundY) continue;
        if ((frame.grid[y + dy]?.[x + dx] ?? ".") === ".") open.push(`${x},${y}`);
      }
    }),
  );
  return open;
}
/** A synthetic capture: a filled box of one letter at uniform depth, with optional patches. */
function box(
  letter: string,
  [x0, y0, x1, y1]: readonly number[],
  patches: readonly { at: readonly number[]; letter: string }[] = [],
  scale = 4,
): CelCapture {
  const width = 12 * scale,
    height = 12 * scale,
    letters: string[] = Array(width * height).fill("."),
    depth = new Uint8Array(width * height);
  const paint = (code: string, [a, b, c, d]: readonly number[]): void => {
    for (let y = b * scale; y < d * scale; y++)
      for (let x = a * scale; x < c * scale; x++) {
        letters[y * width + x] = code;
        depth[y * width + x] = 128;
      }
  };
  paint(letter, [x0, y0, x1, y1]);
  for (const patch of patches) paint(patch.letter, patch.at);
  return { width, height, scale, letters: letters.join(""), depth, depthRange: 32 };
}
const small = { width: 12, height: 12, centreX: 6, groundY: 10 };
const plain = { ...defaultSpriteOptions, proportions: undefined, ventFloor: undefined };

describe("conversion rules", () => {
  test("a filled box gains a one-pixel ink outline on every side but the ground", () => {
    const frame = spriteFromCapture(box("R", [3, 4, 8, 11]), small, plain);
    expect(frame.grid[3]).toBe("...kkkkk....");
    expect(frame.grid[4]).toBe("..kRRRRRk...");
    expect(frame.grid[10]).toBe("..kRRRRRk...");
    expect(frame.grid[11]).toBe("............");
    expect(openEdges(frame, small.groundY)).toEqual([]);
  });
  test("small details survive, specks vanish and partial pixels follow coverage", () => {
    const capture = box("W", [2, 2, 9, 8], [
      { at: [4, 4, 4.5, 4.5], letter: "B" }, // a quarter-pixel eye dot
      { at: [10, 1, 10.5, 1.5], letter: "R" }, // a detached speck
    ]);
    const frame = spriteFromCapture(capture, small, plain);
    expect(frame.grid[4][4]).toBe("B");
    expect(frame.grid[1][10]).toBe(".");
    expect([...frame.grid.join("")].every((code) => codes.has(code))).toBe(true);
  });
  test("a nearer part beside a farther one draws ink on the far side only", () => {
    const capture = box("R", [2, 2, 9, 9]);
    const near = new Uint8Array(capture.depth);
    for (let y = 2 * 4; y < 9 * 4; y++)
      for (let x = 2 * 4; x < 4 * 4; x++) near[y * capture.width + x] = 255;
    const frame = spriteFromCapture({ ...capture, depth: near }, small, plain);
    expect(frame.grid[5].slice(2, 6)).toBe("RRkR");
  });
  test("cel shading uses only palette letters and folds bright partners back to base", () => {
    const width = 2,
      height = 1,
      colour = new Uint8Array([102, 0, 0, 255, 255, 23, 23, 255]),
      normal = new Uint8Array([128, 128, 255, 255, 128, 128, 255, 255]),
      depth = new Uint8Array([200, 0, 0, 255, 200, 0, 0, 255]),
      capture = celShade({ width, height, scale: 1, colour, normal, depth, depthRange: 32 }, palette);
    expect(capture.letters).toBe("RR");
    const images = captureImages(capture, palette);
    expect(captureFromImages(images.flat, images.depth, palette, 1, 32)).toEqual(capture);
  });
});

describe("rendered reference set", () => {
  test("covers every turntable stop with the sprite-faithful head", () => {
    expect(set.headStyle).toBe("sprite");
    expect(set.canvas).toEqual(canvas);
    expect(set.views.map((entry) => entry.angle)).toEqual(
      Array.from({ length: rig.sampleCount }, (_, i) => (i * 360) / rig.sampleCount),
    );
  });
  test("is reproduced exactly from the committed captures, twice", async () => {
    for (const entry of set.views) {
      const first = await gridFromCapture(set, entry.angle),
        second = await gridFromCapture(set, entry.angle);
      expect(first.grid).toEqual([...entry.grid]);
      expect(second).toEqual(first);
    }
  });
  test("uses only palette codes on the turntable canvas, crown to ground", () => {
    for (const entry of set.views) {
      const frame = frameOf(entry.grid);
      expect(frame.grid).toHaveLength(rig.height);
      expect(frame.grid.every((row) => row.length === rig.width)).toBe(true);
      expect([...frame.grid.join("")].every((code) => codes.has(code))).toBe(true);
      expect(frame.grid.findIndex((row) => /[^.]/.test(row))).toBe(2);
      expect(frame.grid.findLastIndex((row) => /[^.]/.test(row))).toBe(rig.groundY);
      // The figure stands on the turntable's centre column.
      const columns = frame.grid.flatMap((row) =>
        [...row].flatMap((code, x) => (code === "." ? [] : [x])),
      );
      const middle = (Math.min(...columns) + Math.max(...columns)) / 2;
      expect(Math.abs(middle - rig.centreX)).toBeLessThanOrEqual(2.5);
    }
  });
  test("closes the outline around every view", () => {
    for (const entry of set.views)
      expect({ angle: entry.angle, open: openEdges(frameOf(entry.grid), rig.groundY) }).toEqual({
        angle: entry.angle,
        open: [],
      });
  });
  test("mirrors left and right turns apart from the one-sided Stunner", () => {
    // The Stunner rides on Ben's right hip only, so rows 23–28 may differ; lighting is fixed on
    // screen, so only the silhouettes are compared.
    for (let angle = 0; angle <= 180; angle += 15) {
      const a = view(angle),
        b = mirrorGrid(view((360 - angle) % 360), rig.centreX);
      let differences = 0;
      a.grid.forEach((row, y) => {
        if (y >= 23 && y <= 28) return;
        [...row].forEach((code, x) => {
          if ((code === ".") !== (b.grid[y][x] === ".")) differences++;
        });
      });
      expect({ angle, differences: Math.min(differences, 99) }).toEqual({
        angle,
        differences: Math.min(differences, 4),
      });
    }
  });
  test("keeps the Stunner on Ben's right hip", () => {
    // Ben's right hip is on screen left from the front and screen right from behind.
    const magenta = (frame: Frame): number[] =>
      frame.grid.flatMap((row) => [...row].flatMap((code, x) => (/[Mm]/.test(code) ? [x] : [])));
    expect(Math.max(...magenta(view(0)))).toBeLessThan(rig.centreX);
    expect(Math.min(...magenta(view(180)))).toBeGreaterThan(rig.centreX);
  });
});

describe("editor underlay", () => {
  test("maps standing-turn frames to their render angle and parses the set", () => {
    expect(turntableAngle("ben_turn135")).toBe(135);
    expect(turntableAngle("ben_stand")).toBeNull();
    const grids = referenceGrids(set);
    expect(grids.size).toBe(rig.sampleCount);
    expect(grids.get(135)).toEqual([...view(135).grid]);
    expect(referenceGrids({ views: "no" }).size).toBe(0);
  });
});

describe("135° pilot", () => {
  const frame: Frame = { width: pilot.width, height: pilot.height, grid: pilot.grid };
  test("became the saved 135° turntable key", () => {
    expect(pilot.status).toBe("adopted");
    expect((edits as Record<string, Frame>).ben_turn135.grid).toEqual(pilot.grid);
  });
  test("matches the saved standing sprites' canvas, crown and sole rows with a closed outline", () => {
    expect([frame.width, frame.height]).toEqual([rig.width, rig.height]);
    expect(frame.grid.every((row) => row.length === rig.width)).toBe(true);
    expect([...frame.grid.join("")].every((code) => codes.has(code))).toBe(true);
    expect(frame.grid.findIndex((row) => /[^.]/.test(row))).toBe(2);
    expect(frame.grid.findLastIndex((row) => /[^.]/.test(row))).toBe(rig.groundY);
    expect(openEdges(frame, rig.groundY)).toEqual([]);
  });
  test("keeps the collar to one white row above an all-red shirt row", () => {
    expect(frame.grid[14]).toMatch(/^\.*kW+L?k\.*$/);
    expect(frame.grid[15]).toMatch(/^\.*k[Rr]+k\.*$/);
  });
  test("carries the helmet stripe and rim, rear hair and one right-hip Stunner", () => {
    expect(frame.grid.slice(3, 7).every((row) => row.includes("W"))).toBe(true);
    expect(frame.grid[8]).toMatch(/kL{8,}/);
    expect(frame.grid.slice(9, 12).join("")).toContain("NNN");
    const magenta = frame.grid.flatMap((row) =>
      [...row].flatMap((code, x) => (/[Mm]/.test(code) ? [x] : [])),
    );
    expect(magenta.length).toBeGreaterThan(0);
    expect(Math.min(...magenta)).toBeGreaterThan(rig.centreX);
  });
  test("draws two shoes with a white sole, a white toe cap and a grey far sole", () => {
    expect(frame.grid[rig.groundY]).toMatch(/W{5,}/);
    expect(frame.grid[33]).toMatch(/L+k[RLy]*R+W+k/);
  });
});
