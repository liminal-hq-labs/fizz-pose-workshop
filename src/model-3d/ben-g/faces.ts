// The cartoon Ben's expressions and gaze for each pose.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Fig } from "./types.ts";
import { eachSide } from "./poses.ts";

/* ---------- faces: brows, lids and mouth move together ---------- */
export const poseFaces: Record<string, string> = {
  stand: "smile",
  run: "smile",
  pogo: "smile",
  fire: "determined",
  jump: "shout",
  fall: "worried",
  climb: "determined",
  ledge: "worried",
  whistle: "whistle",
  phone: "smile",
  wipeout: "shout",
  wrist: "smile",
  tip: "determined",
  scratch: "worried",
  rock: "whistle",
  spin: "smile",
  aerial: "smile",
  draw: "smile",
  reload: "determined",
};
export const poseGazes: Record<string, number[]> = {
  wrist: [0.55, -1],
  phone: [0, -1],
  tip: [0, 0.35],
  scratch: [-0.5, 0.9],
  climb: [0, 0.8],
  ledge: [0, 1],
  pogo: [0, -0.4],
  fall: [0, -0.8],
  rock: [0.6, 0.3],
  whistle: [0.5, 0.5],
  spin: [-0.6, 0.8],
  aerial: [0.55, -0.9],
  reload: [0, -0.7],
  draw: [-0.3, 0],
};
export const gazes: Record<string, number[]> = {
  centre: [0, 0],
  left: [1, 0],
  right: [-1, 0],
  up: [0, 1],
  down: [0, -1],
};
const faces: Record<string, [string, number, number, number]> = {
  smile: ["smile", -0.06, 0, 0],
  whistle: ["o", -0.12, 0.2, 0],
  shout: ["open", -0.1, 0.3, 0],
  determined: ["grit", 0.42, -0.34, 1],
  worried: ["frown", -0.42, 0.22, 0],
};
/** Sets the mouth, eyebrows and eyelids for an expression and turns the irises towards `gaze` (x to his left, y up). */
export function applyFace(f: Fig, name: string, gaze: readonly number[] = [0, 0]): void {
  const F = faces[name] || faces.smile;
  const X = f.X;
  Object.keys(X.mouths).forEach((k) => {
    X.mouths[k].visible = k === F[0];
  });
  eachSide((s) => {
    X.iris[s].position.set(gaze[0] * 0.2, gaze[1] * 0.24, 0);
  });
  eachSide((s) => {
    X.brows[s].rotation.z = s * F[1];
    X.brows[s].position.y = X.brows[s].userData.y + F[2];
    X.lids[s].visible = !!F[3];
  });
}
