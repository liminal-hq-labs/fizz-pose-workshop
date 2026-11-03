// Draws front/back rig skins, comic facial expressions and idle props from action joints.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { add, tiltOffset, tiltPixel, type Chain, type Vec2 } from '../src/rig/kinematics.ts';
import type { RigPose, SideRig } from '../src/rig/run.ts';
import { paintArm, type Patch, type PixelRow, type Pixels, type RigSkin } from './rig-skin.ts';

function headPixel(pose: RigPose, local: Vec2): Vec2 {
  return tiltPixel(pose.face.pixelAnchor, local, pose.headAngle ?? 0);
}
export function paintFacingBody(out: Pixels, rig: SideRig, skin: RigSkin, pose: RigPose): void {
  const presentation = pose.presentation!, back = presentation.view === 'back', phone = presentation.phone, seated = Boolean(presentation.seated) && !back;
  // Seated, the seat sits behind everything and the crossed shins lie in front of the lower body, so the legs are drawn
  // after the shirt (see `paintSeatedLegs`).
  if (seated) { out.part = 'leg'; out.patch(skin.seatFront, pose.root, 0); }
  else {
    out.part = 'leg';
    for (const chain of [pose.farLeg, pose.nearLeg]) {
      out.segment(chain, 2, skin.palette.denim, 'k'); out.segment(chain, 1, 'c');
    }
    out.part = 'shoe';
    const shoe = presentation.cameraShoes ? skin.cameraShoe : skin.backShoe;
    for (const foot of [pose.farFoot, pose.nearFoot]) out.patch(shoe, foot.ankle, 0);
  }
  // Cloth follow-through slides each cuff along its upper arm, as in the side views.
  out.part = 'arm'; paintArm(out, pose.farArm, skin, false, pose.cloth?.farSleeve);
  out.part = 'shirt';
  const torso = back ? skin.torsoBack : skin.torsoFront, shirt = seated ? seatedTorso(torso, skin) : torso;
  out.patch(Math.round(presentation.breath ?? 0) >= 1 ? inhaled(shirt) : shirt, pose.root, pose.torsoAngle);
  if (seated) paintSeatedLegs(out, skin, pose);
  if (presentation.frontHolster && !back) {
    // Ben's right hip faces the camera's left; seated, the holster rests on top of that thigh beside the bunched hem.
    const holster = skin.holsterFront, offset = seated ? holster.seatedOffset : holster.standingOffset;
    out.part = 'prop'; out.patch(holster, add(pose.root, [offset[0], offset[1]]), 0);
  }
  out.part = 'arm'; paintArm(out, pose.nearArm, skin, true, pose.cloth?.nearSleeve);
  out.part = 'hand';
  // Hands remain in front of the belly or phone instead of being hidden by the shirt.
  if (!back && !phone) for (const hand of [pose.farArm[2], pose.nearArm[2]]) out.segment([hand, add(hand, [.6,0])], 1, 'W', 'k');
  out.part = 'head';
  out.tiltPatch(back ? skin.headBack : skin.headFront, pose.face.pixelAnchor, pose.headAngle ?? 0);
  if (!back) {
    out.part = 'face';
    const pixel = (x: number, y: number, colour: string): void => {const p=headPixel(pose,[x,y]);out.pixel(p[0],p[1],colour);};
    // The skin and neck between the helmet rim and the collar belong to the face, so data such as a light mask can find them.
    for (let y = -5; y <= -1; y++) for (let x = -4; x <= 4; x++) { const p = headPixel(pose, [x, y]), code = out.rows[p[1]]?.[p[0]] ?? '.'; if (/[WL]/.test(code)) out.pixel(p[0], p[1], code); }
    const expression = presentation.expression;
    // A blink closes both eyes to light-grey lids; a downward glance (at the phone) drops the eyes one row.
    const blink = (presentation.blink ?? 0) >= .5, down = (presentation.gaze ?? 0) >= .5 ? 1 : 0;
    if (expression === 'normal' && (blink || down)) for (const x of [-2,2]) pixel(x, -5 + down, blink ? skin.palette.skinShadow : 'B');
    else for (const x of [-2,2]) {
      if (expression === 'out' || expression === 'dizzy') {
        pixel(x-1,-6,'B');pixel(x+1,-6,'B');pixel(x,-5,'B');pixel(x-1,-4,'B');pixel(x+1,-4,'B');
      } else if (expression === 'wince') {pixel(x,-6,'k');pixel(x-1,-5,'k');pixel(x+1,-5,'k');}
      else {pixel(x,-5,'B');if(expression==='startled')pixel(x,-6,'B');if(expression==='grit')pixel(x,-6,'k');}
    }
    pixel(0,-4,'L');
    if (expression === 'startled') {pixel(0,-3,'k');pixel(0,-2,'R');pixel(1,-3,'R');}
    else if (expression === 'tongue' || expression === 'out') {pixel(-1,-3,'k');pixel(0,-3,'k');pixel(1,-3,'k');pixel(1,-2,'r');pixel(1,-1,'r');}
    else if (expression === 'grit' || expression === 'wince') {for(let x=-1;x<=1;x++){pixel(x,-3,'R');pixel(x,-2,'W');}}
    else {pixel(-1,-3,'R');pixel(0,-3,'R');pixel(1,-3,'R');}
  }
  if (phone) paintPhoneGrip(out, skin, pose, phone);
  out.part = 'prop';
  paintIdleProps(out, skin, pose);
  out.part = '';
  // Folded arms and crossed legs leave one-pixel pinholes between their outlines and the shirt; ink them.
  if (seated) out.closeNotches(pose.face.pixelAnchor[1], rig.groundY);
}

/** The chest row repeated by an inhale. */
const breathRow = 20;
/** An inhale deepens the chest by one row: the rows above `breathRow` rise with the neck while the belt stays on the seat. */
function inhaled(torso: Patch): Patch {
  const lift = (rows: readonly PixelRow[]): PixelRow[] => [...rows.map(row => row.y <= breathRow ? { ...row, y: row.y - 1 } : row), ...rows.filter(row => row.y === breathRow)];
  return { ...torso, rows: lift(torso.rows) };
}

/** The front shirt patch with its seated rows: the hem bunches over the belt as the seat presses into the ground. */
function seatedTorso(torso: Patch, skin: RigSkin): Patch {
  const replaced = new Map(skin.torsoFrontSeated.rows.map(row => [row.y, row]));
  return { ...torso, rows: torso.rows.map(row => replaced.get(row.y) ?? row) };
}

/** The back shin's seam: the darker cyan, so the front shin's light seam stays the nearer one. */
const backSeam = 'C';
/**
 * Cross-legged legs facing the camera, drawn over the shirt hem because the shins lie in front of the lower body. The
 * thighs run out from the seat to the knees first, then the back shin; the tucked feet come next, so each shoe shows
 * under the opposite knee; then the front shin (`shinOver`) crosses over the back one in an X in front of the seat. A
 * shin's ink outline over its own thigh makes the knee fold. The front shin carries the light denim seam and the back
 * shin a darker one, so both diagonals read and the front one stays nearer. Each foot is the side-view shoe pointing
 * along its shin (mirrored for a shin that runs to the camera's left), and the back foot uses the shaded far-shoe rows.
 */
function paintSeatedLegs(out: Pixels, skin: RigSkin, pose: RigPose): void {
  const legs = (pose.presentation!.shinOver ?? 'near') === 'near' ? [pose.farLeg, pose.nearLeg] : [pose.nearLeg, pose.farLeg];
  out.part = 'leg';
  for (const leg of legs) out.segment([leg[0], leg[1]], 2, skin.palette.denim, 'k');
  const [back, front] = legs, shin = (leg: Chain, seam: string): void => {
    out.part = 'leg'; out.segment([leg[1], leg[2]], 2, skin.palette.denim, 'k'); out.segment([leg[1], leg[2]], 1, seam);
  };
  shin(back, backSeam);
  out.part = 'shoe';
  legs.forEach((leg, i) => {
    const rows = i === 1 ? skin.shoe.rows : skin.shoe.farRows, ankle = leg[2], toRight = ankle[0] >= leg[1][0];
    const ax = Math.round(ankle[0]), ay = Math.round(ankle[1]);
    for (const row of rows) [...row.pixels].forEach((code, n) => { const local = row.x + n; out.pixel(ax + (toRight ? local : -local), ay + row.y, code); });
  });
  shin(front, skin.palette.denimSeam);
}

/**
 * The phone's screen faces Ben and its back case faces the camera. Each thumb rests on the screen, so it shows only where
 * it pokes up over the top edge; a thumb pressed down to tap or scroll (`taps`, near then far) drops behind the case. The hands hold the phone's sides,
 * with a finger wrapped round each side over the case.
 */
function paintPhoneGrip(out: Pixels, skin: RigSkin, pose: RigPose, phone: Vec2): void {
  const px = Math.round(phone[0]), py = Math.round(phone[1]), top = py - skin.phoneBack.anchor[1];
  const taps = pose.presentation!.taps ?? [0, 0];
  out.part = 'hand';
  for (const hand of [pose.farArm[2], pose.nearArm[2]]) out.segment([hand, add(hand, [.6,0])], 1, 'W', 'k');
  // Each thumb tip is one skin pixel capped with ink, poking over the phone's top edge.
  for (const [dx, tap] of [[-1, taps[0]], [1, taps[1]]] as const) if (tap < .5) {
    for (const [x, y] of [[dx, -2], [dx - 1, -1], [dx + 1, -1]]) out.pixel(px + x, top + y, 'k');
    out.pixel(px + dx, top - 1, 'W');
  }
  out.part = 'prop'; out.patch(skin.phoneBack, [px, py], 0);
  out.part = 'hand';
  const left = px - skin.phoneBack.anchor[0], right = left + 4;
  for (const x of [left, right]) { out.pixel(x, py, 'W'); out.pixel(x, py + 1, 'L'); }
}
export function paintIdleProps(out: Pixels, skin: RigSkin, pose: RigPose): void {
  if (pose.presentation?.expression === 'whistle') {
    const [x,y] = pose.face.mouth.pixel;
    out.pixel(x,y,'R');out.pixel(x+1,y,'R');out.pixel(x,y-1,'W');
  }
  for (const note of pose.presentation?.notes ?? []) {
    const x=Math.round(note[0]),y=Math.round(note[1]);
    for(const [dx,dy] of [[0,0],[1,0],[0,1],[1,1],[1,-1],[1,-2],[1,-3],[2,-3],[3,-2]])out.pixel(x+dx,y+dy,'c');
  }
}

/** A near foot pitched at least this far lifts its toe in a standing idle. */
const toeLiftRadians = 4 * Math.PI / 180;

/** How a standing idle pose places the saved standing sprite: which source row each canvas row shows and its sideways shift. */
interface StandingPlacement { readonly shiftX: number; readonly restY: number; readonly bob: number; sourceRow(y: number): number; offsetX(sy: number): number; }
function standingPlacement(rig: SideRig, skin: RigSkin, pose: RigPose): StandingPlacement {
  const side = pose.presentation!.standing!, art = side === 'left' ? skin.standingLeft : skin.standingRight, layers = skin.standingIdle[side];
  const shiftX = Math.round(rig.root[0]) - art.anchor[0], restY = Math.round(rig.root[1]) - art.anchor[1];
  const bob = Math.round(pose.root[1]) - Math.round(rig.root[1]), sway = Math.round(pose.root[0]) - Math.round(rig.root[0]);
  return {
    shiftX, restY, bob,
    // Rows above the knee ride the pelvis; a dip drops the knee row (the knees soften) and a rise repeats it.
    sourceRow: y => { const sy = y - restY; return sy < layers.kneeRow + bob ? sy - bob : Math.max(sy, layers.kneeRow); },
    offsetX: sy => sy >= layers.kneeRow ? 0 :
      sway + (sy < layers.chestRow ? tiltOffset(layers.chestRow - art.anchor[1], pose.torsoAngle) : 0) + (sy < layers.neckRow ? tiltOffset(sy - layers.neckRow, pose.headAngle ?? 0) : 0),
  };
}

/** Canvas pixels of the standing idle's lower lip and visible eyes for a pose, following its bob, lean and head roll. */
export function standingIdleLandmarks(rig: SideRig, skin: RigSkin, pose: RigPose): { lip: Vec2; eyes: Vec2[] } {
  const layers = skin.standingIdle[pose.presentation!.standing!], place = standingPlacement(rig, skin, pose);
  const at = (point: readonly number[]): Vec2 => [point[0] + place.shiftX + place.offsetX(point[1]), point[1] + place.restY + place.bob];
  return { lip: at(layers.lip), eyes: layers.eyes.map(at) };
}

/**
 * Paints a whistling standing idle from the saved standing sprite, split into layers instead of redrawn: the pelvis bob
 * dips the head and torso by whole pixels over planted shoes, lean and head roll shear whole rows (so every row keeps its
 * outline), the near toe swaps to an authored lifted variant, and the lips and eyes are painted at their head-local pixels.
 */
export function paintStandingIdle(out: Pixels, rig: SideRig, skin: RigSkin, pose: RigPose): void {
  const presentation = pose.presentation!, side = presentation.standing!, art = side === 'left' ? skin.standingLeft : skin.standingRight, layers = skin.standingIdle[side];
  const replaced = new Set(layers.toeUp.map(row => row.y));
  const patch: Patch = Math.abs(pose.nearFoot.pitch) >= toeLiftRadians ? {anchor: art.anchor, rows: [...art.rows.filter(row => !replaced.has(row.y)), ...layers.toeUp]} : art;
  const place = standingPlacement(rig, skin, pose);
  out.mapped(patch, (x, y) => { const sy = place.sourceRow(y); return [x - place.shiftX - place.offsetX(sy), sy]; });
  // Head-local features follow the same bob and shear as the rows they sit on.
  const paint = (point: readonly number[], colour: string): void => out.pixel(point[0] + place.shiftX + place.offsetX(point[1]), point[1] + place.restY + place.bob, colour);
  for (const point of layers.mouth) paint(point, skin.palette.skin);
  for (const point of layers.pucker) paint(point, 'R');
  // The lower lip pulses grey to red and back as the lips push out to blow each note; a blink closes the eyes to light grey.
  paint(layers.lip, (presentation.pucker ?? 0) >= .5 ? 'R' : skin.palette.skinShadow);
  if ((presentation.blink ?? 0) >= .5) for (const point of layers.eyes) paint(point, skin.palette.skinShadow);
  paintIdleProps(out, skin, {...pose, presentation: {...presentation, expression: 'normal'}});
}
