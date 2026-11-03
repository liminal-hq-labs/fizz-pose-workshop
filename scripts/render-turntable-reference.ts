// Renders the 3D Ben at standing-turn angles and converts each view into a reference sprite grid.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import rig from "../source/ben-turntable-rig.json";
import palette from "../source/game-palette.json";
import { headStyles } from "../src/model-3d/head.ts";
import type { SpriteFrame, SpritePasses } from "../src/model-3d/sprite-passes.ts";
import type { Frame } from "../src/types.ts";
import { png } from "./images.ts";
import {
  captureFromImages,
  captureImages,
  celShade,
  defaultSpriteOptions,
  spriteFromCapture,
  type SpriteOptions,
} from "./sprite-render.ts";
import { buildComparisonSheets } from "./turntable-reference-sheets.ts";

/** The saved reference set: every turntable stop, its capture and its converted grid. */
export interface TurntableReferenceSet {
  readonly description: string;
  readonly headStyle: string;
  readonly pose: string;
  readonly scale: number;
  readonly depthRange: number;
  readonly canvas: SpriteFrame;
  readonly options: SpriteOptions;
  /** One converted grid per rendered yaw, in angle order. */
  readonly views: readonly { readonly angle: number; readonly grid: readonly string[] }[];
}
export const referenceFolder = new URL(
  "../models/ben-3d/turntable-reference/",
  import.meta.url,
);
export const angleKey = (angle: number): string =>
  String(Math.round(angle)).padStart(3, "0");
export const canvas: SpriteFrame = {
  width: rig.width,
  height: rig.height,
  centreX: rig.centreX,
  groundY: rig.groundY,
};
export const spriteHeadStyle = "sprite";

/** Rebuilds a stop's grid from its committed capture images, without a browser. */
export async function gridFromCapture(
  set: Pick<TurntableReferenceSet, "scale" | "depthRange" | "canvas" | "options">,
  angle: number,
  folder: URL = referenceFolder,
): Promise<Frame> {
  const key = angleKey(angle),
    capture = captureFromImages(
      await readFile(new URL(`flat-${key}.png`, folder)),
      await readFile(new URL(`depth-${key}.png`, folder)),
      palette,
      set.scale,
      set.depthRange,
    );
  return spriteFromCapture(capture, set.canvas, set.options);
}

async function startServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: new URL("../vite.config.ts", import.meta.url).pathname,
    server: { port: 0, strictPort: false, host: "127.0.0.1" },
    logLevel: "error",
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string")
    throw new Error("The render server did not start.");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => server.close(),
  };
}

export async function render(
  angles: readonly number[],
  headStyle: string,
  scale: number,
): Promise<Map<number, SpritePasses>> {
  const external = process.env.TURNTABLE_RENDER_URL,
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
    await page.goto(external ?? server!.url);
    await page.locator("#model-canvas").evaluate((element) => element.scrollIntoView());
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>("#ben-3d")?.dataset.ready === "true",
    );
    const results = await page.evaluate(
      ({ angles, headStyle, scale, canvas }) => {
        const api = (
          document.querySelector("#ben-3d") as HTMLElement & {
            modelReview: {
              setHeadStyle: (id: string) => void;
              renderSprite: (angle: number, frame: unknown, scale: number) => unknown;
            };
          }
        ).modelReview;
        api.setHeadStyle(headStyle);
        return angles.map((angle) => api.renderSprite(angle, canvas, scale));
      },
      { angles: [...angles], headStyle, scale, canvas },
    );
    if (errors.length) throw new Error("Browser errors: " + errors.join("; "));
    return new Map(angles.map((angle, i) => [angle, results[i] as SpritePasses]));
  } finally {
    await browser.close();
    await server?.close();
  }
}

const description =
  "Orthographic, unlit renders of the 3D Ben standing pose at each turntable yaw. Each supersample is quantised to the EGA palette and cel-shaded by a fixed upper-left light; the capture is mapped onto the sprite's proportions, majority-downsampled to the turntable canvas with protected details, inked where one part steps behind another, cleaned of stray pixels and outlined. Rebuild with `bun run turntable:render`. Reference only: these grids never replace the saved ben_turn frames.";

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      head: { type: "string", default: spriteHeadStyle },
      angles: { type: "string" },
      scale: { type: "string", default: "8" },
      proportions: { type: "string", default: "sprite" },
      "from-captures": { type: "boolean", default: false },
      out: { type: "string" },
    },
  });
  const headStyle = values.head!;
  if (!headStyles.some((style) => style.id === headStyle))
    throw new Error(
      `Unknown head style "${headStyle}". Choose ${headStyles.map((s) => s.id).join(", ")}.`,
    );
  const scale = Number(values.scale);
  if (!Number.isInteger(scale) || scale < 2 || scale > 16)
    throw new Error("--scale must be a whole number from 2 to 16.");
  if (values.proportions !== "sprite" && values.proportions !== "model")
    throw new Error("--proportions is sprite (2.9 heads, as the saved sprites) or model.");
  const options: SpriteOptions =
    values.proportions === "sprite"
      ? defaultSpriteOptions
      : { ...defaultSpriteOptions, proportions: undefined };
  const angles = values.angles
    ? values.angles.split(",").map(Number)
    : Array.from({ length: rig.sampleCount }, (_, i) => (i * 360) / rig.sampleCount);
  if (angles.some((angle) => !Number.isFinite(angle) || angle < 0 || angle >= 360))
    throw new Error("--angles takes degrees from 0 to 359, separated by commas.");
  // The committed set uses the sprite-faithful head and sprite proportions; other choices are
  // comparison variants, kept in their own folder so they never replace the editor's underlay.
  const folder = values.out
    ? pathToFileURL(resolve(values.out) + "/")
    : headStyle === spriteHeadStyle && values.proportions === "sprite"
      ? referenceFolder
      : new URL(`variants/${headStyle}-${values.proportions}/`, referenceFolder);
  await mkdir(folder, { recursive: true });
  const indexFile = new URL("references.json", folder);
  let previous: TurntableReferenceSet | null = null;
  try {
    previous = JSON.parse(await readFile(indexFile, "utf8"));
  } catch {
    previous = null;
  }
  const fromCaptures = values["from-captures"]!,
    keep =
      previous && (fromCaptures || (previous.headStyle === headStyle && previous.scale === scale));
  const settings = {
      headStyle: fromCaptures && previous ? previous.headStyle : headStyle,
      scale: fromCaptures && previous ? previous.scale : scale,
      depthRange: previous?.depthRange ?? 32,
      canvas,
      options,
    },
    grids = new Map<number, Frame>(
      keep
        ? previous!.views.map((view) => [
            view.angle,
            { width: canvas.width, height: canvas.height, grid: [...view.grid] },
          ])
        : [],
    );
  if (fromCaptures) {
    console.log("Rebuilding grids from the saved captures…");
    for (const angle of grids.keys()) grids.set(angle, await gridFromCapture(settings, angle, folder));
  } else {
    console.log(
      `Rendering ${angles.length} views with the ${headStyle} head at ${scale}× supersampling…`,
    );
    for (const [angle, pass] of await render(angles, headStyle, scale)) {
      const capture = celShade(
          {
            ...pass,
            colour: Buffer.from(pass.colour, "base64"),
            normal: Buffer.from(pass.normal, "base64"),
            depth: Buffer.from(pass.depth, "base64"),
          },
          palette,
        ),
        images = captureImages(capture, palette),
        key = angleKey(angle);
      await writeFile(new URL(`flat-${key}.png`, folder), images.flat);
      await writeFile(new URL(`depth-${key}.png`, folder), images.depth);
      settings.depthRange = pass.depthRange;
      grids.set(angle, await gridFromCapture(settings, angle, folder));
    }
  }
  const set: TurntableReferenceSet = {
    description,
    pose: "Standing",
    ...settings,
    views: [...grids]
      .sort(([a], [b]) => a - b)
      .map(([angle, frame]) => ({ angle, grid: frame.grid })),
  };
  for (const [angle, frame] of grids)
    await writeFile(new URL(`sprite-${angleKey(angle)}.png`, folder), png(frame, palette));
  await writeFile(indexFile, JSON.stringify(set, null, 2) + "\n");
  await buildComparisonSheets(set, folder);
  console.log(`Saved ${set.views.length} reference views and comparison sheets.`);
}

