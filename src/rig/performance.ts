// Interpolates authored action goals through continuous splines and solves fixed-length limbs for expressive sprite studies.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { add, radians, rotate, solveTwoBone, tiltPixel, wrap, type Vec2, type Chain } from './kinematics.ts';
import { sampleFace, type FaceLandmark, type FacePose } from './face.ts';
import { torsoPoint, type RigFoot, type RigPose, type SideRig } from './run.ts';

export type Expression = 'normal' | 'startled' | 'grit' | 'tongue' | 'dizzy' | 'wince' | 'out' | 'whistle';
export interface PerformanceKey {
  nearFootDegrees?: number; farFootDegrees?: number;
  phase: number; root: number[]; lean: number; headRoll: number;
  nearHand: number[]; farHand: number[]; nearAnkle: number[]; farAnkle: number[];
  expression: Expression; nearSupport: boolean; farSupport: boolean; phone?: number[];
  /** The motion comes to rest on this key (anticipation, impact or a held pose) instead of carrying velocity through it. */
  hold?: boolean;
  /** A deliberate comic beat: the pose snaps to this key and rests on it, so head roll or lean may swing across zero here. */
  beat?: boolean;
}
export interface PerformanceSettings {
  view: 'side' | 'back' | 'front'; standing?: 'left' | 'right'; loop: boolean; keys: PerformanceKey[];
  /** Phases of the saved sprite samples. Keys need not sit on them; omitted means evenly spaced samples. */
  sampleTimes?: number[];
  environment?: { kind: 'ladder' | 'ledge'; x: number; y: number; width: number; spacing: number };
}

type Limb = 'nearHand' | 'farHand' | 'nearAnkle' | 'farAnkle';
interface Curve { readonly phases: readonly number[]; readonly values: readonly number[]; readonly slopes: readonly number[]; }

/**
 * Builds a monotone cubic Hermite curve through scalar keys (Fritsch–Butland tangents for uneven spacing). Velocity carries
 * through each key, but the curve never overshoots a key, so held values stay still, limb reach stays within the keyed
 * reach and a pinned grip never drifts. Loops use periodic neighbours across the seam; one-shot clips start and end at rest.
 */
export function monotoneCurve(phases: readonly number[], values: readonly number[], loop: boolean, rests: readonly boolean[] = []): Curve {
  const n = phases.length, slopes = new Array<number>(n).fill(0);
  const secant = (i: number): [number, number] => {
    // Segment i runs from key i to key i + 1; loops reuse the segment before the seam for the first key.
    const [a, b] = i < 0 ? [n - 2, n - 1] : [i, i + 1];
    const h = phases[b] - phases[a]; return [h, (values[b] - values[a]) / h];
  };
  for (let i = 0; i < n; i++) {
    if (rests[i]) continue;
    const before = i > 0 ? secant(i - 1) : loop && n > 2 ? secant(-1) : null;
    const after = i < n - 1 ? secant(i) : loop && n > 2 ? secant(0) : null;
    if (!before || !after) continue;
    const [h0, d0] = before, [h1, d1] = after;
    if (d0 * d1 <= 0) continue;
    slopes[i] = 3 * (h0 + h1) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
  }
  if (loop && n > 2) slopes[n - 1] = slopes[0] = rests[0] || rests[n - 1] ? 0 : slopes[0];
  return { phases, values, slopes };
}
export function evaluateCurve(curve: Curve, t: number): number {
  const { phases, values, slopes } = curve, last = phases.length - 1;
  if (t <= phases[0]) return values[0];
  if (t >= phases[last]) return values[last];
  const i = Math.max(0, phases.findLastIndex(phase => phase <= t)), h = phases[i + 1] - phases[i], s = (t - phases[i]) / h;
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * values[i] + (s3 - 2 * s2 + s) * h * slopes[i] + (-2 * s3 + 3 * s2) * values[i + 1] + (s3 - s2) * h * slopes[i + 1];
}

function foot(ankle: Vec2, supported: boolean, rig: SideRig, angle = 0): RigFoot {
  return {ankle, ball: add(ankle, rotate([rig.feet.ball[0], rig.feet.ball[1]], angle)), toe: add(ankle, rotate([rig.feet.toe[0], rig.feet.toe[1]], angle)), heel: add(ankle, rotate([rig.feet.heel[0], rig.feet.heel[1]], angle)), pitch: angle, toePitch: angle, compression: 0, stance: supported, progress: 0};
}
interface Body { neck: Vec2; nearShoulder: Vec2; farShoulder: Vec2; nearHip: Vec2; farHip: Vec2; }
function body(rig: SideRig, root: Vec2, torsoAngle: number): Body {
  const base = {root, torsoAngle};
  return {
    neck: torsoPoint(base, [0, -rig.torso.neckHeight]),
    nearShoulder: torsoPoint(base, [-rig.torso.shoulderSpread, rig.torso.shoulderY]), farShoulder: torsoPoint(base, [rig.torso.shoulderSpread, rig.torso.shoulderY]),
    nearHip: add(root, [-rig.legs.hipSpread, 0]), farHip: add(root, [rig.legs.hipSpread, 0]),
  };
}
const origins: Record<Limb, keyof Body> = { nearHand: 'nearShoulder', farHand: 'farShoulder', nearAnkle: 'nearHip', farAnkle: 'farHip' };

/** Curves for one clip, built once per settings object so sampling stays allocation-light. */
interface ClipCurves {
  scalar: Record<'rootX' | 'rootY' | 'lean' | 'headRoll' | 'nearFoot' | 'farFoot', Curve>;
  limbs: Record<Limb, { x: Curve; y: Curve; angle: Curve; reach: Curve; grounded: readonly boolean[] }>;
  phone?: { from: number; x: Curve; y: Curve };
}
const cache = new WeakMap<PerformanceSettings, { torso: SideRig['torso']; legs: SideRig['legs']; curves: ClipCurves }>();
function clipCurves(rig: SideRig, clip: PerformanceSettings): ClipCurves {
  const known = cache.get(clip); if (known && known.torso === rig.torso && known.legs === rig.legs) return known.curves;
  const { keys, loop } = clip, phases = keys.map(key => key.phase), rests = keys.map(key => Boolean(key.hold || key.beat));
  const curve = (values: number[]): Curve => monotoneCurve(phases, values, loop, rests);
  const bodies = keys.map(key => body(rig, [key.root[0], key.root[1]], radians(key.lean)));
  const limb = (name: Limb): ClipCurves['limbs'][Limb] => {
    // Each limb target is also keyed as an angle and reach about its shoulder or hip, so free limbs swing on arcs. Angles
    // unwrap along the keys so a swing never takes the long way round.
    const polar = keys.map((key, i) => { const origin = bodies[i][origins[name]]; return [Math.atan2(key[name][1] - origin[1], key[name][0] - origin[0]), Math.hypot(key[name][0] - origin[0], key[name][1] - origin[1])]; });
    for (let i = 1; i < polar.length; i++) while (Math.abs(polar[i][0] - polar[i - 1][0]) > Math.PI) polar[i][0] -= Math.sign(polar[i][0] - polar[i - 1][0]) * 2 * Math.PI;
    return {
      x: curve(keys.map(key => key[name][0])), y: curve(keys.map(key => key[name][1])),
      angle: curve(polar.map(([angle]) => angle)), reach: curve(polar.map(([, reach]) => reach)),
      // A target keyed at the same canvas point on both ends of a segment is a grip or planted foot and stays put, and a foot
      // supported on both keys slides along its support. Both follow the canvas curve instead of an arc.
      grounded: keys.slice(0, -1).map((key, i) => {
        const next = keys[i + 1], support = name === 'nearAnkle' ? 'nearSupport' : name === 'farAnkle' ? 'farSupport' : null;
        return (key[name][0] === next[name][0] && key[name][1] === next[name][1]) || (support !== null && key[support] && next[support]);
      }),
    };
  };
  const phoneFrom = keys.findIndex(key => key.phone);
  let phone: ClipCurves['phone'];
  if (phoneFrom >= 0) {
    const held = keys.slice(phoneFrom), heldPhases = held.map(key => key.phase), heldRests = held.map(key => Boolean(key.hold || key.beat));
    phone = { from: keys[phoneFrom].phase, x: monotoneCurve(heldPhases, held.map(key => key.phone?.[0] ?? held[0].phone![0]), false, heldRests), y: monotoneCurve(heldPhases, held.map(key => key.phone?.[1] ?? held[0].phone![1]), false, heldRests) };
  }
  const curves: ClipCurves = {
    scalar: {
      rootX: curve(keys.map(key => key.root[0])), rootY: curve(keys.map(key => key.root[1])), lean: curve(keys.map(key => key.lean)), headRoll: curve(keys.map(key => key.headRoll)),
      nearFoot: curve(keys.map(key => key.nearFootDegrees ?? 0)), farFoot: curve(keys.map(key => key.farFootDegrees ?? 0)),
    },
    limbs: { nearHand: limb('nearHand'), farHand: limb('farHand'), nearAnkle: limb('nearAnkle'), farAnkle: limb('farAnkle') },
    phone,
  };
  cache.set(clip, { torso: rig.torso, legs: rig.legs, curves });
  return curves;
}

/**
 * The skin draws a rolled head as a whole-pixel row shear, so the facial pixels follow the same shear from their upright
 * head-space positions. Continuous landmark positions keep the true rotation for inspection.
 */
function tiltedFace(face: FacePose, upright: FacePose, angle: number): FacePose {
  const anchor = upright.pixelAnchor, pixel = (point: Vec2): Vec2 => tiltPixel(anchor, [point[0] - anchor[0], point[1] - anchor[1]], angle);
  const landmark = (rolled: FaceLandmark, flat: FaceLandmark): FaceLandmark => ({ ...rolled, pixel: pixel(flat.pixel) });
  return { ...face, eye: landmark(face.eye, upright.eye), mouth: landmark(face.mouth, upright.mouth), ear: landmark(face.ear, upright.ear), nose: landmark(face.nose, upright.nose), noseTip: landmark(face.noseTip, upright.noseTip), cheek: landmark(face.cheek, upright.cheek), chin: landmark(face.chin, upright.chin), eyePixels: upright.eyePixels.map(pixel), mouthPixels: upright.mouthPixels.map(pixel) };
}

export function samplePerformance(rig: SideRig, time: number): RigPose {
  const clip = rig.performance; if (!clip || !Number.isFinite(time)) throw new Error('Performance rig requires finite time and action goals.');
  const t = clip.loop ? wrap(time) : Math.max(0, Math.min(1, time));
  const keys = clip.keys, curves = clipCurves(rig, clip), at = (curve: Curve): number => evaluateCurve(curve, t);
  const index = Math.min(keys.length - 2, Math.max(0, keys.findLastIndex(key => key.phase <= t)));
  // Discrete choices (expression, support) switch on the key that starts the segment; the final key owns phase 1.
  const a = t >= keys[keys.length - 1].phase ? keys[keys.length - 1] : keys[index];
  const root: Vec2 = [at(curves.scalar.rootX), at(curves.scalar.rootY)], torsoAngle = radians(at(curves.scalar.lean)), headAngle = radians(at(curves.scalar.headRoll));
  const joints = body(rig, root, torsoAngle);
  const target = (name: Limb): Vec2 => {
    const limb = curves.limbs[name];
    if (limb.grounded[index]) return [at(limb.x), at(limb.y)];
    const origin = joints[origins[name]], angle = at(limb.angle), reach = at(limb.reach);
    return [origin[0] + Math.cos(angle) * reach, origin[1] + Math.sin(angle) * reach];
  };
  const solve = (origin: Vec2, goal: Vec2, upper: number, lower: number, pole: number): Chain => {
    const chain = solveTwoBone(origin, goal, upper, lower, pole);
    if (Math.hypot(chain[2][0] - goal[0], chain[2][1] - goal[1]) > 1e-5) throw new Error(`${rig.motion} goal exceeds reach at phase ${t.toFixed(3)}: ${origin} → ${goal}.`);
    return chain;
  };
  const nearArm = solve(joints.nearShoulder, target('nearHand'), rig.arms.upperLength, rig.arms.forearmLength, -1);
  const farArm = solve(joints.farShoulder, target('farHand'), rig.arms.upperLength, rig.arms.forearmLength, clip.view === 'side' ? -1 : 1);
  const nearLeg = solve(joints.nearHip, target('nearAnkle'), rig.legs.thighLength, rig.legs.shinLength, clip.view === 'side' ? 1 : -1);
  const farLeg = solve(joints.farHip, target('farAnkle'), rig.legs.thighLength, rig.legs.shinLength, 1);
  const nearFoot = foot(nearLeg[2], a.nearSupport, rig, radians(at(curves.scalar.nearFoot))), farFoot = foot(farLeg[2], a.farSupport, rig, radians(at(curves.scalar.farFoot)));
  const phone: Vec2 | undefined = curves.phone && t >= curves.phone.from ? [evaluateCurve(curves.phone.x, t), evaluateCurve(curves.phone.y, t)] : undefined;
  const noteX = clip.standing === 'left' ? [1,4] : [25,28];
  const notes: Vec2[] | undefined = rig.motion === 'whistle' ? [[noteX[0], 12 - 3 * Math.sin(t * Math.PI * 2)], [noteX[1], 7 - 2 * Math.cos(t * Math.PI * 2)]] : undefined;
  const face = tiltedFace(sampleFace(joints.neck, 0, rig.face, t, headAngle), sampleFace(joints.neck, 0, rig.face, t), headAngle);
  return { time: t, root, torsoAngle, torsoTurn: 0, headTurn: 0, headAngle, neck: joints.neck, face, nearArm, farArm, nearLeg, farLeg, nearFoot, farFoot,
    contact: a.nearSupport && a.farSupport ? 'both' : a.nearSupport ? 'near' : a.farSupport ? 'far' : 'flight',
    presentation: {view: clip.view, standing: clip.standing, expression: a.expression, environment: clip.environment, cameraShoes: rig.motion === 'death', phone, notes},
  };
}
