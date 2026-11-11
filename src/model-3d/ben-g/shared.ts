// Shared maths shorthands, the toon ramp, the ink material and the model scale for the cartoon Ben.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as T from "three";
import { eachSide } from "./poses.ts";

export const PI = Math.PI;
export const sin = Math.sin;
export const cos = Math.cos;
export const max = Math.max;
export const toonRamp = (function () {
  const d = new Uint8Array([120, 120, 120, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  const t = new T.DataTexture(d, 3, 1, T.RGBAFormat);
  t.minFilter = t.magFilter = T.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
/** The shared ink material: a back-facing shell drawn slightly larger than each outlined part. */
export const inkMaterial = new T.MeshBasicMaterial({ color: 0x0a0a12, side: T.BackSide });
/** World metres per sprite pixel: Ben is modelled in pixels and stands about 1.55 m tall. */
export const benGScale = 0.05;
export const V = function (x: number, y: number, z: number) {
  return new T.Vector3(x, y, z);
};
