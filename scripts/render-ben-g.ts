// Renders high-resolution toon stills of the exported cartoon Ben from his GLB viewer.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { chromium } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** One still: a clip held at `time` seconds, seen from `yaw` and `pitch` radians at `dist` metres. */
export interface BenGStill {
  readonly name: string;
  readonly clip: string;
  readonly time: number;
  readonly yaw: number;
  readonly pitch?: number;
  readonly dist?: number;
  readonly look?: number;
  readonly sky?: "dusk" | "day" | "studio";
}
export const benGStills: readonly BenGStill[] = [
  { name: "hero-stand", clip: "Stand", time: 0.4, yaw: 0.55, dist: 5.2 },
  { name: "portrait", clip: "Stand", time: 0.4, yaw: 0.35, pitch: 0.05, dist: 2.3, look: 1.28, sky: "day" },
  { name: "run", clip: "Run", time: 0.18, yaw: -1.15, dist: 5.4, sky: "day" },
  { name: "pogo", clip: "Pogo", time: 0.55, yaw: -0.8, dist: 6, look: 1.0, sky: "day" },
  { name: "stunner", clip: "Fire", time: 0.3, yaw: -1.1, dist: 5.6 },
  { name: "reload", clip: "Reload", time: 1.5, yaw: -0.75, dist: 4.2, look: 1.0 },
  { name: "head-scratch", clip: "HeadScratch", time: 0.3, yaw: 0.4, dist: 4.8 },
  { name: "helmet-spin", clip: "HelmetSpin", time: 0.5, yaw: 0.5, dist: 5, look: 0.95 },
  { name: "ledge-pull", clip: "LedgePull", time: 3.3, yaw: -0.95, dist: 6, look: 1.0, sky: "studio" },
];

/** The viewer with the GLB embedded, so it opens from disk or any static host without a fetch. */
export async function standaloneViewer(): Promise<string> {
  const root = new URL("../", import.meta.url),
    html = await readFile(new URL("prototypes/ben-g/glb-viewer.html", root), "utf8"),
    glb = await readFile(new URL("models/ben-g/ben-g.glb", root));
  const marker = '<script type="importmap">';
  if (!html.includes(marker)) throw new Error("The viewer has no import map to anchor the embedded model.");
  return html.replace(marker, `<script>window.BEN_GLB_BASE64="${glb.toString("base64")}";</script>\n${marker}`);
}

if (import.meta.main) {
  const output = new URL("../models/ben-g/renders/", import.meta.url), size = Number(process.env.RENDER_SIZE ?? 900);
  await mkdir(output, { recursive: true });
  const page_file = join(tmpdir(), `ben-g-viewer-${process.pid}.html`);
  await writeFile(page_file, await standaloneViewer());
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 2 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const still of benGStills) {
      const query = new URLSearchParams({ ui: "0", hold: "1", clip: still.clip, t: String(still.time), yaw: String(still.yaw), pitch: String(still.pitch ?? 0.12), dist: String(still.dist ?? 5.6), look: String(still.look ?? 0.82), sky: still.sky ?? "dusk" });
      await page.goto(`${pathToFileURL(page_file).href}?${query}`);
      await page.waitForFunction(() => "viewerReady" in window);
      await page.evaluate(() => (window as unknown as { viewerReady: Promise<boolean> }).viewerReady);
      await page.waitForTimeout(600);
      await page.locator("#gl").screenshot({ path: new URL(`${still.name}.png`, output).pathname });
    }
    if (errors.length) throw new Error("Browser errors: " + errors.join("; "));
    console.log(`Saved ${benGStills.length} stills at ${size * 2} pixels square in models/ben-g/renders/.`);
  } finally {
    await browser.close();
    await rm(page_file, { force: true });
  }
}
