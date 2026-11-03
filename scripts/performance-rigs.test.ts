// Checks expressive action goals, contacts, camera-facing poses and terminal playback.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {test,expect} from 'bun:test';
import {rigCatalogue} from '../src/rig/catalogue.ts';
import {sampleRig,sampleTime} from '../src/rig/sample.ts';
import {validateRig,type SideRig} from '../src/rig/run.ts';
import {distance,type Chain} from '../src/rig/kinematics.ts';
import {skinRig,sampleRigSprites} from './rig-skin.ts';
import {standingIdleLandmarks} from './performance-skin.ts';
import skin from '../source/ben-side-skin.json';
import palette from '../source/game-palette.json';

const keyPhase=(rig:SideRig,index:number):number=>rig.performance!.keys[index].phase;
const entries=rigCatalogue.filter(entry=>entry.rig.performance);
for(const entry of entries) {const {rig,prefix}=entry; test(`${rig.motion} preserves anatomy, reach, palette and canvas clearance through the whole performance`,()=>{
 validateRig(rig);
 for(let i=0;i<=120;i++){
  const pose=sampleRig(rig,i/120);
  for(const [chain,upper,lower] of [[pose.nearArm,rig.arms.upperLength,rig.arms.forearmLength],[pose.farArm,rig.arms.upperLength,rig.arms.forearmLength],[pose.nearLeg,rig.legs.thighLength,rig.legs.shinLength],[pose.farLeg,rig.legs.thighLength,rig.legs.shinLength]] as [Chain,number,number][]){
   expect(distance(chain[0],chain[1])).toBeCloseTo(upper,7);expect(distance(chain[1],chain[2])).toBeCloseTo(lower,7);
  }
  const frame=skinRig(rig,skin,pose);
  expect(frame.grid.every(row=>row.length===rig.width&&[...row].every(code=>Object.hasOwn(palette,code)))).toBe(true);
  expect(frame.grid.slice(rig.groundY+1).every(row=>row==='.'.repeat(rig.width))).toBe(true);
 }
 const frames=sampleRigSprites(rig,skin,prefix);expect(Object.keys(frames)).toHaveLength(rig.sampleCount);expect(entry.labels).toHaveLength(rig.sampleCount);
 if(rig.performance!.loop){expect(sampleRig(rig,0)).toEqual(sampleRig(rig,1));}
 else{expect(sampleTime(rig,rig.sampleCount-1)).toBe(1);expect(sampleRig(rig,1)).toEqual(sampleRig(rig,2));expect(sampleRig(rig,1)).not.toEqual(sampleRig(rig,0));}
});}
test('ladder alternates opposite hands and feet and shows the back of the helmet',()=>{
 const rig=entries.find(e=>e.rig.motion==='ladder')!.rig;
 const a=sampleRig(rig,0),b=sampleRig(rig,.5);
 expect(a.nearArm[2][1]).toBeLessThan(a.farArm[2][1]);expect(b.nearArm[2][1]).toBeGreaterThan(b.farArm[2][1]);
 expect(a.nearFoot.ankle[1]).toBeGreaterThan(a.farFoot.ankle[1]);expect(b.nearFoot.ankle[1]).toBeLessThan(b.farFoot.ankle[1]);
 expect(a.presentation!.view).toBe('back');expect(skinRig(rig,skin,a).grid.slice(0,20).join('')).not.toContain('WBB');
});
test('jump has a clear apex and a grounded landing',()=>{
 const rig=entries.find(e=>e.rig.motion==='jump')!.rig;
 const start=sampleRig(rig,0),apex=sampleRig(rig,keyPhase(rig,2)),land=sampleRig(rig,keyPhase(rig,4));
 expect(apex.root[1]).toBeLessThan(start.root[1]-10);expect(apex.contact).toBe('flight');expect(land.contact).toBe('both');expect(land.nearFoot.ball[1]).toBe(rig.groundY);
});
test('death clutches the belly with changing expressions and presents both soles to the camera',()=>{
 const rig=entries.find(e=>e.rig.motion==='death')!.rig;
 expect(new Set(rig.performance!.keys.map(key=>key.expression)).size).toBe(6);
 for(let i=0;i<rig.sampleCount;i++){const p=sampleRig(rig,sampleTime(rig,i));expect(p.presentation!.cameraShoes).toBe(true);expect(p.presentation!.view).toBe('front');expect(Math.abs(p.nearArm[2][1]-p.root[1])).toBeLessThan(5);expect(Math.abs(p.farArm[2][1]-p.root[1])).toBeLessThan(5);}
});
test('ledge grips stay pinned through the pull and the feet finish on top',()=>{
 const rig=entries.find(e=>e.rig.motion==='ledge')!.rig;
 for(let i=0;i<=40;i++){const p=sampleRig(rig,i/100);expect(p.nearArm[2][0]).toBeCloseTo(25,8);expect(p.nearArm[2][1]).toBeCloseTo(38,8);}
 const last=sampleRig(rig,1);expect(last.nearFoot.ball[1]).toBe(38);expect(last.farFoot.ball[1]).toBe(38);
});
test('phone idle faces the camera, crosses the legs and raises a visible phone with its back case facing the camera and a lighting note',()=>{
 const rig=entries.find(e=>e.rig.motion==='phone')!.rig;
 expect(sampleRig(rig,0).presentation!.phone).toBeUndefined();const p=sampleRig(rig,1);
 expect(p.presentation!.view).toBe('front');expect(p.presentation!.phone).toBeDefined();expect(p.nearLeg[2][0]).toBeGreaterThan(p.farLeg[2][0]);
 expect(p.nearLeg[1][0]).toBeLessThan(p.farLeg[1][0]);expect(rig.lightingNote).toContain('dynamic light');
 const f=skinRig(rig,skin,p);const phone=p.presentation!.phone!;expect(f.grid[Math.round(phone[1])][Math.round(phone[0])]).toBe('y');expect(skin.phoneBack.rows.every(row=>!/[cCW]/.test(row.pixels))).toBe(true);
});
test('whistle idle keeps its feet planted while one note per cycle leaves the lips and floats away',()=>{
 for(const {rig} of entries.filter(e=>e.rig.motion==='whistle')){
  const notes=rig.performance!.notes!,a=sampleRig(rig,0),b=sampleRig(rig,.25);
  expect(a.nearFoot.ankle).toEqual(b.nearFoot.ankle);expect(a.farFoot.ankle).toEqual(b.farFoot.ankle);expect(a.presentation!.expression).toBe('whistle');
  // The younger note starts at the path's lip end as it is emitted, and the older note is always further along and higher.
  expect(sampleRig(rig,notes.emitPhase).presentation!.notes![0]).toEqual(notes.path[0] as [number,number]);
  for(let i=0;i<=60;i++){const [young,old]=sampleRig(rig,i/60).presentation!.notes!;expect(old[1]).toBeLessThan(young[1]);}
  // The pair loops seamlessly: the note leaving the top at the seam is replaced by a new one at the lips.
  expect(sampleRig(rig,1).presentation!.notes).toEqual(sampleRig(rig,0).presentation!.notes);
 }
});
test('rejects unordered or invalid performance goals before exporting',()=>{
 const rig=structuredClone(entries[0].rig);rig.performance!.keys[1].phase=0;expect(()=>validateRig(rig)).toThrow();
});

test('airborne jump spreads the legs and points the shoes at independent angles before a flat landing',()=>{
 const rig=entries.find(e=>e.rig.motion==='jump')!.rig,apex=sampleRig(rig,keyPhase(rig,2)),land=sampleRig(rig,keyPhase(rig,4));
 expect(apex.farFoot.ankle[0]-apex.nearFoot.ankle[0]).toBeGreaterThan(14);
 expect(apex.nearFoot.pitch).toBeLessThan(-.4);expect(apex.farFoot.pitch).toBeGreaterThan(.4);
 expect(land.nearFoot.pitch).toBe(0);expect(land.farFoot.pitch).toBe(0);
});

const whistles=entries.filter(e=>e.rig.motion==='whistle');
const whistleFrames=(entry:typeof entries[number])=>Array.from({length:entry.rig.sampleCount},(_,i)=>{const pose=sampleRig(entry.rig,sampleTime(entry.rig,i));return {pose,frame:skinRig(entry.rig,skin,pose)};});
const count=(grid:string[],code:string):number=>grid.join('').split(code).length-1;

test('whistling idle keeps the saved standing artwork: helmet, collar, shirt and one-hip Stunner on every frame',async()=>{
 const saved=await Bun.file(new URL('../edits.json',import.meta.url)).json();
 for(const entry of whistles){
  const left=entry.rig.performance!.standing==='left',reference=saved[left?'ben_stand':'ben_standRight'];
  for(const {frame} of whistleFrames(entry)){
   // The green helmet shell and the magenta Stunner keep every saved pixel; the left view keeps the Stunner hidden on the far hip.
   for(const code of ['G','g','M','m'])expect(count(frame.grid,code)).toBe(count(reference.grid,code));
   expect(count(frame.grid,'M')>0).toBe(!left);
   // The white collar row still sits directly on the red shirt.
   const collar=frame.grid.findIndex(row=>row.includes('kWWWWk'));expect(collar).toBeGreaterThan(10);expect(frame.grid[collar+1]).toContain('rrrrrr');
  }
 }
 // The Stunner side makes the two views genuinely different drawings, never a flip of one another.
 const [a,b]=whistles.map(entry=>whistleFrames(entry).map(item=>item.frame.grid));
 a.forEach((grid,i)=>expect(grid).not.toEqual(b[i].map(row=>[...row].reverse().join(''))));
});

test('whistling bobs, sways, nods and taps a toe in time instead of standing frozen',()=>{
 for(const entry of whistles){
  const poses=whistleFrames(entry).map(item=>item.pose),rest=entry.rig.root[1];
  const dips=poses.map(p=>Math.round(p.root[1])-rest);
  expect(Math.max(...dips)).toBe(1);expect(Math.min(...dips)).toBe(0);
  expect(new Set(poses.map(p=>Math.sign(p.torsoAngle))).size).toBe(3);
  expect(poses.some(p=>Math.abs(p.headAngle!)>0)).toBe(true);
  // The toe lifts just before each dip and is planted again on the beat.
  poses.forEach((p,i)=>{if(Math.abs(p.nearFoot.pitch)>.05)expect(dips[(i+1)%poses.length]).toBe(1);});
  expect(poses.filter(p=>Math.abs(p.nearFoot.pitch)>.05).length).toBe(2);
 }
});

test('whistling lips pulse grey, red, grey once per loop and a light-grey blink falls on a different beat',()=>{
 const lips:string[][]=[],blinks:number[][]=[];
 for(const entry of whistles){
  const frames=whistleFrames(entry),sequence=frames.map(({pose,frame})=>{const p=standingIdleLandmarks(entry.rig,skin,pose).lip;return frame.grid[p[1]][p[0]];});
  expect(sequence.every(code=>code==='L'||code==='R')).toBe(true);
  // Exactly one red run in the loop, entered from grey and left to grey, with the note leaving the lips on its first frame.
  const rises=sequence.filter((code,i)=>code==='R'&&sequence[(i+sequence.length-1)%sequence.length]==='L').length;
  expect(rises).toBe(1);expect(sequence[0]).toBe('R');expect(sequence.at(-1)).toBe('L');
  const closed=frames.flatMap(({pose,frame},i)=>{const eyes=standingIdleLandmarks(entry.rig,skin,pose).eyes.map(([x,y])=>frame.grid[y][x]);
   expect(eyes.every(code=>code==='B')||eyes.every(code=>code==='L')).toBe(true);return eyes[0]==='L'?[i]:[];});
  expect(closed.length).toBe(1);expect(sequence[closed[0]]).toBe('L');
  lips.push(sequence);blinks.push(closed);
 }
 // Left and right share the same rhythm.
 expect(lips[0]).toEqual(lips[1]);expect(blinks[0]).toEqual(blinks[1]);
});

test('whistling notes float clear of Ben instead of overlapping or touching his outline',()=>{
 for(const entry of whistles)for(const {pose,frame} of whistleFrames(entry)){
  const bare=skinRig(entry.rig,skin,{...pose,presentation:{...pose.presentation!,notes:[]}});
  for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++){
   if(frame.grid[y][x]===bare.grid[y][x])continue;
   expect(bare.grid[y][x]).toBe('.');
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])expect(bare.grid[y+dy]?.[x+dx]??'.').toBe('.');
  }
 }
});

test('left ledge mirrors the complete right rig and every exported sprite pixel',()=>{
 const right=entries.find(e=>e.rig.motion==='ledge'&&!e.rig.mirrored)!.rig;
 const left=entries.find(e=>e.rig.motion==='ledge'&&e.rig.mirrored)!.rig;
 for(let i=0;i<right.sampleCount;i++){
  const t=sampleTime(right,i),a=sampleRig(right,t),b=sampleRig(left,t);
  expect(b.root[0]).toBeCloseTo(right.width-1-a.root[0],8);
  for(const key of ['nearArm','farArm','nearLeg','farLeg']as const)for(let j=0;j<3;j++){expect(b[key][j][0]).toBeCloseTo(right.width-1-a[key][j][0],8);expect(b[key][j][1]).toBe(a[key][j][1]);}
  expect(skinRig(left,skin,b).grid).toEqual(skinRig(right,skin,a).grid.map(row=>[...row].reverse().join('')));
 }
});
