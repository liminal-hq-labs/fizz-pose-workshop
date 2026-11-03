// Reflects complete rig poses so left-facing actions share their source motion and joint bindings.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { RigPose, RigFoot } from './run.ts';
import type { Vec2, Chain } from './kinematics.ts';
import type { FaceLandmark } from './face.ts';

/**
 * Canvas x offset for drawing a turned-round rig's continuous skeleton over its sprite. The skin draws a joint at `x` into
 * pixel `round(x)`, which spans `round(x)` to `round(x) + 1`, and `reflectPose` maps joints about pixel indices
 * (`width - 1 - x`) so the rounded pixels mirror exactly. A continuous point mirrors about the canvas edge (`width - x`)
 * instead, so a left-facing or mirrored overlay shifts one pixel right to sit on its sprite exactly as the right-facing one does.
 */
export function overlayShift(rig: { mirrored?: boolean; facing?: 'right' | 'left' }): number { return rig.mirrored || rig.facing === 'left' ? 1 : 0; }

export function reflectPose(pose: RigPose, width: number): RigPose {
 const point=(p:Vec2):Vec2=>[width-1-p[0],p[1]];
 const chain=(c:Chain):Chain=>[point(c[0]),point(c[1]),point(c[2])];
 // Pixel lists stay in canvas reading order (row, then column), as measured from a saved sprite, so a reflected face compares
 // equal to the pixels read back from its own frame.
 const pixels=(list:Vec2[]):Vec2[]=>list.map(point).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
 const landmark=(p:FaceLandmark):FaceLandmark=>({...p,local:[-p.local[0],p.local[1]],world:point(p.world),pixel:point(p.pixel)});
 const foot=(f:RigFoot):RigFoot=>({...f,ankle:point(f.ankle),ball:point(f.ball),toe:point(f.toe),heel:point(f.heel),pitch:-f.pitch,toePitch:-f.toePitch});
 const face=pose.face;
 const environment=pose.presentation?.environment;
 return {...pose,root:point(pose.root),neck:point(pose.neck),torsoAngle:-pose.torsoAngle,torsoTurn:-pose.torsoTurn,headTurn:-pose.headTurn,headAngle:-(pose.headAngle??0),
  nearArm:chain(pose.nearArm),farArm:chain(pose.farArm),nearLeg:chain(pose.nearLeg),farLeg:chain(pose.farLeg),nearFoot:foot(pose.nearFoot),farFoot:foot(pose.farFoot),
  face:{...face,anchor:point(face.anchor),pixelAnchor:point(face.pixelAnchor),yaw:-face.yaw,shift:-face.shift,pixelShift:-face.pixelShift,eye:landmark(face.eye),eyePixels:pixels(face.eyePixels),mouth:landmark(face.mouth),mouthPixels:pixels(face.mouthPixels),ear:landmark(face.ear),nose:landmark(face.nose),noseTip:landmark(face.noseTip),cheek:landmark(face.cheek),chin:landmark(face.chin)},
  presentation:pose.presentation?{...pose.presentation,phone:pose.presentation.phone?point(pose.presentation.phone):undefined,notes:pose.presentation.notes?.map(point),environment:environment?{...environment,x:environment.kind==='ledge'?width-1-environment.x:width-1-environment.x-environment.width,width:environment.kind==='ledge'?-environment.width:environment.width}:undefined}:undefined,
  pogo:pose.pogo?{...pose.pogo,lean:-pose.pogo.lean,tip:point(pose.pogo.tip),springTop:point(pose.pogo.springTop),shaftTop:point(pose.pogo.shaftTop),collar:point(pose.pogo.collar),ride:point(pose.pogo.ride),grips:[point(pose.pogo.grips[0]),point(pose.pogo.grips[1])],pegs:[point(pose.pogo.pegs[0]),point(pose.pogo.pegs[1])]}:undefined,
  weapon:pose.weapon?{...pose.weapon,grip:point(pose.weapon.grip),muzzle:point(pose.weapon.muzzle),angle:Math.PI-pose.weapon.angle}:undefined,
 };
}
