// Builds editable standing rotation frames, a looping preview and a saved three-dimensional rig study.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import{mkdir,readFile,writeFile}from'node:fs/promises';
import rig from '../source/ben-turntable-rig.json';
import skin from '../source/ben-turntable-skin.json';
import{sampleTurntable,validateTurntable,type TurntableRig}from'../src/rig/turntable.ts';
import{turntableKeys,sampleTurntableSkin}from'./turntable-reference.ts';
import{gif,png,rects}from'./images.ts';
import{validateFrames}from'../src/model.ts';
import type{Frames,WorkshopData}from'../src/types.ts';

export function buildTurntable():Frames{
 validateTurntable(rig);
 const keys=turntableKeys(rig,skin);
 const frames=Object.fromEntries(Array.from({length:rig.sampleCount},(_,i)=>['ben_turn'+String(i*360/rig.sampleCount).padStart(3,'0'),sampleTurntableSkin(rig,keys,i*360/rig.sampleCount)]));
 return validateFrames(frames,frames,skin.palette);
}
export function turntableDiagram(config:TurntableRig,angle:number):string{
 const pose=sampleTurntable(config,angle);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${config.width*10}" height="${config.height*10}" viewBox="0 0 ${config.width} ${config.height}"><rect width="100%" height="100%" fill="#102018"/>`+config.connections.map((chain,i)=>`<polyline points="${chain.map(name=>pose.joints[name].pixel.join(',')).join(' ')}" fill="none" stroke="${i%2?'#a080d0':'#75edfa'}" stroke-width=".25"/>`).join('')+Object.entries(pose.joints).map(([name,j])=>`<circle cx="${j.pixel[0]}" cy="${j.pixel[1]}" r=".23" fill="${name==='stunner'?'#ff55ff':'#ffef5f'}"><title>${name}</title></circle>`).join('')+'</svg>';
}
if(import.meta.main){
 const root=new URL('../',import.meta.url),frames=buildTurntable();
 const authored:Omit<WorkshopData,'palette'>=JSON.parse(await readFile(new URL('source/poses.json',root),'utf8'));
 const edits:Frames=JSON.parse(await readFile(new URL('edits.json',root),'utf8'));
 Object.assign(authored.frames,frames);Object.assign(edits,frames);
 authored.animations['standing-360']={frames:Object.keys(frames),durationsMs:Object.keys(frames).map(()=>rig.frameMs),loop:true};
 await writeFile(new URL('source/poses.json',root),JSON.stringify(authored,null,2)+'\n');
 await writeFile(new URL('edits.json',root),JSON.stringify(edits,null,2)+'\n');
 const folder=new URL('rig/ben-turntable/',root);await mkdir(folder,{recursive:true});
 await writeFile(new URL('rig.json',folder),JSON.stringify(rig,null,2)+'\n');await writeFile(new URL('skin.json',folder),JSON.stringify(skin,null,2)+'\n');
 await writeFile(new URL('samples.json',folder),JSON.stringify({frameMs:rig.frameMs,samples:Array.from({length:rig.sampleCount},(_,i)=>sampleTurntable(rig,i*360/rig.sampleCount))},null,2)+'\n');
 const measurements=Object.fromEntries(Object.entries(skin.references).filter(([name])=>['ben_stand','ben_standRight','ben_standFront'].includes(name)).map(([name,frame])=>{
  const points=frame.grid.flatMap((row,y)=>[...row].flatMap((code,x)=>code==='.'?[]:[[x,y]]));
  const head=points.filter(p=>p[1]<=14),helmet=head.filter(p=>p[1]<=8);
  const box=(points:number[][]):{left:number;right:number;top:number;bottom:number;width:number;height:number}=>{
   const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
   return {left,right,top,bottom,width:right-left+1,height:bottom-top+1};
  };
  return [name,{body:box(points),head:box(head),helmet:box(helmet),floorShift:rig.groundY-Math.max(...points.map(p=>p[1]))}];
 }));
 await writeFile(new URL('reference-audit.json',folder),JSON.stringify({measurements,notes:['The three standing keys preserve their original pixels; only padding and ground alignment change.','The side standing bodies and missing yaw stops are inferred; the running and climbing poses are not treated as neutral standing limb poses.','Contour interpolation is a pixel-art model-sheet aid, not a uniquely reconstructed textured 3D mesh.','The projected skeleton preserves bone lengths, body height and the anatomical hip used by the Stunner.']},null,2)+'\n');
 await writeFile(new URL('sprites.gif',folder),gif(Object.values(frames),Object.keys(frames).map(()=>rig.frameMs),skin.palette));
 for(const [i,frame]of Object.values(frames).entries()){
  const degrees=String(i*360/rig.sampleCount).padStart(3,'0');
  await writeFile(new URL(`sprite-${degrees}.png`,folder),png(frame,skin.palette));
  await writeFile(new URL(`sprite-${degrees}.svg`,folder),`<svg xmlns="http://www.w3.org/2000/svg" width="${rig.width}" height="${rig.height}" viewBox="0 0 ${rig.width} ${rig.height}" shape-rendering="crispEdges">${rects(frame,skin.palette)}</svg>`);
  await writeFile(new URL(`rig-${degrees}.svg`,folder),turntableDiagram(rig,i*360/rig.sampleCount));
 }
 console.log('Saved 24 standing rotation stops, their joint tracks and reusable rig/skin.');
}
