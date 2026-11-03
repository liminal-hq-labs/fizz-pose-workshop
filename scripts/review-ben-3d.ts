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
import { defaultHeadStyle, headStyles } from "../src/model-3d/head.ts";

type Render = { width: number; height: number; pixels: number[] };
type View = {
  angle: number;
  all: Render;
  head: Render;
  helmet: Render;
  shoes: Render;
  image: string;
};
type Bounds = { width: number; height: number; top: number; bottom: number };
type Check =
  | "height"
  | "headWidth"
  | "torsoWidth"
  | "helmetWidth"
  | "shoeWidth"
  | "shoeHeight";
// Each check uses the shared pixel tolerance unless the model deliberately departs from the sprite there.
const checks = config.reviewChecks as Partial<
  Record<Check, { min: number; max: number; reason: string }>
>;
const range = (check: Check): { min: number; max: number } =>
  checks[check] ?? {
    min: -config.reviewTolerancePixels,
    max: config.reviewTolerancePixels,
  };
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
function decodeCapture(url: string): Render {
  const image = PNG.sync.read(Buffer.from(url.split(",")[1], "base64")),
    pixels = new Array<number>(image.width * image.height * 4);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width * 4; x++)
      pixels[(image.height - 1 - y) * image.width * 4 + x] =
        image.data[y * image.width * 4 + x];
  return { width: image.width, height: image.height, pixels };
}
const root = new URL("../", import.meta.url),
  output = new URL("models/ben-3d/review/", root);
await mkdir(output, { recursive: true });
const data: WorkshopData = JSON.parse(
  await readFile(new URL("assets.json", root), "utf8"),
);
const actions = [
  {
    // Reach for the hip, draw, aim, fire with the flash, recoil and reholster.
    pose: "Firing",
    file: "firing-cycle.png",
    angle: 60,
    phases: [0.14, 0.26, 0.42, 0.5, 0.56, 0.86],
  },
  {
    pose: "Jump",
    file: "jump-cycle.png",
    angle: 60,
    phases: [0.12, 0.24, 0.4, 0.53, 0.72, 0.88],
  },
  {
    pose: "Fall",
    file: "fall-cycle.png",
    angle: 40,
    phases: [0, 0.17, 0.33, 0.5, 0.67, 0.83],
  },
  {
    pose: "Climb",
    file: "climb-cycle.png",
    angle: 30,
    phases: [0, 0.17, 0.33, 0.5, 0.67, 0.83],
  },
  {
    // Touchdown, the deepest squash, the drive, lift-off, the apex tuck and the reach down, in both profiles: the
    // posing reference for the right- and left-facing pogo sprites.
    pose: "Pogo",
    file: "pogo-cycle-right.png",
    angle: 90,
    phases: [0, 0.11, 0.24, 0.38, 0.58, 0.8],
  },
  {
    pose: "Pogo",
    file: "pogo-cycle-left.png",
    angle: 270,
    phases: [0, 0.11, 0.24, 0.38, 0.58, 0.8],
  },
  {
    pose: "Look up",
    file: "look-up-cycle.png",
    angle: 0,
    phases: [0, 0.18, 0.4, 0.6, 0.8, 0.98],
  },
  {
    pose: "Look down",
    file: "look-down-cycle.png",
    angle: 0,
    phases: [0, 0.18, 0.4, 0.6, 0.8, 0.98],
  },
];
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
  await page.evaluate(() => {
    const api = (
      document.querySelector("#ben-3d") as HTMLElement & {
        modelReview: {
          renderer: {
            shadowMap: { enabled: boolean };
            setPixelRatio: (ratio: number) => void;
          };
        };
      }
    ).modelReview;
    api.renderer.shadowMap.enabled = false;
    api.renderer.setPixelRatio(1);
  });
  // Each build is reviewed in turn: the current model's plates stay in `review/`, the hybrid's go in
  // `review/hybrid/`, where it also gets perspective views from the front, sides, back and below.
  const reviews: { build: string; metrics: unknown[]; withinTolerance: boolean }[] = [];
  for (const build of ["current", "hybrid"] as const) {
  const output = new URL(
    build === "current" ? "models/ben-3d/review/" : "models/ben-3d/review/hybrid/",
    root,
  );
  await mkdir(output, { recursive: true });
  await page.evaluate((id) => {
    (
      document.querySelector("#ben-3d") as HTMLElement & {
        modelReview: { setBuild: (id: string) => void };
      }
    ).modelReview.setBuild(id);
  }, build);
  console.log(`Reviewing the ${build} build.`);
  const views = (await page.evaluate(
    (angles) => {
      const api = (
        document.querySelector("#ben-3d") as HTMLElement & {
          modelReview: {
            captureReview: (
              angle: number,
              width: number,
              height: number,
              part?: string,
              pose?: string,
              time?: number,
            ) => string;
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
        head: api.renderReview(angle, 32, 44, "head"),
        helmet: api.renderReview(angle, 32, 44, "helmet"),
        shoes: api.renderReview(angle, 32, 44, "shoes"),
        image: api.captureReview(angle, 320, 440),
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
    const sourceHelmet = bounds(
        (x, y) => sourceMask(x, y) && frame.grid[y][x] !== "k",
        2,
        8,
      ),
      helmet = renderedBounds(view.helmet);
    const sourceShoes = bounds(
        (x, y) => sourceMask(x, y) && frame.grid[y][x] !== "k",
        30,
        34,
      ),
      shoes = renderedBounds(view.shoes);
    paste(plate, decodeCapture(view.image), i, 0);
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
    const differences: Record<Check, number> = {
      height: actual.height - source.height,
      headWidth:
        bounds(
          (x, y) => view.head.pixels[((43 - y) * 32 + x) * 4 + 3] >= 128,
          9,
          13,
        ).width - bounds(sourceMask, 9, 13).width,
      torsoWidth:
        bounds(
          (x, y) => view.all.pixels[((43 - y) * 32 + x) * 4 + 3] >= 128,
          15,
          23,
        ).width -
        bounds((x, y) => sourceMask(x, y) && frame.grid[y][x] !== "k", 15, 23)
          .width,
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
      withinTolerance: (Object.entries(differences) as [Check, number][]).every(
        ([check, value]) =>
          value >= range(check).min && value <= range(check).max,
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
            captureReview: (
              angle: number,
              width: number,
              height: number,
              part?: string,
              pose?: string,
              time?: number,
            ) => string;
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
        api.captureReview(35, 320, 440, "all", pose, 0.18),
      );
    },
    [...poseNames],
  );
  const posePlate = new PNG({
    width: 960,
    height: Math.ceil(poseNames.length / 3) * 440,
  });
  poses.forEach((pose, i) =>
    paste(posePlate, decodeCapture(pose), i % 3, Math.floor(i / 3)),
  );
  await writeFile(new URL("poses.png", output), PNG.sync.write(posePlate));
  const runFrames = await page.evaluate(() => {
    const api = (
      document.querySelector("#ben-3d") as HTMLElement & {
        modelReview: {
          captureReview: (
            angle: number,
            width: number,
            height: number,
            part: string,
            pose: string,
            time: number,
          ) => string;
        };
      }
    ).modelReview;
    return Array.from({ length: 6 }, (_, i) =>
      api.captureReview(90, 320, 440, "all", "Run", i / 6),
    );
  });
  const runPlate = new PNG({ width: 1920, height: 440 });
  runFrames.forEach((capture, i) =>
    paste(runPlate, decodeCapture(capture), i, 0),
  );
  await writeFile(new URL("run-cycle.png", output), PNG.sync.write(runPlate));
  for (const action of actions) {
    const images = await page.evaluate((action) => {
      const api = (
        document.querySelector("#ben-3d") as HTMLElement & {
          modelReview: {
            captureReview: (
              angle: number,
              width: number,
              height: number,
              part: string,
              pose: string,
              time: number,
            ) => string;
          };
        }
      ).modelReview;
      return action.phases.map((phase) =>
        api.captureReview(action.angle, 320, 440, "all", action.pose, phase),
      );
    }, action);
    const plate = new PNG({ width: 1920, height: 440 });
    images.forEach((capture, i) => paste(plate, decodeCapture(capture), i, 0));
    await writeFile(new URL(action.file, output), PNG.sync.write(plate));
  }
  console.log("Saved rig poses and timed action cycles.");
  // The hybrid: perspective views from the front, three-quarter, side, back and two from below, framed
  // on the whole figure and then on the neck, collar and shoulders.
  if (build === "hybrid") {
    const angles = [
      { eye: [0, 16, 62], look: [0, 15, 0] },
      { eye: [-44, 16, 44], look: [0, 15, 0] },
      { eye: [-62, 16, 0], look: [0, 15, 0] },
      { eye: [0, 16, -62], look: [0, 15, 0] },
      { eye: [-30, -6, 48], look: [0, 17, 0] },
      { eye: [24, -6, -50], look: [0, 17, 0] },
    ];
    for (const [file, frame, fov] of [
      ["hybrid-angles.png", 0, 30],
      ["hybrid-neck-angles.png", 1, 9],
    ] as const) {
      const images = await page.evaluate(
        ({ angles, frame, fov }) => {
          const api = (
            document.querySelector("#ben-3d") as HTMLElement & {
              modelReview: {
                captureView: (
                  eye: readonly number[],
                  look: readonly number[],
                  pose: string,
                  phase: number,
                  width: number,
                  height: number,
                  fov: number,
                ) => string;
              };
            }
          ).modelReview;
          return angles.map((a) =>
            api.captureView(
              a.eye,
              frame ? [0, 20.6, -0.2] : a.look,
              "Standing",
              0,
              320,
              440,
              fov,
            ),
          );
        },
        { angles, frame, fov },
      );
      const plate = new PNG({ width: 1920, height: 440 });
      images.forEach((capture, i) => paste(plate, decodeCapture(capture), i, 0));
      await writeFile(new URL(file, output), PNG.sync.write(plate));
    }
    console.log("Saved hybrid perspective plates.");
  }
  reviews.push({
    build,
    metrics,
    withinTolerance: metrics.every((metric) => metric.withinTolerance),
  });
  if (build === "hybrid") break;
  // One plate per head style: front, three-quarter and right profile, framed on the head and shoulders.
  for (const style of headStyles) {
    const images = await page.evaluate((id) => {
      const api = (
        document.querySelector("#ben-3d") as HTMLElement & {
          modelReview: {
            setHeadStyle: (id: string) => void;
            captureReview: (
              angle: number,
              width: number,
              height: number,
              part?: string,
              pose?: string,
              time?: number,
            ) => string;
          };
        }
      ).modelReview;
      api.setHeadStyle(id);
      return [0, 35, 90].map((angle) => api.captureReview(angle, 960, 1320));
    }, style.id);
    // At three times the plate scale (30 pixels per unit), crop to the head, neck and collar.
    const crop = { x: 285, y: 60, width: 360, height: 420 },
      plate = new PNG({ width: crop.width * 3, height: crop.height });
    images.forEach((capture, i) => {
      const render = decodeCapture(capture);
      for (let y = 0; y < crop.height; y++)
        for (let x = 0; x < crop.width; x++) {
          const from =
              ((render.height - 1 - (crop.y + y)) * render.width + crop.x + x) *
              4,
            to = (y * plate.width + i * crop.width + x) * 4;
          for (let c = 0; c < 4; c++)
            plate.data[to + c] = render.pixels[from + c];
        }
    });
    await writeFile(
      new URL(`head-style-${style.id}.png`, output),
      PNG.sync.write(plate),
    );
  }
  await page.evaluate((id) => {
    (
      document.querySelector("#ben-3d") as HTMLElement & {
        modelReview: { setHeadStyle: (id: string) => void };
      }
    ).modelReview.setHeadStyle(id);
  }, defaultHeadStyle.id);
  console.log("Saved head-style plates.");
  }
  await page.locator("#model-animate").evaluate((element: HTMLInputElement) => {
    element.checked = true;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  for (const action of actions) {
    await page.selectOption("#model-pose", action.pose);
    await page.waitForFunction(
      (pose) =>
        document.querySelector<HTMLElement>("#ben-3d")?.dataset.pose === pose,
      action.pose,
    );
    const previous = await page.locator("#ben-3d").getAttribute("data-phase");
    await page.waitForFunction(
      ({ pose, previous }) => {
        const node = document.querySelector<HTMLElement>("#ben-3d");
        return node?.dataset.pose === pose && node.dataset.phase !== previous;
      },
      { pose: action.pose, previous },
    );
  }
  console.log("Firing and look playback controls checked.");
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
    relaxedChecks: checks,
    projection: "32 × 44 orthographic; one world unit per sprite pixel",
    referenceMasks: {
      helmet: "Coloured helmet and rim, excluding the black sprite outline",
      torso: "Clothing and arms, excluding the black sprite outline",
      shoes: "Coloured uppers and soles, excluding the black sprite outline",
      head: "Head meshes only, excluding the fitted helmet",
      overall: "Complete sprite envelope",
    },
    actionCycles: actions,
    runPhases: Array.from({ length: 6 }, (_, i) => i / 6),
    poseOrder: [...poseNames],
    browserErrors: errors,
    mobileOverflow: overflow,
  };
  for (const review of reviews) {
    const folder = review.build === "current" ? "" : review.build + "/";
    await writeFile(
      new URL(`models/ben-3d/review/${folder}metrics.json`, root),
      JSON.stringify({ build: review.build, ...report, metrics: review.metrics }, null, 2) + "\n",
    );
  }
  console.log(JSON.stringify({ ...report, reviews }, null, 2));
  if (
    errors.length ||
    overflow ||
    reviews.some((review) => !review.withinTolerance)
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
