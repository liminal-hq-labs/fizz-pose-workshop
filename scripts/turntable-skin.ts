// Ray-casts palette-coloured character volumes with model-space details into standing yaw sprites.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {rotateYaw,type TurntableRig,type Point3}from'../src/rig/turntable.ts';
import type{Frame}from'../src/types.ts';

function ellipsoid(p:Point3,c:Point3,r:Point3):boolean{return ((p[0]-c[0])/r[0])**2+((p[1]-c[1])/r[1])**2+((p[2]-c[2])/r[2])**2<=1;}
function capsule(p:Point3,a:Point3,b:Point3,r:number):boolean{
 const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[p[0]-a[0],p[1]-a[1],p[2]-a[2]];
 const t=Math.max(0,Math.min(1,(v[0]*d[0]+v[1]*d[1]+v[2]*d[2])/(d[0]**2+d[1]**2+d[2]**2)));
 return (v[0]-d[0]*t)**2+(v[1]-d[1]*t)**2+(v[2]-d[2]*t)**2<=r*r;
}
export function turntableMaterial(rig:TurntableRig,p:Point3):string|null{
 const [x,y,z]=p;
 if(y<1.5||y>34.45||Math.abs(x)>7||Math.abs(z)>7.5)return null;
 const helmet=rig.volumes.helmet as unknown as Point3,head=rig.volumes.head as unknown as Point3;
 if(y>=2&&y<=7.8&&ellipsoid(p,[0,7.5,0],helmet)){
  if(Math.abs(x)<.55)return y<6?'W':'g';
  if(y>6.4)return 'G';
  if(Math.abs(x)>2.1&&Math.abs(x)<3.7&&y>4.1&&y<5.8&&z>-.5)return 'G';
  return 'g';
 }
 if(y>=7.3&&y<=8.5&&((Math.abs(x)<5.5&&z>-4&&z<4.5)||(Math.abs(x)<4.7&&z>=4.5&&z<6.5)))return y>7.8?'L':'G';
 if(ellipsoid(p,[0,11,0],head)){
  if(z<-1.3)return y<9.7?'L':y<11.8?'N':y<13?'L':'W';
  if(z>1.9&&Math.abs(y-9.5)<.55&&(Math.abs(x-2)<.6||Math.abs(x+2)<.6))return 'B';
  if(z>2.4&&Math.abs(y-11.4)<.48&&Math.abs(x)<1.35)return 'R';
  return y>12.3||Math.abs(x)>3.2?'L':'W';
 }
 if(ellipsoid(p,[0,10.5,4],[.9,.8,1.5]))return z>4.8?'L':'W';
 for(const sx of[-1,1])if(ellipsoid(p,[sx*4.2,10.7,0],[.75,1.1,.9]))return 'L';
 if(y>=13&&y<=15.5&&x*x+z*z<3)return 'W';
 if(y>=15&&y<=23.6&&ellipsoid(p,[0,19.5,0],rig.volumes.torso as unknown as Point3)){
  if(y>=22.6)return z>1.2&&Math.abs(x)<.7?'y':'D';
  if(z>1.65&&y>=16.5&&y<19.4&&Math.abs(x)<1.6){if((Math.abs(x)<.55||y>=17.4&&y<18.3))return y>18.5?'N':'y';}
  return y<17?'r':'R';
 }
 for(const side of['right','left']){
  const j=(name:string):Point3=>rig.joints[side+name] as unknown as Point3;
  if(capsule(p,j('Shoulder'),j('Elbow'),1.3)||capsule(p,j('Elbow'),j('Hand'),1.2))return y<18.2?(z>.3?'r':'R'):z>0?'W':'L';
  if(capsule(p,j('Hip'),j('Knee'),1.4)||capsule(p,j('Knee'),j('Ankle'),1.35))return Math.abs(x-j('Hip')[0])>1&&z>-.2&&z<1.5?'c':'B';
  const a=j('Ankle');
  if(y>=30&&y<=34.4&&Math.abs(x-a[0])<=1.8&&z>=a[2]-2&&z<=a[2]+3.1){
   if(y>=33.3)return 'W';
   if(z>a[2]+2.3&&y>32.2)return 'W';
   return z>a[2]+1?'r':'R';
  }
 }
 if(Math.abs(x+4.4)<1&&y>=23.2&&y<27.4&&Math.abs(z-.5)<1.1)return y<24?'D':x< -4.3?'M':'m';
 return null;
}
export function drawTurntableFrame(rig:TurntableRig,angle:number):Frame{
 const rows=Array.from({length:rig.height},()=>Array<string>(rig.width).fill('.'));
 for(let y=0;y<rig.height;y++)for(let x=0;x<rig.width;x++){
  for(let depth=9;depth>=-9;depth-=.22){
   const p=rotateYaw([x-rig.centreX,y,depth],-angle),colour=turntableMaterial(rig,p);
   if(colour){rows[y][x]=colour;break;}
  }
 }
 const source=rows.map(row=>[...row]);
 for(let y=0;y<=rig.groundY;y++)for(let x=0;x<rig.width;x++)if(source[y][x]==='.'&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>source[y+dy]?.[x+dx]&&source[y+dy][x+dx]!=='.'))rows[y][x]='k';
 return {width:rig.width,height:rig.height,grid:rows.map(row=>row.join(''))};
}
