// Draws front/back rig skins, comic facial expressions and idle props from action joints.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { add, tiltPixel, type Vec2 } from '../src/rig/kinematics.ts';
import type { RigPose, SideRig } from '../src/rig/run.ts';
import { paintArm, type Pixels, type RigSkin } from './rig-skin.ts';

function headPixel(pose: RigPose, local: Vec2): Vec2 {
  return tiltPixel(pose.face.pixelAnchor, local, pose.headAngle ?? 0);
}
export function paintFacingBody(out: Pixels, rig: SideRig, skin: RigSkin, pose: RigPose): void {
  const back = pose.presentation!.view === 'back', phone = pose.presentation!.phone;
  for (const chain of [pose.farLeg, pose.nearLeg]) {
    out.segment(chain, 2, skin.palette.denim, 'k'); out.segment(chain, 1, 'c');
  }
  const shoe = pose.presentation!.cameraShoes ? skin.cameraShoe : skin.backShoe;
  for (const foot of [pose.farFoot, pose.nearFoot]) out.patch(shoe, foot.ankle, 0);
  paintArm(out, pose.farArm, skin, false);
  out.patch(back ? skin.torsoBack : skin.torsoFront, pose.root, pose.torsoAngle);
  paintArm(out, pose.nearArm, skin, true);
  // Hands remain in front of the belly or phone instead of being hidden by the shirt.
  if (!back) for (const hand of [pose.farArm[2], pose.nearArm[2]]) out.segment([hand, add(hand, [.6,0])], 1, 'W', 'k');
  out.tiltPatch(back ? skin.headBack : skin.headFront, pose.face.pixelAnchor, pose.headAngle ?? 0);
  if (!back) {
    const pixel = (x: number, y: number, colour: string): void => {const p=headPixel(pose,[x,y]);out.pixel(p[0],p[1],colour);};
    const expression = pose.presentation!.expression;
    for (const x of [-2,2]) {
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
  if (phone) out.patch(skin.phoneBack, phone, 0);
  paintIdleProps(out, skin, pose);
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

export function paintStandingIdle(out: Pixels, skin: RigSkin, pose: RigPose): void {
  const left = pose.presentation!.standing === 'left';
  out.patch(left ? skin.standingLeft : skin.standingRight, pose.root, 0);
  // Replace the original three-pixel mouth with a puckered shape; the saved stance stays fixed.
  for (const x of left ? [13,14,15] : [16,17,18]) out.pixel(x,11,'W');
  const [x,y] = pose.face.mouth.pixel;
  out.pixel(x,y,'R');out.pixel(x+(left?1:-1),y,'R');
  paintIdleProps(out, skin, {...pose,presentation:{...pose.presentation!,expression:'normal'}});
}
