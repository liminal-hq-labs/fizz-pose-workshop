// Checks source-anchor fidelity, rotational anatomy, palette output and loop continuity for the standing turntable.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import{test,expect}from'bun:test';
import rig from '../source/ben-turntable-rig.json';
import skin from '../source/ben-turntable-skin.json';
import{sampleTurntable,rotateYaw,type Point3}from'../src/rig/turntable.ts';
import{buildTurntable}from'./draw-turntable.ts';
import{padStanding,turntableKeys,sampleTurntableSkin}from'./turntable-reference.ts';

const frames=buildTurntable();
test('front quarters preserve the standing sprites; front keeps its head and torso with a calibrated leg row',()=>{
 for(const[angle,name]of[[0,'ben_standFront'],[45,'ben_standRight'],[315,'ben_stand']]as const){
  expect(frames['ben_turn'+String(angle).padStart(3,'0')]).toEqual(padStanding(skin.references[name],rig,angle===0));
 }
});
test('24 distinct palette-only standing stops share a ground line and close continuously',()=>{
 expect(Object.keys(frames)).toHaveLength(24);expect(new Set(Object.values(frames).map(f=>f.grid.join(''))).size).toBe(24);
 for(const frame of Object.values(frames)){
  expect(frame.grid.every(row=>row.length===rig.width&&[...row].every(code=>Object.hasOwn(skin.palette,code)))).toBe(true);
  expect(frame.grid[2]).toMatch(/[^.]/);expect(frame.grid[rig.groundY]).toMatch(/[^.]/);expect(frame.grid.slice(rig.groundY+1).every(row=>/^\.+$/.test(row))).toBe(true);
 }
 const keys=turntableKeys(rig,skin);expect(sampleTurntableSkin(rig,keys,0)).toEqual(sampleTurntableSkin(rig,keys,360));
});
test('standing body joints and three-dimensional bone lengths remain fixed through every angle',()=>{
 const distance=(a:Point3,b:Point3):number=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 for(let angle=0;angle<=360;angle+=5){
  const pose=sampleTurntable(rig,angle);
  for(const chain of rig.connections)for(let i=1;i<chain.length;i++){
   const a=pose.joints[chain[i-1]],b=pose.joints[chain[i]];expect(distance(a.camera,b.camera)).toBeCloseTo(distance(a.model,b.model),8);
  }
  pose.joints.pelvis.camera.forEach((v,i)=>expect(v).toBeCloseTo([0,24,0][i],8));expect(pose.joints.crown.camera[1]).toBe(2);
 }
 expect(rotateYaw([2,3,4],90)).toEqual([4,3,-1.9999999999999998]);
});
test('profile heads come from the running design, rear face is hidden and equipment stays on one anatomical hip',()=>{
 const right=frames.ben_turn090,left=frames.ben_turn270,rear=frames.ben_turn180;
 expect(right.grid[9]).toContain('B');expect(left.grid[9]).toContain('B');expect(rear.grid.slice(9,14).join('')).not.toMatch(/[BR]/);
 expect(rear.grid.slice(9,14).join('')).toContain('N');
 for(let angle=0;angle<360;angle+=15)expect(sampleTurntable(rig,angle).joints.stunner.model[0]).toBe(-4.5);
});

test('the turn keeps crown and soles fixed while retaining upper-body source pixels',()=>{
 const reference=skin.references.ben_standFront,front=frames.ben_turn000;
 for(let y=0;y<30;y++)expect(front.grid[y].slice(4,28)).toBe(reference.grid[y]);
 for(const f of Object.values(frames)){
  expect(f.grid.findIndex(row=>/[^.]/.test(row))).toBe(2);
  expect(f.grid.findLastIndex(row=>/[^.]/.test(row))).toBe(34);
 }
});
test('side and rear shoes retain shaped uppers and separate white soles instead of solid red slabs',()=>{
 for(const name of['ben_turn090','ben_turn180','ben_turn270']){
  const f=frames[name];expect(f.grid.slice(30,35).join('')).toContain('W');expect(f.grid.slice(30,35).join('')).toContain('R');
  if(name==='ben_turn180')expect([...f.grid[33].matchAll(/L+/g)]).toHaveLength(2);
 }
});

test('full quarter-to-side shoes retain a ten-pixel sole length rather than shrinking between stops',()=>{
 for(const angle of[45,60,75,90,105,255,270,285,300,315]){const row=frames['ben_turn'+String(angle).padStart(3,'0')].grid[34];const pixels=[...row].flatMap((c,x)=>c==='.'?[]:[x]);expect(Math.max(...pixels)-Math.min(...pixels)+1).toBe(10);}
});
