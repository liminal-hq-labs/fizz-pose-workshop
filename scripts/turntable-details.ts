// Paints separate trouser legs, directional high-tops and the hip Stunner over inferred turntable views.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import{sampleTurntable,type TurntableRig}from'../src/rig/turntable.ts';
import type{Frame}from'../src/types.ts';

import shoes from '../source/ben-turntable-shoes.json';

export function refineTurntableBody(frame:Frame,rig:TurntableRig,angle:number):Frame{
 const yaw=((angle%360)+360)%360;if([0,45,315].includes(yaw))return frame;
 const rows=frame.grid.map(row=>[...row]);for(let y=24;y<=rig.groundY;y++)rows[y].fill('.');
 const put=(x:number,y:number,c:string):void=>{if(c!=='.'&&x>=0&&x<rig.width&&y>=0&&y<=rig.groundY)rows[y][x]=c;};
 const pose=sampleTurntable(rig,yaw),sin=Math.sin(yaw*Math.PI/180),front=Math.cos(yaw*Math.PI/180);
 const legs=['right','left'].map(side=>({side,hip:pose.joints[side+'Hip'],knee:pose.joints[side+'Knee'],ankle:pose.joints[side+'Ankle']})).sort((a,b)=>a.ankle.camera[2]-b.ankle.camera[2]);
 const shape=Math.abs(sin)<.3?(front>0?shoes.front:shoes.rear):Math.abs(sin)>.85?shoes.side:front>0?shoes.quarter:shoes.rearQuarter;
 legs.forEach((leg,index)=>{
  const far=index===0,soleY=rig.groundY-(far?Math.round(2*Math.abs(sin)):0),ankleX=leg.ankle.pixel[0];
  const targetWidth=Math.round(shoes.frontWidth+(shoes.profileWidth-shoes.frontWidth)*Math.min(1,Math.abs(sin)*Math.SQRT2));
  const nativeWidth=shape[0].length;
  const resized=shape.map(row=>Array.from({length:targetWidth},(_,x)=>row[Math.round(x*(nativeWidth-1)/(targetWidth-1))]).join(''));
  const shoe=resized.map(row=>sin<0?[...row].reverse().join(''):row).map(row=>far&&Math.abs(sin)>.3?row.replaceAll('W','L').replaceAll('y','R'):row);
  const shoeTop=soleY-shoe.length+1;
  for(let y=24;y<=shoeTop+1;y++){
   const t=(y-24)/Math.max(1,shoeTop+1-24),cx=Math.round(leg.hip.pixel[0]+(ankleX-leg.hip.pixel[0])*t);
   put(cx-1,y,'k');put(cx,y,'B');put(cx+1,y,'c');put(cx+2,y,'k');
  }
  const anchor=shoe[0].indexOf('B');
  const x0=ankleX-(anchor>=0?anchor:Math.floor(shoe[0].length/2));
  shoe.forEach((row,dy)=>[...row].forEach((c,dx)=>put(x0+dx,shoeTop+dy,c)));
 });
 // Restore a belt colour where contour interpolation had leaked denim above the hips.
 for(let x=0;x<rig.width;x++)if(rows[23][x]==='B'||rows[23][x]==='c')rows[23][x]='D';
 const holster=pose.joints.stunner;
 if(holster.camera[2]>=-.5){const x=holster.pixel[0]-1;['kDDk','kMmk','kMMk','.kMk','..k.'].forEach((row,dy)=>[...row].forEach((c,dx)=>put(x+dx,24+dy,c)));}
 return {...frame,grid:rows.map(row=>row.join(''))};
}
