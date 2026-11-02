// Checks consistent shoe structure, gradual rear-head detail and rig-bound running shoe badges.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import{test,expect}from'bun:test';
import shoes from '../source/ben-turntable-shoes.json';
import skin from '../source/ben-side-skin.json';
import running from '../source/ben-side-rig.json';
import{buildTurntable}from'./draw-turntable.ts';
import{sampleRunRig}from'../src/rig/run.ts';
import{skinRig,shoeBadgePoint,paintFoot,Pixels,type RigSkin}from'./rig-skin.ts';

const frames=buildTurntable();
test('all five directional shoe templates share collar, three upper rows and one sole row',()=>{
 for(const key of['front','quarter','side','rearQuarter','rear']as const){
  const patch=shoes[key];expect(patch).toHaveLength(shoes.height);expect(shoes.height).toBe(5);
  expect(patch[0]).toContain('B');for(let row=1;row<=3;row++)expect(patch[row]).toContain('R');
  expect(patch[4]).toContain('W');expect(patch.every(row=>row.length===patch[0].length)).toBe(true);
 }
});
test('rear turn keeps its skull height and contours while brown-blond hair reveals gradually',()=>{
 const span=(row:string):[number,number]=>[row.search(/[^.]/),row.length-1-[...row].reverse().join('').search(/[^.]/)];
 for(let a=90;a<=270;a+=15){
  const f=frames['ben_turn'+String(a).padStart(3,'0')];const hair=[...f.grid.slice(9,14).join('')].filter(c=>c==='N').length;expect(hair).toBe(Math.round(8*Math.max(0,-Math.cos(a*Math.PI/180))**2));
  expect(f.grid.findIndex(row=>/[^.]/.test(row))).toBe(2);
  if(a<270){const g=frames['ben_turn'+String(a+15).padStart(3,'0')];for(let y=2;y<=14;y++){const u=span(f.grid[y]),v=span(g.grid[y]);expect(Math.abs(u[0]-v[0])).toBeLessThanOrEqual(1);expect(Math.abs(u[1]-v[1])).toBeLessThanOrEqual(1);}}
 }
});
test('the rear helmet stripe remains one attached cluster instead of doubling between textures',()=>{
 for(let a=90;a<=270;a+=15){const f=frames['ben_turn'+String(a).padStart(3,'0')];for(let y=3;y<=6;y++){const white=[...f.grid[y]].flatMap((c,x)=>c==='W'?[x]:[]);expect(white.length).toBeLessThanOrEqual(1);}}
});
test('each running sample adds exactly one yellow shoe pixel and leaves its shape unchanged',()=>{
 const plain=structuredClone(skin)as RigSkin;delete plain.shoe.badge;
 for(let i=0;i<6;i++){
  const pose=sampleRunRig(running,i/6),old=skinRig(running,plain,pose),now=skinRig(running,skin,pose),changes:{x:number;y:number}[]=[];
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

test('the helmet dome keeps one registered volume through the rear half of the turn',()=>{
 for(let angle=90;angle<=270;angle+=15){const f=frames['ben_turn'+String(angle).padStart(3,'0')];for(let y=4;y<=6;y++){const pixels=[...f.grid[y]].flatMap((c,x)=>c==='.'?[]:[x]);expect(Math.min(...pixels)).toBe(10);expect(Math.max(...pixels)).toBe(20);}}
});
