// Binds palette-indexed skin patches and outlined limbs to a continuous side-view rig.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { paintFacingBody, paintIdleProps, paintStandingIdle } from './performance-skin.ts';
import { reflectPose } from '../src/rig/reflect.ts';
import { sampleRig, sampleTime } from '../src/rig/sample.ts';

import { add, rotate, tiltOffset, type Chain, type Vec2 } from '../src/rig/kinematics.ts';
import { validateRig, type RigFoot, type RigPose, type SideRig } from '../src/rig/run.ts';
import type { Frame, Frames } from '../src/types.ts';

export interface PixelRow { x: number; y: number; pixels: string; }
/**
 * Layers a saved standing sprite for an idle performance. Coordinates are patch-local (the saved sprite's own pixels). Rows
 * above `kneeRow` ride the pelvis. Rows above `chestRow` lean as one rigid block (shifted by the lean at that row, so the
 * helmet never shears apart) and rows above `neckRow` also roll about the neck. Lower rows stay planted, so a one-pixel dip
 * drops the knee row (the knees soften) and a rise repeats it.
 */
export interface StandingIdleLayers {
  neckRow: number; chestRow: number; kneeRow: number;
  /** The saved mouth, painted skin colour while whistling. */
  mouth: number[][];
  /** The two-pixel red pucker at the front of the face. */
  pucker: number[][];
  /** The lower-lip pixel under the pucker: light grey when relaxed, red when the lips push out to blow a note. */
  lip: number[];
  /** The visible blue eye pixels, which turn light grey for a blink. */
  eyes: number[][];
  /** Replacement rows for the planted shoes while the near toe lifts off the ground. */
  toeUp: PixelRow[];
}
export interface Patch { anchor: number[]; rows: PixelRow[]; towards?: PixelRow[]; away?: PixelRow[]; }
export interface RigSkin {
  name: string; head: Patch; torso: Patch;
  standingLeft: Patch; standingRight: Patch; standingIdle: { left: StandingIdleLayers; right: StandingIdleLayers }; headFront: Patch; headBack: Patch; torsoFront: Patch; torsoBack: Patch;
  /** The holstered Stunner seen from behind, in the back torso's coordinates, on Ben's right hip (the viewer's right). */
  stunnerBack: Patch; cameraShoe: Patch; backShoe: Patch; phoneBack: Patch;
  face: { eye: string; mouth: string; ear: string };
  shoe: { badge?: {point:number[];colour:string}; anchor: number[]; toe: number[]; ball: number[]; flexX: number; rows: PixelRow[]; farRows: PixelRow[] };
  weapon: { anchor: number[]; pixels: string[] };
  stunner: { anchor: number[]; pixels: string[]; hipOffset: number[] };
  palette: { outline: string; shirt: string; shirtShadow: string; skin: string; skinShadow: string; denim: string; denimSeam: string; shoe: string; shoeHighlight: string; sole: string; farSole: string };
}
export class Pixels {
  readonly rows: string[][];
  constructor(readonly width: number, readonly height: number) { this.rows = Array.from({ length: height }, () => Array<string>(width).fill('.')); }
  pixel(x: number, y: number, code: string): void {
    if (code === '.') return;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) throw new Error(`Rig skin clips at ${x},${y}.`);
    this.rows[y][x] = code;
  }
  erase(x: number, y: number): void { if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.rows[y][x] = '.'; }
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
  /**
   * When set, rotated patches keep their ink outline: nearest-neighbour rotation can skip a stair step of the one-pixel
   * outline, so any drawn pixel whose source pixel was fully enclosed in its patch, but which now touches empty canvas, gets
   * ink in that empty neighbour. Only existing palette codes are written. The run and firing references keep plain rotation.
   */
  sealRotations = false;
  patch(patch: Patch, target: Vec2, angle: number, turn = 0): void {
    this.draw(patch, turn, angle !== 0, (x, y) => {
      const local = rotate([x - target[0], y - target[1]], -angle);
      return [Math.round(local[0] + patch.anchor[0]), Math.round(local[1] + patch.anchor[1])];
    });
  }
  /** Draws a patch through an explicit canvas-to-patch pixel map, for layered whole-sprite idles. */
  mapped(patch: Patch, map: (x: number, y: number) => readonly [number, number]): void { this.draw(patch, 0, false, map); }
  /** Draws a head patch rolled by `angle` as a whole-pixel row shear about its anchor (see `tiltOffset`). */
  tiltPatch(patch: Patch, target: Vec2, angle: number, turn = 0): void {
    this.draw(patch, turn, angle !== 0, (x, y) => {
      const dy = y - target[1];
      return [Math.round(x - target[0] - tiltOffset(dy, angle) + patch.anchor[0]), Math.round(dy + patch.anchor[1])];
    });
  }
  private draw(patch: Patch, turn: number, transformed: boolean, map: (x: number, y: number) => readonly [number, number]): void {
    const variants = turn < -.45 ? patch.towards : turn > .45 ? patch.away : undefined;
    const source = new Map(patch.rows.map(row => [row.y, row]));
    variants?.forEach(row => source.set(row.y, row));
    const read = (sx: number, sy: number): string => { const row = source.get(sy); return row && sx >= row.x && sx < row.x + row.pixels.length ? row.pixels[sx - row.x] : '.'; };
    const seal = this.sealRotations && transformed, enclosed: number[] = [], drawn = new Set<number>();
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      const [sx, sy] = map(x, y), code = read(sx, sy);
      if (code === '.') continue;
      this.pixel(x, y, code);
      if (!seal) continue;
      drawn.add(y * this.width + x);
      if (code !== 'k' && read(sx - 1, sy) !== '.' && read(sx + 1, sy) !== '.' && read(sx, sy - 1) !== '.' && read(sx, sy + 1) !== '.') enclosed.push(y * this.width + x);
    }
    for (const index of enclosed) {
      const x = index % this.width, y = (index - x) / this.width;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx >= 0 && ny >= 0 && nx < this.width && ny < this.height && !drawn.has(ny * this.width + nx) && this.rows[ny][nx] === '.') this.rows[ny][nx] = 'k';
      }
    }
  }
  /**
   * Inks one-pixel notches between rows `top` and `bottom`: empty pixels closed in on three or four sides, where a limb's
   * outline meets the collar or shirt and leaves a pinhole in the silhouette. Wider gaps are real negative space and stay.
   */
  closeNotches(top: number, bottom: number): void {
    const filled = (x: number, y: number): boolean => (this.rows[y]?.[x] ?? '.') !== '.';
    const notches: [number, number][] = [];
    for (let y = Math.max(0, top); y <= Math.min(this.height - 1, bottom); y++) for (let x = 0; x < this.width; x++) {
      if (!filled(x, y) && [filled(x - 1, y), filled(x + 1, y), filled(x, y - 1), filled(x, y + 1)].filter(Boolean).length >= 3) notches.push([x, y]);
    }
    for (const [x, y] of notches) this.rows[y][x] = 'k';
  }
  frame(): Frame { return { width: this.width, height: this.height, grid: this.rows.map(row => row.join('')) }; }
}
export function paintArm(out: Pixels, chain: Chain, skin: RigSkin, near: boolean, sleeveSlide = 0): void {
  const colours = skin.palette, [shoulder, elbow, hand] = chain;
  out.segment(chain, 2, near ? colours.skin : colours.skinShadow, colours.outline);
  // The sleeve covers the upper half of the upper arm; cloth follow-through slides its cuff a pixel along the bone.
  const length = Math.hypot(elbow[0] - shoulder[0], elbow[1] - shoulder[1]), reach = Math.max(.15, Math.min(.95, .5 + sleeveSlide / length));
  const cuff: Vec2 = [shoulder[0] + (elbow[0] - shoulder[0]) * reach, shoulder[1] + (elbow[1] - shoulder[1]) * reach];
  out.segment([shoulder, cuff], 2, near ? colours.shirt : colours.shirtShadow);
  out.pixel(Math.round(hand[0]), Math.round(hand[1]), colours.skinShadow);
}
export function paintFoot(out: Pixels, foot: RigFoot, skin: RigSkin, near: boolean): void {
  const rows = new Map((near ? skin.shoe.rows : skin.shoe.farRows).map(row => [row.y, row]));
  const heightScale = 1 - foot.compression;
  const read = (x: number, y: number): string => { const row = rows.get(y); return row && x >= row.x && x < row.x + row.pixels.length ? row.pixels[x - row.x] : '.'; };
  // A pointed or tucked performance foot rotates far enough to skip outline pixels, so it is sealed like a rotated patch.
  // Off the ground, the sole no longer rests on anything, so it is inked like the rest of the shoe's edge.
  const seal = out.sealRotations && (foot.pitch !== 0 || foot.toePitch !== 0), drawn = new Set<number>(), enclosed: number[] = [];
  const sole = Math.max(...rows.keys()), solid = (x: number, y: number): boolean => read(x, y) !== '.' || (y === sole + 1 && read(x, sole) !== '.');
  const draw = (x: number, y: number, sx: number, sy: number): void => {
    const code = read(sx, sy); if (code === '.') return;
    out.pixel(x, y, code);
    if (!seal) return;
    drawn.add(y * out.width + x);
    if (code !== 'k' && solid(sx - 1, sy) && solid(sx + 1, sy) && solid(sx, sy - 1) && solid(sx, sy + 1)) enclosed.push(y * out.width + x);
  };
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const local = rotate([x - foot.ankle[0], y - foot.ankle[1]], -foot.pitch);
    const sx = Math.round(local[0] + skin.shoe.anchor[0]);
    const sy = Math.round(skin.shoe.ball[1] + (local[1] + skin.shoe.anchor[1] - skin.shoe.ball[1]) / heightScale);
    if (sx < skin.shoe.flexX) draw(x, y, sx, sy);
    const front = rotate([x - foot.ball[0], y - foot.ball[1]], -foot.toePitch);
    const tx = Math.round(front[0] + skin.shoe.ball[0]);
    const ty = Math.round(skin.shoe.ball[1] + front[1] / heightScale);
    if (tx >= skin.shoe.flexX) draw(x, y, tx, ty);
  }
  // Ink never goes below the shoe's lowest row: a sole that is nearly flat faces the ground it is about to land on.
  const bottom = Math.max(-1, ...[...drawn].map(index => Math.floor(index / out.width)));
  for (const index of enclosed) {
    const x = index % out.width, y = (index - x) / out.width;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx >= 0 && ny >= 0 && nx < out.width && ny <= bottom && !drawn.has(ny * out.width + nx) && out.rows[ny][nx] === '.') out.rows[ny][nx] = 'k';
    }
  }
  if(near&&skin.shoe.badge){
    const centre=shoeBadgePoint(foot,skin),candidates:{x:number;y:number;distance:number}[]=[];
    for(let y=Math.round(centre[1])-1;y<=Math.round(centre[1])+1;y++)for(let x=Math.round(centre[0])-1;x<=Math.round(centre[0])+1;x++)if(/[Rr]/.test(out.rows[y]?.[x]??'.'))candidates.push({x,y,distance:(x-centre[0])**2+(y-centre[1])**2});
    candidates.sort((a,b)=>a.distance-b.distance||a.y-b.y||a.x-b.x);
    const target=candidates[0];if(target)out.pixel(target.x,target.y,skin.shoe.badge.colour);
  }
}
export function shoeBadgePoint(foot:RigFoot,skin:RigSkin):Vec2{
 const point=skin.shoe.badge?.point??[0,0],height=skin.shoe.ball[1]+(point[1]-skin.shoe.ball[1])*(1-foot.compression);
 return add(foot.ankle,rotate([point[0],height],foot.pitch));
}
/**
 * The shirt patch with its cloth state applied: the hem row (directly above the belt) flares one shirt pixel past its back
 * or front outline. Only that row changes, so the collar, emblem, belt and Stunner keep their authored pixels.
 */
export function clothedTorso(rig: SideRig, skin: RigSkin, pose: RigPose): Patch {
  const hem = rig.clothing?.hem, cloth = pose.cloth;
  if (!hem || !cloth || (!cloth.hemBack && !cloth.hemFront)) return skin.torso;
  const flare = (row: PixelRow): PixelRow => {
    if (row.y !== hem.row) return row;
    let { x, pixels } = row;
    if (cloth.hemBack) { pixels = pixels[0] + pixels[1] + pixels.slice(1); x -= 1; }
    if (cloth.hemFront) pixels = pixels.slice(0, -1) + pixels[pixels.length - 2] + pixels[pixels.length - 1];
    return { x, y: row.y, pixels };
  };
  return { ...skin.torso, rows: skin.torso.rows.map(flare), towards: skin.torso.towards?.map(flare), away: skin.torso.away?.map(flare) };
}
const stunnerSwingDegrees = 35;
function paintStunner(out: Pixels, pose: RigPose, skin: RigSkin, leg: Chain = pose.nearLeg): void {
  const [hip, knee] = leg;
  const thigh = Math.atan2(knee[0] - hip[0], knee[1] - hip[1]);
  // The holster hangs from the belt: in performances it follows the thigh only within a limited swing, so a raised knee
  // cannot fold it up behind the shirt and arm.
  const limit = stunnerSwingDegrees * Math.PI / 180, angle = pose.presentation ? Math.max(-limit, Math.min(limit, thigh)) : thigh;
  const anchor = add(hip, [skin.stunner.hipOffset[0], skin.stunner.hipOffset[1]]);
  const rows = skin.stunner.pixels.map((pixels, y) => ({ x: 0, y, pixels }));
  // Local y points down the thigh, so the sprite patch rotates by the negative leg angle.
  out.patch({ anchor: skin.stunner.anchor, rows }, anchor, -angle);
}
export function skinRig(rig: SideRig, skin: RigSkin, pose: RigPose, farStunner = false): Frame {
  if (rig.mirrored || rig.facing === 'left') {
    // A plain mirror copies the Stunner to the other hip. A left-facing rig keeps it on Ben's right hip, which faces away
    // from the camera, so the right-facing render hangs it on the far hip behind the body before the whole sprite turns.
    const frame = skinRig({...rig,mirrored:false,facing:'right'},skin,reflectPose(pose,rig.width),rig.facing === 'left');
    return {...frame,grid:frame.grid.map(row=>[...row].reverse().join(''))};
  }
  const out = new Pixels(rig.width, rig.height), colours = skin.palette;
  // Performance rigs roll the head and lean the torso well past the run's few degrees, so their rotated patches keep their ink.
  out.sealRotations = Boolean(pose.presentation);
  if (pose.presentation?.standing) {paintStandingIdle(out, rig, skin, pose); return out.frame();}
  if (pose.presentation && pose.presentation.view !== 'side') {
    paintFacingBody(out, rig, skin, pose); out.closeNotches(pose.face.pixelAnchor[1], pose.face.pixelAnchor[1] + 4); return out.frame();
  }
  if (pose.pogo) {
    const p = pose.pogo;
    out.segment([p.shaftTop, p.springTop], 1, 'L', 'k');
    out.segment(p.pegs, 1, 'L', 'k');
    out.segment([[p.shaftTop[0] - 3, p.shaftTop[1]], [p.shaftTop[0] + 3, p.shaftTop[1]]], 1, 'D', 'k');
    const spring: Vec2[] = [p.springTop];
    for (let i = 1; i < 6; i++) spring.push([p.tip[0] + (i % 2 ? -1 : 1), p.springTop[1] + p.springLength * i / 6]);
    spring.push(p.tip); out.segment(spring, 1, 'L');
    out.pixel(Math.round(p.tip[0]), Math.round(p.tip[1]), 'k');
  }
  // A far-side Stunner is drawn first, so the far leg, torso and near limbs cover it and only what truly peeks out shows.
  if (farStunner && !pose.weapon) paintStunner(out, pose, skin, pose.farLeg);
  out.segment(pose.farLeg, 2, colours.denim, colours.outline); paintFoot(out, pose.farFoot, skin, false);
  paintArm(out, pose.farArm, skin, false, pose.cloth?.farSleeve);
  out.segment(pose.nearLeg, 2, colours.denim, colours.outline);
  out.segment(pose.nearLeg, 1, colours.denimSeam);
  paintFoot(out, pose.nearFoot, skin, true);
  out.patch(clothedTorso(rig, skin, pose), pose.root, pose.torsoAngle, pose.torsoTurn);
  // A performance knee raised above the hip (climbing onto a ledge, tucking in a fall) passes in front of the shirt.
  if (pose.presentation && pose.nearLeg[1][1] < pose.nearLeg[0][1] + 2) {
    out.segment(pose.nearLeg, 2, colours.denim, colours.outline); out.segment(pose.nearLeg, 1, colours.denimSeam); paintFoot(out, pose.nearFoot, skin, true);
  }
  if (!pose.weapon && !farStunner) paintStunner(out, pose, skin);
  paintArm(out, pose.nearArm, skin, true, pose.cloth?.nearSleeve);
  if (pose.weapon) {
    out.patch({ anchor: skin.weapon.anchor, rows: skin.weapon.pixels.map((pixels, y) => ({x: 0, y, pixels})) }, pose.weapon.grip, pose.weapon.angle);
    if (pose.weapon.flash) {
      const [x, y] = pose.weapon.muzzle.map(Math.round);
      out.pixel(x + 1, y, 'y'); out.pixel(x + 2, y, 'W'); out.pixel(x + 2, y - 1, 'C'); out.pixel(x + 2, y + 1, 'C'); out.pixel(x + 3, y, 'C');
    }
  }
  out.tiltPatch(skin.head, pose.face.pixelAnchor, pose.headAngle ?? 0, pose.headTurn);
  if (!pose.face.noseVisible) { out.erase(...pose.face.noseTip.pixel); out.pixel(...pose.face.nose.pixel, 'k'); }
  out.pixel(pose.face.ear.pixel[0], pose.face.ear.pixel[1], skin.face.ear);
  for (const point of pose.face.eyePixels) out.pixel(point[0], point[1], skin.face.eye);
  for (const point of pose.face.mouthPixels) out.pixel(point[0], point[1], skin.face.mouth);
  // A startled side-view face drops its jaw: the mouth opens one pixel downwards.
  if (pose.presentation?.expression === 'startled') for (const point of pose.face.mouthPixels) out.pixel(point[0], point[1] + 1, skin.face.mouth);
  paintIdleProps(out, skin, pose);
  if (pose.presentation) out.closeNotches(pose.face.pixelAnchor[1], pose.face.pixelAnchor[1] + 4);
  return out.frame();
}
export function sampleRigSprites(rig: SideRig, skin: RigSkin, prefix = 'ben_walkRight'): Frames {
  validateRig(rig);
  return Object.fromEntries(Array.from({ length: rig.sampleCount }, (_, i) => [prefix + (i + 1), skinRig(rig, skin, sampleRig(rig, sampleTime(rig, i)))]));
}
