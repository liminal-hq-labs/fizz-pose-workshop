// Solves fixed-length two-bone chains and periodic foot trajectories for reusable side-view rigs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export type Vec2 = readonly [number, number];
export type Chain = readonly [Vec2, Vec2, Vec2];
export const tau = Math.PI * 2;
export const radians = (degrees: number): number => degrees * Math.PI / 180;
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (t: number): number => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
export function wrap(t: number): number {
  if (!Number.isFinite(t)) throw new Error('Rig time must be finite.');
  return ((t % 1) + 1) % 1;
}
export function rotate([x, y]: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle), s = Math.sin(angle); return [x * c - y * s, x * s + y * c];
}
export function add(a: Vec2, b: Vec2): Vec2 { return [a[0] + b[0], a[1] + b[1]]; }
export function distance(a: Vec2, b: Vec2): number { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
export function forwardChain(root: Vec2, upper: number, lower: number, upperAngle: number, elbowAngle: number): Chain {
  const elbow = add(root, [upper * Math.sin(upperAngle), upper * Math.cos(upperAngle)]);
  // Both sides keep the same anatomical bend direction throughout the swing.
  const forearmAngle = upperAngle + Math.PI - elbowAngle;
  return [root, elbow, add(elbow, [lower * Math.sin(forearmAngle), lower * Math.cos(forearmAngle)])];
}
export function solveTwoBone(root: Vec2, target: Vec2, upper: number, lower: number, bendDirection = 1): Chain {
  const dx = target[0] - root[0], dy = target[1] - root[1], raw = Math.hypot(dx, dy);
  if (raw < 1e-8 || upper <= 0 || lower <= 0) throw new Error('Invalid two-bone chain.');
  const reach = Math.min(upper + lower - 1e-6, Math.max(Math.abs(upper - lower) + 1e-6, raw));
  const ux = dx / raw, uy = dy / raw;
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  // The pole selects a stable bend side: forward knees or elbows beneath an aimed hand.
  const knee: Vec2 = [root[0] + along * ux + height * uy * bendDirection, root[1] + along * uy - height * ux * bendDirection];
  return [root, knee, [root[0] + reach * ux, root[1] + reach * uy]];
}
export function bezier(points: readonly Vec2[], t: number): Vec2 {
  let work = points.map(p => [p[0], p[1]] as Vec2);
  while (work.length > 1) work = work.slice(0, -1).map((p, i) => [lerp(p[0], work[i + 1][0], t), lerp(p[1], work[i + 1][1], t)]);
  return work[0];
}
