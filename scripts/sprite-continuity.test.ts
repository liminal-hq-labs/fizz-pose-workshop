// Checks that the running shoe's yellow badge is bound to the rig and survives flex and compression.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import{test,expect}from'bun:test';
import skin from '../source/ben-side-skin.json';
import running from '../source/ben-side-rig.json';
import{sampleRunRig}from'../src/rig/run.ts';
import{skinRig,shoeBadgePoint,paintFoot,Pixels,type RigSkin}from'./rig-skin.ts';

test('each running sample adds exactly one yellow shoe pixel and leaves its shape unchanged',()=>{
 const plain=structuredClone(skin)as RigSkin;delete plain.shoe.badge;
 for(let i=0;i<running.sampleCount;i++){
  const pose=sampleRunRig(running,i/running.sampleCount),old=skinRig(running,plain,pose),now=skinRig(running,skin,pose),changes:{x:number;y:number}[]=[];
  for(let y=0;y<now.height;y++)for(let x=0;x<now.width;x++)if(now.grid[y][x]!==old.grid[y][x]){expect(now.grid[y][x]).toBe('y');expect(old.grid[y][x]).toMatch(/[Rr]/);changes.push({x,y});}
  expect(changes).toHaveLength(1);const point=shoeBadgePoint(pose.nearFoot,skin);expect(Math.hypot(changes[0].x-point[0],changes[0].y-point[1])).toBeLessThan(1.5);
 }
});
test('the running shoe layer retains its yellow detail through compression and flex before body occlusion',()=>{
 for(let i=0;i<120;i++){
  const pose=sampleRunRig(running,i/120),layer=new Pixels(running.width,running.height);paintFoot(layer,pose.nearFoot,skin,true);const f=layer.frame(),p=shoeBadgePoint(pose.nearFoot,skin);let found=false;
  for(let y=Math.round(p[1])-1;y<=Math.round(p[1])+1;y++)for(let x=Math.round(p[0])-1;x<=Math.round(p[0])+1;x++)if(f.grid[y]?.[x]==='y')found=true;
  expect(found).toBe(true);
 }
});
