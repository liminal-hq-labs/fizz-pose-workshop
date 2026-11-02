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
export interface TurntableSkin{references:Frames;sideHead:HeadPatch;backHead:HeadPatch;rearHeadTreatment?:{colourMap:Record<string,string>};}
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
 const left=stampHead(drawTurntableFrame(rig,270),skin.sideHead,14,true);
 const l=left.grid.map(row=>[...row]);l[9][12]='B';l[11][12]='R';left.grid=l.map(row=>row.join(''));
 const rearPatch={...skin.backHead,rows:skin.backHead.rows.map(row=>({...row,pixels:[...row.pixels].map(c=>skin.rearHeadTreatment?.colourMap[c]??c).join('')}))};
 const back=stampHead(drawTurntableFrame(rig,180),rearPatch,15);
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
function blendRearHead(frame:Frame,a:Frame,b:Frame,t:number):void{
 // Reveal the turning surface from its trailing edge instead of replacing a whole head at halfway.
 for(let y=2;y<=14;y++){
  const aa=span(a.grid[y]),bb=span(b.grid[y]);if(!aa||!bb)continue;
  const roundness=.25*Math.sin(t*Math.PI);
  const out:[number,number]=[Math.round(aa[0]+(bb[0]-aa[0])*t-roundness),Math.round(aa[1]+(bb[1]-aa[1])*t+roundness)];
  const row=Array<string>(frame.width).fill('.'),width=out[1]-out[0]+1;
  const rearCoverage=Math.sin(t*Math.PI/2)**2;
  for(let x=out[0];x<=out[1];x++){
   const u=(x-out[0])/Math.max(1,width-1),ac=a.grid[y][Math.round(aa[0]+u*(aa[1]-aa[0]))],bc=b.grid[y][Math.round(bb[0]+u*(bb[1]-bb[0]))];
   row[x]=u<rearCoverage?bc:ac;
  }
  if(y>=3&&y<=7){
   // The stripe is one attached feature, not two textures that can flicker or double up.
   const whiteA=[...a.grid[y]].flatMap((c,x)=>c==='W'?[x]:[]),whiteB=[...b.grid[y]].flatMap((c,x)=>c==='W'?[x]:[]);
   for(let x=out[0];x<=out[1];x++)if(row[x]==='W')row[x]=y>5?'G':'g';
   if(whiteA.length&&whiteB.length){const mean=(v:number[]):number=>v.reduce((sum,n)=>sum+n,0)/v.length;const x=Math.round(mean(whiteA)+(mean(whiteB)-mean(whiteA))*t);if(x>out[0]&&x<out[1])row[x]='W';}
  }
  // Keep the changing surface inside the interpolated silhouette and retain its outer outline.
  row[out[0]]='k';row[out[1]]='k';frame.grid[y]=row.join('');
 }
}
function paintRearHair(frame:Frame,rig:TurntableRig,yaw:number):void{
 if(yaw<90||yaw>270)return;
 // The source hair is one attached patch; its visible area follows the turning rear surface.
 const a=yaw*Math.PI/180,backness=Math.max(0,-Math.cos(a));
 const count=Math.round(8*backness*backness),upper=Math.min(5,Math.round(count*5/8)),lower=count-upper;
 const centre=Math.round(rig.centreX-Math.sign(Math.sin(a))*(1-backness)*2);
 for(let y=9;y<=13;y++)frame.grid[y]=frame.grid[y].replaceAll('N','L');
 for(const[y,n]of[[10,upper],[11,lower]]){
  const row=[...frame.grid[y]],x0=centre-Math.floor(n/2);
  for(let x=x0;x<x0+n;x++)if(row[x]!=='.'&&row[x]!=='k')row[x]='N';
  frame.grid[y]=row.join('');
 }
}
export function sampleTurntableSkin(rig:TurntableRig,keys:ReturnType<typeof turntableKeys>,angle:number):Frame{
 const yaw=((angle%360)+360)%360,index=Math.max(0,keys.findLastIndex(key=>key.angle<=yaw)),a=keys[index],b=keys[index+1];
 const progress=(yaw-a.angle)/(b.angle-a.angle);
 const frame=interpolateTurntable(a.frame,b.frame,progress);
 if(yaw>90&&yaw<270)blendRearHead(frame,a.frame,b.frame,progress);
 paintRearHair(frame,rig,yaw);
 // Eyes and lips are hidden once the head turns behind the true profile.
 if(yaw>100&&yaw<260)for(let y=9;y<=13;y++)frame.grid[y]=frame.grid[y].replace(/[BR]/g,'L');
 return refineTurntableBody(frame,rig,yaw);
}
