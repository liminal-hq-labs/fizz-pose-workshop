// Preserves authored standing anchors and fills a full rotation with palette-indexed contour interpolation.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type{Frame,Frames}from'../src/types.ts';
import{sampleTurntable,type TurntableRig}from'../src/rig/turntable.ts';
import{refineTurntableBody}from'./turntable-details.ts';
import{drawTurntableFrame}from'./turntable-skin.ts';
interface Row{x:number;y:number;pixels:string;}
interface HeadPatch{anchor:number[];rows:Row[];}
export interface TurntableSkin{references:Frames;sideHead:HeadPatch;backHead:HeadPatch;}
export function padStanding(frame:Frame,rig:TurntableRig,extendFrontLeg=false):Frame{
 if(extendFrontLeg)frame={...frame,grid:[...frame.grid.slice(0,30),frame.grid[29],...frame.grid.slice(30,-1)]};
 const bottom=frame.grid.findLastIndex(row=>/[^.]/.test(row)),dy=rig.groundY-bottom,dx=Math.floor((rig.width-frame.width)/2);
 const rows=Array.from({length:rig.height},()=>Array<string>(rig.width).fill('.'));
 frame.grid.forEach((row,y)=>[...row].forEach((code,x)=>{if(code!=='.')rows[y+dy][x+dx]=code;}));
 return {width:rig.width,height:rig.height,grid:rows.map(row=>row.join(''))};
}
function stampHead(frame:Frame,patch:HeadPatch,centre:number,mirror=false):Frame{
 const rows=frame.grid.map(row=>[...row]);for(let y=0;y<=14;y++)rows[y].fill('.');
 for(const row of patch.rows)for(const[x,code]of[...row.pixels].entries())if(code!=='.'){
  const offset=row.x+x-patch.anchor[0],sx=Math.round(centre+(mirror?-offset:offset));rows[row.y][sx]=code;
 }
 return {...frame,grid:rows.map(row=>row.join(''))};
}
export function turntableKeys(rig:TurntableRig,skin:TurntableSkin):{angle:number;frame:Frame;reference:string}[]{
 const right=stampHead(drawTurntableFrame(rig,90),skin.sideHead,16);
 const r=right.grid.map(row=>[...row]);r[9][18]='B';r[11][18]='R';right.grid=r.map(row=>row.join(''));
 const left=stampHead(drawTurntableFrame(rig,270),skin.sideHead,15,true);
 const l=left.grid.map(row=>[...row]);l[9][13]='B';l[11][13]='R';left.grid=l.map(row=>row.join(''));
 const back=stampHead(drawTurntableFrame(rig,180),skin.backHead,15.5);
 return [
  {angle:0,frame:padStanding(skin.references.ben_standFront,rig,true),reference:'ben_standFront'},
  {angle:45,frame:padStanding(skin.references.ben_standRight,rig),reference:'ben_standRight'},
  {angle:90,frame:right,reference:'running side head · standing body'},
  {angle:180,frame:back,reference:'climbing rear head · standing body'},
  {angle:270,frame:left,reference:'mirrored running side head · standing body'},
  {angle:315,frame:padStanding(skin.references.ben_stand,rig),reference:'ben_stand'},
  {angle:360,frame:padStanding(skin.references.ben_standFront,rig,true),reference:'ben_standFront'},
 ];
}
function span(row:string):[number,number]|undefined{
 const first=row.search(/[^.]/);if(first<0)return undefined;let last=row.length-1;while(row[last]==='.')last--;return[first,last];
}
export function interpolateTurntable(a:Frame,b:Frame,t:number):Frame{
 if(t===0)return structuredClone(a);if(t===1)return structuredClone(b);
 const rows:string[]=[];
 for(let y=0;y<a.height;y++){
  const ar=a.grid[y],br=b.grid[y],aa=span(ar),bb=span(br),row=Array<string>(a.width).fill('.');
  if(!aa||!bb){rows.push(t<.5?ar:br);continue;}
  const x0=Math.round(aa[0]+(bb[0]-aa[0])*t),x1=Math.round(aa[1]+(bb[1]-aa[1])*t);
  for(let x=x0;x<=x1;x++){
   const u=(x-x0)/Math.max(1,x1-x0),ac=ar[Math.round(aa[0]+u*(aa[1]-aa[0]))],bc=br[Math.round(bb[0]+u*(bb[1]-bb[0]))];
   row[x]=t<.5?ac:bc;
  }
  rows.push(row.join(''));
 }
 return {width:a.width,height:a.height,grid:rows};
}
export function sampleTurntableSkin(rig:TurntableRig,keys:ReturnType<typeof turntableKeys>,angle:number):Frame{
 const yaw=((angle%360)+360)%360,index=Math.max(0,keys.findLastIndex(key=>key.angle<=yaw)),a=keys[index],b=keys[index+1];
 const frame=interpolateTurntable(a.frame,b.frame,(yaw-a.angle)/(b.angle-a.angle));
 // Eyes and lips are hidden once the head turns behind the true profile.
 if(yaw>100&&yaw<260)for(let y=9;y<=13;y++)frame.grid[y]=frame.grid[y].replace(/[BR]/g,'L');
 return refineTurntableBody(frame,rig,yaw);
}
