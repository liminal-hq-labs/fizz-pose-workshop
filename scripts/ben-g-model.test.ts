// Checks the exported cartoon Ben glTF binary: its skeleton, skinned body and one clip per pose.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import metadata from "../models/ben-g/ben-g.json";
import { benGClips, benGFramesPerSecond } from "./build-ben-g.ts";

interface Gltf {
  asset: { version: string };
  nodes: { name?: string; mesh?: number; skin?: number }[];
  skins: { joints: number[] }[];
  animations: { name: string; channels: { target: { path: string } }[] }[];
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
});
