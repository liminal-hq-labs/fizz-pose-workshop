// Reviews the rendered model against six calibrated sprite views and exports comparison plates.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import config from "../source/ben-3d.json";
import type { WorkshopData } from "../src/types.ts";
import { poseNames } from "../src/model-3d/poses.ts";

type Render = { width: number; height: number; pixels: number[] };
type View = {
  angle: number;
  all: Render;
  helmet: Render;
  shoes: Render;
  image: Render;
};
type Bounds = { width: number; height: number; top: number; bottom: number };
function bounds(
  occupied: (x: number, y: number) => boolean,
  top = 0,
  bottom = 43,
): Bounds {
  const xs: number[] = [],
    ys: number[] = [];
  for (let y = top; y <= bottom; y++)
    for (let x = 0; x < 32; x++)
      if (occupied(x, y)) {
        xs.push(x);
        ys.push(y);
      }
  return {
    width: Math.max(...xs) - Math.min(...xs) + 1,
    height: Math.max(...ys) - Math.min(...ys) + 1,
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}
function renderedBounds(render: Render): Bounds {
  return bounds((x, y) => render.pixels[((43 - y) * 32 + x) * 4 + 3] >= 128);
}
function paste(plate: PNG, render: Render, column: number, row: number): void {
  for (let y = 0; y < render.height; y++)
    for (let x = 0; x < render.width; x++) {
      const from = ((render.height - 1 - y) * render.width + x) * 4,
        to = ((row * 440 + y) * plate.width + column * 320 + x) * 4;
      for (let c = 0; c < 4; c++) plate.data[to + c] = render.pixels[from + c];
    }
}
const root = new URL("../", import.meta.url),
  output = new URL("models/ben-3d/review/", root);
await mkdir(output, { recursive: true });
const data: WorkshopData = JSON.parse(
  await readFile(new URL("assets.json", root), "utf8"),
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.MODEL_REVIEW_URL ?? "http://127.0.0.1:5173/");
  await page
    .locator("#model-canvas")
    .evaluate((element) => element.scrollIntoView());
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>("#ben-3d")?.dataset.ready === "true",
  );
  const views = (await page.evaluate(
    (angles) => {
      const api = (
        document.querySelector("#ben-3d") as HTMLElement & {
          modelReview: {
            renderReview: (
              angle: number,
              width: number,
              height: number,
              part?: string,
            ) => Render;
          };
        }
      ).modelReview;
      return angles.map((angle) => ({
        angle,
        all: api.renderReview(angle, 32, 44),
        helmet: api.renderReview(angle, 32, 44, "helmet"),
        shoes: api.renderReview(angle, 32, 44, "shoes"),
        image: api.renderReview(angle, 320, 440),
      }));
    },
    config.references.map((ref) => ref.angle),
  )) as View[];
  const plate = new PNG({ width: 1920, height: 880 });
  console.log("Captured six calibrated reference views.");
  const metrics = views.map((view, i) => {
    const ref = config.references[i],
      frame = data.frames[ref.frame];
    const sourceMask = (x: number, y: number): boolean =>
      frame.grid[y][x] !== ".";
    const source = bounds(sourceMask),
      actual = renderedBounds(view.all);
    const sourceHelmet = bounds(sourceMask, 2, 8),
      helmet = renderedBounds(view.helmet);
    const sourceShoes = bounds(sourceMask, 30, 34),
      shoes = renderedBounds(view.shoes);
    paste(plate, view.image, i, 0);
    for (let y = 0; y < 440; y++)
      for (let x = 0; x < 320; x++) {
        const colour =
          data.palette[frame.grid[Math.floor(y / 10)][Math.floor(x / 10)]];
        if (!colour) continue;
        const to = ((y + 440) * plate.width + i * 320 + x) * 4;
        for (let c = 0; c < 3; c++)
          plate.data[to + c] = parseInt(colour.slice(1 + c * 2, 3 + c * 2), 16);
        plate.data[to + 3] = 255;
      }
    const differences = {
      height: actual.height - source.height,
      headWidth:
        bounds(
          (x, y) => view.all.pixels[((43 - y) * 32 + x) * 4 + 3] >= 128,
          9,
          13,
        ).width - bounds(sourceMask, 9, 13).width,
      torsoWidth:
        bounds(
          (x, y) => view.all.pixels[((43 - y) * 32 + x) * 4 + 3] >= 128,
          15,
          23,
        ).width - bounds(sourceMask, 15, 23).width,
      helmetWidth: helmet.width - sourceHelmet.width,
      shoeWidth: shoes.width - sourceShoes.width,
      shoeHeight: shoes.height - sourceShoes.height,
    };
    return {
      angle: view.angle,
      frame: ref.frame,
      source,
      actual,
      sourceHelmet,
      helmet,
      sourceShoes,
      shoes,
      differences,
      withinTolerance: Object.values(differences).every(
        (value) => Math.abs(value) <= config.reviewTolerancePixels,
      ),
    };
  });
  await writeFile(
    new URL("reference-comparison.png", output),
    PNG.sync.write(plate),
  );
  console.log("Saved reference comparison plate.");
  const poses = await page.evaluate(
    (names) => {
      const api = (
        document.querySelector("#ben-3d") as HTMLElement & {
          modelReview: {
            renderReview: (
              angle: number,
              width: number,
              height: number,
              part: string,
              pose: string,
              time: number,
            ) => Render;
          };
        }
      ).modelReview;
      return names.map((pose) =>
        api.renderReview(35, 320, 440, "all", pose, 0.18),
      );
    },
    [...poseNames],
  );
  const posePlate = new PNG({ width: 960, height: 1320 });
  poses.forEach((pose, i) => paste(posePlate, pose, i % 3, Math.floor(i / 3)));
  await writeFile(new URL("poses.png", output), PNG.sync.write(posePlate));
  console.log("Saved nine rig poses.");
  // Exercise the actual controls as well as the offscreen review renderer.
  await page.locator("#model-animate").evaluate((element: HTMLInputElement) => {
    element.checked = false;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.selectOption("#model-pose", "Run");
  await page
    .locator("#model-rig")
    .evaluate((element: HTMLInputElement) => element.click());
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>("#ben-3d")?.dataset.pose === "Run",
  );
  console.log("Run control checked.");
  await page.selectOption("#model-reference", "2");
  await page
    .locator("#model-align")
    .evaluate((element: HTMLButtonElement) => element.click());
  await page
    .locator("#model-overlay")
    .evaluate((element: HTMLInputElement) => element.click());
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>("#ben-3d")?.dataset.angle === "90",
  );
  console.log("Reference alignment checked.");
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  const report = {
    tolerancePixels: config.reviewTolerancePixels,
    projection: "32 × 44 orthographic; one world unit per sprite pixel",
    metrics,
    poseOrder: [...poseNames],
    browserErrors: errors,
    mobileOverflow: overflow,
  };
  await writeFile(
    new URL("metrics.json", output),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  if (
    errors.length ||
    overflow ||
    metrics.some((metric) => !metric.withinTolerance)
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
