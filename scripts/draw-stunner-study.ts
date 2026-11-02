// Extracts native Fizz Stunner patches and registers labelled standalone views and firing studies.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import{readFile,writeFile}from'node:fs/promises';
import study from '../source/fizz-stunner-study.json';
import palette from '../source/game-palette.json';
import{validateFrames}from'../src/model.ts';
import type{Frames,WorkshopData}from'../src/types.ts';

export function drawStunnerStudy():Frames{
 const frames:Frames={};
 for(const view of study.views){
  const grid=Array.from({length:study.height},()=>Array<string>(study.width).fill('.'));
  const cx=view.flash?6:8,cy=8,w=view.rows[0].length,h=view.rows.length,angle=(view.angle??0)*Math.PI/180;
  for(let y=0;y<study.height;y++)for(let x=0;x<study.width;x++){
   const dx=x-cx,dy=y-cy,sx=Math.round(dx*Math.cos(angle)+dy*Math.sin(angle)+Math.floor(w/2)),sy=Math.round(-dx*Math.sin(angle)+dy*Math.cos(angle)+Math.floor(h/2));
   if(sy>=0&&sy<h&&sx>=0&&sx<w&&view.rows[sy][sx]!=='.')grid[y][x]=view.rows[sy][sx];
  }
  if(view.flash){const x=cx+w-Math.floor(w/2),y=cy-1;for(const[dx,dy,c]of[[0,0,'y'],[1,0,'W'],[1,-1,'C'],[1,1,'C'],[2,0,'C']]as const)grid[y+dy][x+dx]=c;}
  frames[view.name]={width:study.width,height:study.height,grid:grid.map(row=>row.join(''))};
 }
 return validateFrames(frames,frames,palette);
}
if(import.meta.main){
 const root=new URL('../',import.meta.url),file=new URL('source/poses.json',root),editsFile=new URL('edits.json',root);
 const data:Omit<WorkshopData,'palette'>=JSON.parse(await readFile(file,'utf8')),edits:Frames=JSON.parse(await readFile(editsFile,'utf8')),frames=drawStunnerStudy();
 Object.assign(data.frames,frames);Object.assign(edits,frames);
 data.animations['stunner-views']={frames:['stunner_front','stunner_quarterRight','stunner_sideRight','stunner_rearQuarterRight','stunner_rear','stunner_rearQuarterLeft','stunner_sideLeft','stunner_quarterLeft'],durationsMs:Array(8).fill(240),loop:true};
 data.animations['stunner-fire']={frames:['stunner_sideRight','stunner_fire','stunner_recoil','stunner_sideRight'],durationsMs:[300,80,120,400],loop:true};
 await writeFile(file,JSON.stringify(data,null,2)+'\n');await writeFile(editsFile,JSON.stringify(edits,null,2)+'\n');
 console.log(`Saved ${Object.keys(frames).length} isolated Fizz Stunner sprites and two previews.`);
}
