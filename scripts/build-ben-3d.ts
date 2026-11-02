// Exports a reusable rigged Three.js model, glTF binary and named pose animations.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { createBenModel } from "../src/model-3d/model.ts";
import { createBenClips } from "../src/model-3d/poses.ts";
import { installThreeToolRuntime } from "./three-runtime.ts";
import config from "../source/ben-3d.json";

installThreeToolRuntime();
const root = new URL("../", import.meta.url),
  svg = await readFile(new URL("source/ben-3d-skins.svg", root), "utf8"),
  model = createBenModel(svg),
  clips = createBenClips(model);
model.root.animations = clips;
const output = new URL("models/ben-3d/", root);
await mkdir(output, { recursive: true });
const glb = await new GLTFExporter().parseAsync(model.root, {
  binary: true,
  animations: clips,
  onlyVisible: false,
  trs: true,
  copyright: "2026 Liminal HQ, Scott Morris — Apache-2.0 OR MIT",
});
if (!(glb instanceof ArrayBuffer))
  throw new Error("Expected a binary glTF export.");
await writeFile(new URL("ben.glb", output), new Uint8Array(glb));
await writeFile(
  new URL("rig.json", output),
  JSON.stringify(
    {
      ...config,
      meshCount: model.meshes.length,
      bones: model.skeleton.bones.map((b) => b.name),
      animations: clips.map((c) => ({ name: c.name, duration: c.duration })),
    },
    null,
    2,
  ) + "\n",
);
await writeFile(new URL("skins.svg", output), svg);
model.dispose();
console.log(
  `Exported rigged Ben: ${config.bones.length} bones, ${clips.length} clips, ${(glb.byteLength / 1024).toFixed(0)} KiB GLB.`,
);
