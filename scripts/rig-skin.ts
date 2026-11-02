// Binds palette-indexed skin patches and outlined limbs to a continuous side-view rig.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { add, rotate, type Chain, type Vec2 } from '../src/rig/kinematics.ts';
import { sampleRunRig, validateRig, type RigFoot, type RigPose, type SideRig } from '../src/rig/run.ts';
import type { Frame, Frames } from '../src/types.ts';

interface PixelRow { x: number; y: number; pixels: string; }
interface Patch { anchor: number[]; rows: PixelRow[]; towards?: PixelRow[]; away?: PixelRow[]; }
export interface RigSkin {
  name: string; head: Patch; torso: Patch;
  face: { eye: string; mouth: string; ear: string };
  shoe: { anchor: number[]; toe: number[]; ball: number[]; flexX: number; rows: PixelRow[]; farRows: PixelRow[] };
  stunner: { anchor: number[]; pixels: string[]; hipOffset: number[] };
  palette: { outline: string; shirt: string; shirtShadow: string; skin: string; skinShadow: string; denim: string; denimSeam: string; shoe: string; shoeHighlight: string; sole: string; farSole: string };
}
class Pixels {
  readonly rows: string[][];
  constructor(readonly width: number, readonly height: number) { this.rows = Array.from({ length: height }, () => Array<string>(width).fill('.')); }
  pixel(x: number, y: number, code: string): void {
    if (code === '.') return;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) throw new Error(`Rig skin clips at ${x},${y}.`);
    this.rows[y][x] = code;
  }
  segment(points: readonly Vec2[], width: number, code: string, outline?: string): void {
    for (const [thickness, fill] of (outline ? [[width + 2, outline], [width, code]] : [[width, code]]) as [number, string][]) {
      for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1], points[i]], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 3));
        for (let n = 0; n <= steps; n++) {
          const x = Math.round(a[0] + (b[0] - a[0]) * n / steps) - Math.floor(thickness / 2);
          const y = Math.round(a[1] + (b[1] - a[1]) * n / steps) - Math.floor(thickness / 2);
          for (let yy = 0; yy < thickness; yy++) for (let xx = 0; xx < thickness; xx++) this.pixel(x + xx, y + yy, fill);
        }
      }
    }
  }
  patch(patch: Patch, target: Vec2, angle: number, turn = 0): void {
    const variants = turn < -.45 ? patch.towards : turn > .45 ? patch.away : undefined;
    const source = new Map(patch.rows.map(row => [row.y, row]));
    variants?.forEach(row => source.set(row.y, row));
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      const local = rotate([x - target[0], y - target[1]], -angle);
      const sx = Math.round(local[0] + patch.anchor[0]), sy = Math.round(local[1] + patch.anchor[1]);
      const row = source.get(sy); if (row && sx >= row.x && sx < row.x + row.pixels.length) this.pixel(x, y, row.pixels[sx - row.x]);
    }
  }
  frame(): Frame { return { width: this.width, height: this.height, grid: this.rows.map(row => row.join('')) }; }
}
function paintArm(out: Pixels, chain: Chain, skin: RigSkin, near: boolean): void {
  const colours = skin.palette, [shoulder, elbow, hand] = chain;
  out.segment(chain, 2, near ? colours.skin : colours.skinShadow, colours.outline);
  const cuff: Vec2 = [(shoulder[0] + elbow[0]) / 2, (shoulder[1] + elbow[1]) / 2];
  out.segment([shoulder, cuff], 2, near ? colours.shirt : colours.shirtShadow);
  out.pixel(Math.round(hand[0]), Math.round(hand[1]), colours.skinShadow);
}
function paintFoot(out: Pixels, foot: RigFoot, skin: RigSkin, near: boolean): void {
  const rows = new Map((near ? skin.shoe.rows : skin.shoe.farRows).map(row => [row.y, row]));
  const heightScale = 1 - foot.compression;
  const read = (x: number, y: number): string => { const row = rows.get(y); return row && x >= row.x && x < row.x + row.pixels.length ? row.pixels[x - row.x] : '.'; };
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const local = rotate([x - foot.ankle[0], y - foot.ankle[1]], -foot.pitch);
    const sx = Math.round(local[0] + skin.shoe.anchor[0]);
    const sy = Math.round(skin.shoe.ball[1] + (local[1] + skin.shoe.anchor[1] - skin.shoe.ball[1]) / heightScale);
    if (sx < skin.shoe.flexX) out.pixel(x, y, read(sx, sy));
    const front = rotate([x - foot.ball[0], y - foot.ball[1]], -foot.toePitch);
    const tx = Math.round(front[0] + skin.shoe.ball[0]);
    const ty = Math.round(skin.shoe.ball[1] + front[1] / heightScale);
    if (tx >= skin.shoe.flexX) out.pixel(x, y, read(tx, ty));
  }
}
function paintStunner(out: Pixels, pose: RigPose, skin: RigSkin): void {
  const [hip, knee] = pose.nearLeg;
  const angle = Math.atan2(knee[0] - hip[0], knee[1] - hip[1]);
  const anchor = add(hip, [skin.stunner.hipOffset[0], skin.stunner.hipOffset[1]]);
  const rows = skin.stunner.pixels.map((pixels, y) => ({ x: 0, y, pixels }));
  // Local y points down the thigh, so the sprite patch rotates by the negative leg angle.
  out.patch({ anchor: skin.stunner.anchor, rows }, anchor, -angle);
}
export function skinRig(rig: SideRig, skin: RigSkin, pose: RigPose): Frame {
  const out = new Pixels(rig.width, rig.height), colours = skin.palette;
  out.segment(pose.farLeg, 2, colours.denim, colours.outline); paintFoot(out, pose.farFoot, skin, false);
  paintArm(out, pose.farArm, skin, false);
  out.segment(pose.nearLeg, 2, colours.denim, colours.outline);
  out.segment(pose.nearLeg, 1, colours.denimSeam);
  paintFoot(out, pose.nearFoot, skin, true);
  out.patch(skin.torso, pose.root, pose.torsoAngle, pose.torsoTurn);
  paintStunner(out, pose, skin); paintArm(out, pose.nearArm, skin, true);
  out.patch(skin.head, pose.face.pixelAnchor, 0, pose.headTurn);
  out.pixel(pose.face.ear.pixel[0], pose.face.ear.pixel[1], skin.face.ear);
  out.pixel(pose.face.eye.pixel[0], pose.face.eye.pixel[1], skin.face.eye);
  out.pixel(pose.face.mouth.pixel[0], pose.face.mouth.pixel[1], skin.face.mouth);
  return out.frame();
}
export function sampleRigSprites(rig: SideRig, skin: RigSkin, prefix = 'ben_walkRight'): Frames {
  validateRig(rig);
  return Object.fromEntries(Array.from({ length: rig.sampleCount }, (_, i) => [prefix + (i + 1), skinRig(rig, skin, sampleRunRig(rig, i / rig.sampleCount))]));
}
