// Lays out saved turntable sprites beside 3D reference renders and the hand-cleaned 135° pilot.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import palette from "../source/game-palette.json";
import type { Frame, WorkshopData } from "../src/types.ts";
import { raster } from "./images.ts";

interface SheetSet {
  readonly canvas: { readonly width: number; readonly height: number };
  readonly views: readonly { readonly angle: number; readonly grid: readonly string[] }[];
}
const key = (angle: number): string => String(angle).padStart(3, "0");
/** A 3 × 5 pixel font for sheet labels. */
const glyphs: Record<string, string> = {
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "111001111100111",
  "3": "111001111001111",
  "4": "101101111001001",
  "5": "111100111001111",
  "6": "111100111101111",
  "7": "111001001001001",
  "8": "111101111101111",
  "9": "111101111001111",
  "°": "010101010000000",
  A: "010101111101101",
  C: "111100100100111",
  D: "110101101101110",
  E: "111100111100111",
  I: "111010010010111",
  L: "100100100100111",
  N: "101111111111101",
  O: "111101101101111",
  P: "111101111100100",
  R: "110101110101101",
  S: "111100111001111",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  " ": "000000000000000",
  "·": "000000010000000",
};
const background = [27, 43, 35] as const,
  panel = [41, 55, 47] as const,
  ink = [230, 236, 220] as const;

function fill(
  image: PNG,
  x0: number,
  y0: number,
  w: number,
  h: number,
  colour: readonly number[],
): void {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const o = (y * image.width + x) * 4;
      image.data[o] = colour[0];
      image.data[o + 1] = colour[1];
      image.data[o + 2] = colour[2];
      image.data[o + 3] = 255;
    }
}
function label(image: PNG, text: string, x: number, y: number, size = 3): void {
  [...text.toUpperCase()].forEach((char, i) => {
    const glyph = glyphs[char] ?? glyphs[" "];
    for (let gy = 0; gy < 5; gy++)
      for (let gx = 0; gx < 3; gx++)
        if (glyph[gy * 3 + gx] === "1")
          fill(image, x + (i * 4 + gx) * size, y + gy * size, size, size, ink);
  });
}
function blit(image: PNG, frame: Frame, x: number, y: number, scale: number): void {
  fill(image, x, y, frame.width * scale, frame.height * scale, panel);
  const sprite = raster(frame, palette, scale);
  for (let sy = 0; sy < sprite.height; sy++)
    for (let sx = 0; sx < sprite.width; sx++) {
      const from = (sy * sprite.width + sx) * 4;
      if (!sprite.data[from + 3]) continue;
      const to = ((y + sy) * image.width + x + sx) * 4;
      for (let c = 0; c < 4; c++) image.data[to + c] = sprite.data[from + c];
    }
}
/** Crops the empty rows below the ground and above the crown so the sheet stays compact. */
const crop = (frame: Frame, top: number, bottom: number): Frame => ({
  ...frame,
  height: bottom - top + 1,
  grid: frame.grid.slice(top, bottom + 1),
});

export async function loadPilot(): Promise<Frame | null> {
  try {
    const pilot = JSON.parse(
      await readFile(new URL("../source/turntable-pilot-135.json", import.meta.url), "utf8"),
    );
    return { width: pilot.width, height: pilot.height, grid: pilot.grid };
  } catch {
    return null;
  }
}

/**
 * Writes `contact-sheet.png` (every saved stop above its render) and `pilot-135-comparison.png`
 * (the saved 0°, 45°, 90°, 180° and 315° sprites and the saved 135° in-between, the renders at the
 * same angles, and the hand-cleaned 135° pilot).
 */
export async function buildComparisonSheets(
  set: SheetSet,
  folder: URL = new URL("../models/ben-3d/turntable-reference/", import.meta.url),
): Promise<void> {
  const root = new URL("../", import.meta.url),
    data: WorkshopData = JSON.parse(await readFile(new URL("assets.json", root), "utf8")),
    saved = (angle: number): Frame | undefined => data.frames["ben_turn" + key(angle)],
    rendered = new Map<number, Frame>(
      set.views.map((view) => [
        view.angle,
        { width: set.canvas.width, height: set.canvas.height, grid: [...view.grid] },
      ]),
    ),
    top = 1,
    bottom = 35;
  {
    const keys = [...rendered.keys()],
      scale = 4,
      columns = 12,
      cellW = 32 * scale + 12,
      cellH = (bottom - top + 1) * scale,
      blockH = 24 + cellH * 2 + 12,
      image = new PNG({
        width: columns * cellW + 12,
        height: Math.ceil(keys.length / columns) * blockH + 12,
      });
    fill(image, 0, 0, image.width, image.height, background);
    keys.forEach((angle, i) => {
      const x = 12 + (i % columns) * cellW,
        y = 12 + Math.floor(i / columns) * blockH;
      label(image, angle + "°", x, y, 3);
      const old = saved(angle);
      if (old) blit(image, crop(old, top, bottom), x, y + 24, scale);
      blit(image, crop(rendered.get(angle)!, top, bottom), x, y + 24 + cellH, scale);
    });
    await writeFile(new URL("contact-sheet.png", folder), PNG.sync.write(image));
  }
  const pilot = await loadPilot(),
    keys = [0, 45, 90, 135, 180, 315].filter((angle) => rendered.has(angle));
  if (!keys.includes(135)) return;
  const scale = 8,
    cellW = 32 * scale + 16,
    cellH = (bottom - top + 1) * scale,
    rows = [
      { name: "SAVED", frames: keys.map(saved) },
      { name: "AUTO RENDER", frames: keys.map((angle) => rendered.get(angle)) },
      {
        name: "PILOT CLEANED",
        frames: keys.map((angle) => (angle === 135 && pilot ? pilot : undefined)),
      },
    ],
    left = 16,
    rowH = 30 + cellH + 16,
    image = new PNG({ width: left + keys.length * cellW, height: 16 + rows.length * rowH });
  fill(image, 0, 0, image.width, image.height, background);
  rows.forEach((row, r) => {
    const y = 16 + r * rowH;
    keys.forEach((angle, c) => {
      const x = left + c * cellW,
        frame = row.frames[c];
      if (!frame) return;
      label(image, `${row.name} · ${angle}°`, x, y, 3);
      blit(image, crop(frame, top, bottom), x, y + 30, scale);
    });
  });
  await writeFile(new URL("pilot-135-comparison.png", folder), PNG.sync.write(image));
}
