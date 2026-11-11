// Renders the cartoon model's own poses through the sprite converter and saves them as editable frames.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import rig from "../source/ben-turntable-rig.json";
import palette from "../source/game-palette.json";
import { validateFrames } from "../src/model.ts";
import type {} from "../src/model-3d/ben-g/bench.ts";
import type { Frame, Frames, WorkshopData } from "../src/types.ts";
import {
  celShade,
  defaultSpriteOptions,
  spriteFromCapture,
  type RenderPasses,
  type SpriteCanvas,
  type SpriteOptions,
  type SpriteProportions,
} from "./sprite-render.ts";

/** One sprite sequence sampled from a pose of the cartoon model, rendered by the tuning bench page. */
export interface ModelPoseSequence {
  /** Animation key in `source/poses.json`. */
  readonly key: string;
  /** Frame name prefix; frames are numbered from 1. */
  readonly prefix: string;
  /** Pose id in `src/model-3d/ben-g/poses.ts`. */
  readonly pose: string;
  /** Pose times, in seconds, to render. */
  readonly times: readonly number[];
  /** Playback order as indices into `times`, with one duration each. */
  readonly order: readonly number[];
  readonly durationsMs: readonly number[];
  /** A one-shot holds its last frame instead of wrapping. */
  readonly once?: boolean;
}

const spread = (period: number, phases: readonly number[]): number[] =>
  phases.map((phase) => phase * period);

/**
 * Poses the sprite rigs cannot draw yet, because they need art the skin lacks: a bare head and a held helmet, a hand-held
 * pogo stick and a loose fizz can. The other idles are performance rigs in `src/rig/catalogue.ts`.
 */
export const modelPoseSequences: readonly ModelPoseSequence[] = [
  { key: "head-scratch", prefix: "ben_headScratch", pose: "scratch", times: [0.143, 0.428], order: [0, 1], durationsMs: [140, 140] },
  { key: "helmet-spin", prefix: "ben_helmetSpin", pose: "spin", times: spread(0.698, [0, 0.25, 0.5, 0.75]), order: [0, 1, 2, 3], durationsMs: [90, 90, 90, 90] },
  { key: "pogo-draw", prefix: "ben_pogoDraw", pose: "draw", times: spread(3.8, [0.02, 0.18, 0.3, 0.36, 0.5, 0.64, 0.78, 0.9]), order: [0, 1, 2, 3, 4, 5, 6, 7], durationsMs: [300, 200, 140, 140, 160, 200, 160, 500], once: true },
  { key: "stunner-reload", prefix: "ben_reload", pose: "reload", times: spread(4.6, [0.05, 0.2, 0.3, 0.4, 0.52, 0.7, 0.84, 0.95]), order: [0, 1, 2, 3, 4, 5, 6, 7], durationsMs: [300, 200, 200, 220, 260, 260, 200, 400] },
];

/** The turntable canvas: 32 × 44 with the soles on row 34. */
export const modelPoseCanvas: SpriteCanvas = {
  width: rig.width,
  height: rig.height,
  centreX: rig.centreX,
  groundY: rig.groundY,
};
/**
 * The cartoon model is slimmer and smaller-headed than the hand-drawn sprites. This map lands its
 * landmarks on theirs (crown on row 2, helmet rim on row 8, collar on row 14, belt on row 23, four
 * rows of shoe) and widens each band to the sprites' flatter, broader drawing.
 */
export const modelPoseProportions: SpriteProportions = {
  heights: [
    [-0.5, -0.5], // ground
    [2.3, 3.5], // shoe top and trouser cuff
    [12.0, 10.5], // belt bottom
    [13.1, 11.5], // belt top
    [21.3, 19.5], // collar bottom
    [22.0, 21.5], // chin
    [26.4, 25.0], // eyes
    [26.9, 25.5], // helmet rim at the brow
    [31.5, 32.0], // helmet crown
  ],
  widths: [
    [-0.5, 1.4],
    [3.0, 1.4],
    [4.5, 1.25],
    [9.5, 1.25],
    [11.5, 1.35],
    [19.0, 1.35],
    [20.5, 1.2],
    [24.5, 1.2],
    [25.5, 1.2],
    [26.5, 1.25],
    [33.0, 1.25],
  ],
};
/** The model's vents are already open, so only the proportion map applies. */
export const modelPoseOptions: SpriteOptions = {
  coverage: defaultSpriteOptions.coverage,
  inkStep: defaultSpriteOptions.inkStep,
  proportions: modelPoseProportions,
};
/** Three-quarter view facing right, as the standing sprites are drawn. */
export const modelPoseYaw = 55;
const scale = 8;

/** A shade and the base colour it folds back to when it flickers. */
const shadeBase: Readonly<Record<string, string>> = { m: "M", g: "G", r: "R", b: "B", c: "b", L: "W", D: "L" };
/**
 * Cel shading is decided frame by frame, so a highlight can light up for one frame of a loop and
 * vanish again. A shade that neither playback neighbour shows folds back to its base colour.
 */
export function settleShades(frames: Frames, sequence: ModelPoseSequence): void {
  const names = sequence.order.map((i) => `${sequence.prefix}${i + 1}`),
    has = (name: string, code: string): boolean =>
      frames[name].grid.some((row) => row.includes(code));
  names.forEach((name, i) => {
    const before = names[(i + names.length - 1) % names.length],
      after = names[(i + 1) % names.length];
    for (const [shade, base] of Object.entries(shadeBase))
      if (has(name, shade) && !has(before, shade) && !has(after, shade))
        frames[name] = {
          ...frames[name],
          grid: frames[name].grid.map((row) => row.replaceAll(shade, base)),
        };
  });
}
const helmetGreen = /[gG]/;
/** Top row and mean column of the helmet shell in a frame's upper rows, or null without a worn helmet. */
function helmetAnchor(grid: readonly string[]): { top: number; x: number; left: number; right: number } | null {
  const top = grid.findIndex((row) => helmetGreen.test(row));
  if (top < 0 || top > 8) return null;
  let sum = 0, count = 0, left = Infinity, right = -Infinity;
  for (let y = top; y < top + 6; y++)
    [...(grid[y] ?? "")].forEach((code, x) => {
      if (code !== "g" && code !== "G") return;
      sum += x; count++; left = Math.min(left, x); right = Math.max(right, x);
    });
  return count ? { top, x: sum / count, left, right } : null;
}
/**
 * The hand-drawn standing head carries Ben's likeness in specifically placed pixels: the helmet
 * stripe and rim, the eye, nose and mouth and the ink around them. A render cannot reproduce them,
 * so every frame that wears the helmet takes that authored head, registered on the rendered helmet.
 * Frames with the helmet off the head keep the render.
 */
export function stampAuthoredHead(frame: Frame, authored: Frame): Frame {
  const source = helmetAnchor(authored.grid), target = helmetAnchor(frame.grid);
  if (!source || !target) return frame;
  const rows = 12, dx = Math.round(target.x - source.x), dy = target.top - source.top,
    grid = frame.grid.map((row) => [...row]);
  let left = target.left - 2, right = target.right + 2;
  for (let y = source.top - 1; y < source.top - 1 + rows; y++)
    [...(authored.grid[y] ?? "")].forEach((code, x) => {
      if (code === ".") return;
      left = Math.min(left, x + dx); right = Math.max(right, x + dx);
    });
  for (let y = target.top - 1; y < target.top - 1 + rows; y++)
    for (let x = left; x <= right; x++) if (grid[y]?.[x] !== undefined) grid[y][x] = ".";
  for (let y = source.top - 1; y < source.top - 1 + rows; y++)
    [...(authored.grid[y] ?? "")].forEach((code, x) => {
      const row = grid[y + dy];
      if (code !== "." && row?.[x + dx] !== undefined) row[x + dx] = code;
    });
  return { ...frame, grid: grid.map((row) => row.join("")) };
}
const bytes = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, "base64"));

/** Serves the workshop so the bench page can load its modules. */
async function startServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: new URL("../vite.config.ts", import.meta.url).pathname,
    server: { port: 0, strictPort: false, host: "127.0.0.1" },
    logLevel: "error",
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("The render server did not start.");
  return { url: `http://127.0.0.1:${address.port}/`, close: () => server.close() };
}

/** Renders every sequence in a browser and converts each capture to a palette grid. */
export async function drawModelPoses(authoredHead?: Frame): Promise<Frames> {
  const external = process.env.BEN_G_BENCH_URL,
    server = external ? null : await startServer(),
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    page.setDefaultTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto((external ?? server!.url) + "ben-g.html");
    await page.waitForFunction(() => window.benG !== undefined);
    const frames: Frames = {};
    for (const sequence of modelPoseSequences)
      for (const [i, time] of sequence.times.entries()) {
        const encoded = await page.evaluate(
            ({ pose, time, yaw, canvas, scale }) => window.benG!.spritePasses(pose, time, yaw, canvas, scale),
            { pose: sequence.pose, time, yaw: modelPoseYaw, canvas: modelPoseCanvas, scale },
          ),
          passes: RenderPasses = {
            width: encoded.width,
            height: encoded.height,
            scale: encoded.scale,
            colour: bytes(encoded.colour),
            normal: bytes(encoded.normal),
            depth: bytes(encoded.depth),
            depthRange: encoded.depthRange,
          };
        frames[`${sequence.prefix}${i + 1}`] = spriteFromCapture(
          celShade(passes, palette),
          modelPoseCanvas,
          modelPoseOptions,
        );
      }
    if (authoredHead)
      for (const name of Object.keys(frames))
        frames[name] = stampAuthoredHead(frames[name], authoredHead);
    for (const sequence of modelPoseSequences) settleShades(frames, sequence);
    if (errors.length) throw new Error("Browser errors: " + errors.join("; "));
    return validateFrames(frames, frames, palette);
  } finally {
    await browser.close();
    await server?.close();
  }
}

if (import.meta.main) {
  const root = new URL("../", import.meta.url),
    file = new URL("source/poses.json", root),
    data: Omit<WorkshopData, "palette"> = JSON.parse(await readFile(file, "utf8")),
    frames = await drawModelPoses(data.frames.ben_standRight);
  Object.assign(data.frames, frames);
  for (const sequence of modelPoseSequences)
    data.animations[sequence.key] = {
      frames: sequence.order.map((i) => `${sequence.prefix}${i + 1}`),
      durationsMs: [...sequence.durationsMs],
      loop: !sequence.once,
    };
  await writeFile(file, JSON.stringify(data, null, 2) + "\n");
  console.log(
    `Saved ${Object.keys(frames).length} model-pose sprites in ${modelPoseSequences.length} loops.`,
  );
}
