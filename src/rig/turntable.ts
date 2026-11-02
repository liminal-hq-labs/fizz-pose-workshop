// Projects a fixed standing character rig through a full yaw rotation without changing its pose.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export type Point3 = readonly [number,number,number];
export type Point2 = readonly [number,number];
export interface TurntableRig {
 name:string; width:number; height:number; centreX:number; groundY:number; sampleCount:number; frameMs:number;
 joints:Record<string,number[]>;
 connections:readonly string[][];
 volumes:{helmet:number[];head:number[];torso:number[]};
 referenceNotes:Record<string,string>;
}
export interface TurntablePose { angle:number; joints:Record<string,{model:Point3;camera:Point3;pixel:Point2}>; }
export function rotateYaw(point:Point3,angle:number):Point3 {
 const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [point[0]*c+point[2]*s,point[1],-point[0]*s+point[2]*c];
}
export function sampleTurntable(rig:TurntableRig,angle:number):TurntablePose {
 if(!Number.isFinite(angle))throw new Error('Turntable angle must be finite.');
 const yaw=((angle%360)+360)%360;
 return {angle:yaw,joints:Object.fromEntries(Object.entries(rig.joints).map(([name,value])=>{
  const model:Point3=[value[0],value[1],value[2]],camera=rotateYaw(model,yaw);
  return [name,{model,camera,pixel:[Math.round(rig.centreX+camera[0]),Math.round(camera[1])]}];
 }))};
}
export function validateTurntable(rig:TurntableRig):void {
 if(!Number.isInteger(rig.sampleCount)||rig.sampleCount<8||rig.frameMs<=0||rig.frameMs%10!==0)throw new Error('Turntable sampling and GIF timing must be valid.');
 for(const point of Object.values(rig.joints))if(point.length!==3||!point.every(Number.isFinite))throw new Error('Turntable joints need three finite coordinates.');
 for(const chain of rig.connections)if(chain.some(name=>!Object.hasOwn(rig.joints,name)))throw new Error('Turntable connection names an unknown joint.');
}
