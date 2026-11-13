// Solves two-bone limbs in figure space for the cartoon Ben.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as T from "three";
import type { Fig } from "./types.ts";
import { V } from "./shared.ts";

/* ---------- two-bone IK in figure space ---------- */
function basisQ(d: T.Vector3, hint: T.Vector3, sign: number): T.Quaternion {
  const Y = d.clone().multiplyScalar(-1);
  const Z = hint.clone().addScaledVector(Y, -hint.dot(Y));
  if (Z.lengthSq() < 1e-6) {
    Z.set(0, 0, 1).addScaledVector(Y, -Y.z);
    if (Z.lengthSq() < 1e-6) Z.set(1, 0, 0);
  }
  Z.normalize().multiplyScalar(sign);
  const X = new T.Vector3().crossVectors(Y, Z);
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(X, Y, Z));
}
export function solveLimb(
  fig: Fig,
  upper: T.Object3D,
  lower: T.Object3D,
  a: number,
  b: number,
  target: T.Vector3,
  hint: T.Vector3,
  sign: number,
): T.Quaternion {
  const p = fig.loc(upper);
  const Qp = fig.locQ(upper.parent!);
  const to = target.clone().sub(p);
  const d = to.length();
  const dc = Math.min(Math.max(d, Math.abs(a - b) + 0.05), a + b - 0.02);
  const dir = d > 1e-5 ? to.multiplyScalar(1 / d) : V(0, -1, 0);
  const along = (a * a - b * b + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(a * a - along * along, 0));
  const perp = hint.clone().addScaledVector(dir, -hint.dot(dir));
  if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
  perp.normalize();
  const e = p.clone().addScaledVector(dir, along).addScaledVector(perp, h);
  const end = p.clone().addScaledVector(dir, dc);
  const Q1 = basisQ(e.clone().sub(p).normalize(), perp, sign);
  const Q2 = basisQ(end.sub(e).normalize(), perp, sign);
  upper.quaternion.copy(Qp.invert().multiply(Q1));
  lower.quaternion.copy(Q1.clone().invert().multiply(Q2));
  return Q2;
}
/** A quaternion from XYZ Euler angles in radians. */
export const eulerQuaternion = function (x: number, y: number, z: number) {
  return new T.Quaternion().setFromEuler(new T.Euler(x, y, z, "XYZ"));
};
