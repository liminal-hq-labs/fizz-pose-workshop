// Checks the exported cartoon Ben glTF binary: its skeleton, skinned body and one clip per pose.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import metadata from "../models/ben-g/ben-g.json";
import { benGClips } from "../src/model-3d/ben-g/dump.ts";
import { benGFiles, benGFramesPerSecond } from "./build-ben-g.ts";

interface Gltf {
  asset: { version: string };
  nodes: { name?: string; mesh?: number; skin?: number }[];
  skins: { joints: number[] }[];
  animations: { name: string; channels: { target: { path: string } }[] }[];
  materials: { name?: string; doubleSided?: boolean; extensions?: { KHR_materials_unlit?: object } }[];
  extensionsUsed?: string[];
}

/** Reads the JSON chunk of a glTF binary without a loader. */
async function readGlb(url: URL): Promise<Gltf> {
  const bytes = await readFile(url), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(8, true)).toBe(bytes.byteLength);
  expect(view.getUint32(16, true)).toBe(0x4e4f534a);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
}

test("the cartoon Ben GLB carries his skeleton, skinned body and every pose as a clip", async () => {
  const gltf = await readGlb(new URL("../models/ben-g/ben-g.glb", import.meta.url));
  expect(gltf.asset.version).toBe("2.0");
  // Torso, two arms and two legs are skinned to the same seventeen joints.
  const skinned = gltf.nodes.filter((node) => node.skin !== undefined && node.mesh !== undefined);
  expect(skinned).toHaveLength(5);
  for (const skin of gltf.skins) expect(skin.joints).toHaveLength(17);
  const jointNames = new Set(gltf.skins[0].joints.map((i) => gltf.nodes[i].name?.replace(/^n\d+_/, "")));
  for (const bone of metadata.bones) expect(jointNames.has(bone)).toBe(true);
  expect(gltf.animations.map((clip) => clip.name)).toEqual(benGClips.map((clip) => clip.name));
  for (const clip of gltf.animations) expect(clip.channels.some((channel) => channel.target.path === "rotation")).toBe(true);
  expect(metadata.framesPerSecond).toBe(benGFramesPerSecond);
  expect(metadata.animations.map((clip) => clip.name)).toEqual(benGClips.map((clip) => clip.name));
  // The lit file leaves shading and ink to the engine.
  expect(gltf.materials.some((material) => material.name === "Ink")).toBe(false);
});

test("the baked cartoon GLB needs no lights: unlit colours and an ink shell for each skinned part", async () => {
  const gltf = await readGlb(new URL("../models/ben-g/ben-g-toon.glb", import.meta.url));
  expect(benGFiles.map((entry) => entry.file)).toEqual(["ben-g.glb", "ben-g-toon.glb"]);
  expect(gltf.extensionsUsed).toContain("KHR_materials_unlit");
  for (const material of gltf.materials) expect(material.extensions?.KHR_materials_unlit).toBeDefined();
  // Double-sided and see-through surfaces get their own variants of the same three looks.
  expect([...new Set(gltf.materials.map((material) => material.name))].sort()).toEqual(["Ink", "Toon", "ToonGlass"]);
  // Every ink shell is single-sided, so back-face culling leaves only its outline.
  expect(gltf.materials.find((material) => material.name === "Ink")?.doubleSided ?? false).toBe(false);
  // Each of the five skinned body parts has its own skinned shell.
  expect(gltf.nodes.filter((node) => node.skin !== undefined && node.mesh !== undefined)).toHaveLength(10);
  expect(gltf.animations.map((clip) => clip.name)).toEqual(benGClips.map((clip) => clip.name));
});
