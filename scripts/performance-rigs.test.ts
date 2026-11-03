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
test('whistle idle keeps its feet still while musical notes rise around its face',()=>{
 const rig=entries.find(e=>e.rig.motion==='whistle')!.rig,a=sampleRig(rig,0),b=sampleRig(rig,.25);
 expect(a.nearFoot.ankle).toEqual(b.nearFoot.ankle);expect(a.presentation!.expression).toBe('whistle');expect(a.presentation!.notes).not.toEqual(b.presentation!.notes);
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

test('left and right whistling idle preserve their saved standing artwork outside the puckered mouth',async()=>{
 const frames=await Bun.file(new URL('../edits.json',import.meta.url)).json();
 for(const entry of entries.filter(e=>e.rig.motion==='whistle')){
  const left=entry.rig.performance!.standing==='left',reference=frames[left?'ben_stand':'ben_standRight'];
  for(let i=0;i<entry.rig.sampleCount;i++){
   const f=skinRig(entry.rig,skin,sampleRig(entry.rig,sampleTime(entry.rig,i)));
   for(let y=0;y<reference.height;y++)for(let x=0;x<reference.width;x++){
    if(y===11)continue;
    // Musical notes remain outside the standing figure; opaque reference pixels must stay exact.
    if(reference.grid[y][x]!=='.')expect(f.grid[y][x+4]).toBe(reference.grid[y][x]);
   }
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
