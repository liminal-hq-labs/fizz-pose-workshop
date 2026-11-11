// Checks the cartoon Ben model: his skeleton, every pose's reach and the dump the glTF build reads.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from "bun:test";
import { benGClips, dumpModel, poseForClip } from "./dump.ts";
import { benGSpec, buildRig, JOINTS, POSE, POSEFACE, SC } from "./model.ts";

// Cut vents are an alpha texture painted on a canvas, so headless builds use the mesh or painted vents.
const build = (): ReturnType<typeof buildRig> => buildRig(benGSpec({ vents: "mesh" }));

test("the figure has seventeen named bones and stands about 1.55 m tall", () => {
  const fig = build();
  expect(JOINTS).toHaveLength(17);
  for (const [name] of JOINTS) expect(fig.J[name]).toBeDefined();
  expect(fig.jointList).toHaveLength(17);
  poseForClip(fig, "stand", 0);
  fig.turn.updateMatrixWorld(true);
  const crown = fig.J._crown.getWorldPosition(fig.J.pelvis.position.clone());
  expect(crown.y).toBeGreaterThan(1.45);
  expect(crown.y).toBeLessThan(1.65);
  expect(fig.turn.scale.x).toBe(SC);
});

test("every pose has a clip and an expression, and keeps each limb within its bone lengths", () => {
  const fig = build(), { aU, aL, legU, legL } = fig.P;
  expect(benGClips.map((clip) => clip.pose).sort()).toEqual(Object.keys(POSE).sort());
  for (const clip of benGClips) {
    expect(POSEFACE[clip.pose]).toBeDefined();
    for (let step = 0; step <= 8; step++) {
      poseForClip(fig, clip.pose, (clip.duration * step) / 8);
      fig.turn.updateMatrixWorld(true);
      for (const joint of fig.jointList) for (const value of [...joint.quaternion.toArray(), ...joint.position.toArray()]) expect(Number.isFinite(value)).toBe(true);
      for (const side of [1, -1]) {
        const reach = (from: string, to: string): number => fig.loc(fig.J[from + side]).distanceTo(fig.loc(fig.J[to + side]));
        // The two-bone solve never stretches a leg past its bones. The arms hang from the chest, which swells and
        // squashes by a few percent as he breathes and bounces, so their lengths follow it within that margin.
        expect(reach("legU", "foot")).toBeLessThanOrEqual(legU + legL + 1e-3);
        expect(reach("legU", "legL")).toBeCloseTo(legU, 3);
        expect(reach("armU", "hand")).toBeLessThanOrEqual((aU + aL) * 1.08);
        expect(Math.abs(reach("armU", "armL") / aU - 1)).toBeLessThan(0.08);
      }
    }
  }
});

test("the dump records the tree once, with five skinned parts, their ink shells and a track set per clip", () => {
  const fig = build(), dump = dumpModel(fig, benGClips, 12);
  expect(dump.scale).toBe(SC);
  expect(dump.nodes[0].parent).toBe(-1);
  expect(dump.nodes.filter((node) => node.bone)).toHaveLength(17);
  const skinned = dump.nodes.filter((node) => node.mesh?.skinned);
  expect(skinned.filter((node) => !node.mesh!.ink)).toHaveLength(5);
  expect(skinned.filter((node) => node.mesh!.ink)).toHaveLength(5);
  for (const node of skinned) expect(node.mesh!.skin!.bones).toHaveLength(17);
  expect(dump.clips.map((clip) => clip.name)).toEqual(benGClips.map((clip) => clip.name));
  // The rest pose is the first frame of Stand, so that clip moves little; every other clip moves most of the body.
  for (const clip of dump.clips) expect(clip.tracks.length).toBeGreaterThan(clip.name === "Stand" ? 0 : 10);
  // The held helmets are export-only copies and are gone again afterwards.
  expect(fig.held).toBeNull();
});
