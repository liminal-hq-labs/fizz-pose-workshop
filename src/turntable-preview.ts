// Previews a standing 360° study with independent playback, angle stops and projected rig landmarks.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import rig from '../source/ben-turntable-rig.json';
import{sampleTurntable}from'./rig/turntable.ts';
import type{WorkshopData,Frame}from'./types.ts';

export function mountTurntable(data:WorkshopData):void{
 const mount=document.querySelector<HTMLElement>('#turntable');if(!mount)return;const section:HTMLElement=mount;
 const name=(angle:number):string=>({0:'Front · original stand',45:'Right front quarter · original stand',90:'Right profile · running reference',135:'Right rear quarter',180:'Rear · climbing reference',225:'Left rear quarter',270:'Left profile · running reference',315:'Left front quarter · original stand'} as Record<number,string>)[angle]??'Intermediate turn';
 section.innerHTML=`<h2>Standing turntable · 360°</h2><p>One standing post, 24 stops, 15° apart. The front and front quarters preserve the saved standing artwork; running supplies the true side design, and climbing supplies the rear head. Playback here is independent of the action loops.</p><div class="controls"><button id="turn-play">Pause rotation</button><button id="turn-prev">Previous angle</button><button id="turn-next">Next angle</button><label>Rotation speed <select id="turn-speed"><option value="0.5">Half</option><option value="1" selected>Normal</option><option value="2">Double</option></select></label><label><input id="turn-overlay" type="checkbox">Show body rig</label><button id="turn-edit">Edit this angle</button></div><label class="rig-scrubber">Angle <input id="turn-angle" type="range" min="0" max="23" value="0"><output id="turn-label"></output></label><div class="turntable-stage"><canvas id="turn-avatar" width="320" height="440" role="img" aria-label="Ben standing and rotating through 360 degrees"></canvas></div><p class="small"><a href="animations/standing-360.svg">Animated SVG</a> · <a href="animations/standing-360.gif">GIF</a> · <a href="rig/ben-turntable/rig.json">Rotation rig</a> · <a href="rig/ben-turntable/skin.json">Reference skin</a> · <a href="rig/ben-turntable/samples.json">Tracked body landmarks</a></p><div class="turntable-stops"></div>`;
 const $=<T extends HTMLElement>(q:string):T=>section.querySelector<T>(q)!;
 const avatar=$<HTMLCanvasElement>('#turn-avatar'),slider=$<HTMLInputElement>('#turn-angle'),play=$<HTMLButtonElement>('#turn-play'),overlay=$<HTMLInputElement>('#turn-overlay');
 const stops=$<HTMLElement>('.turntable-stops'),thumbs:HTMLCanvasElement[]=[];
 let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,time=0,last=performance.now(),speed=1;
 const frameName=(i:number):string=>'ben_turn'+String(i*15).padStart(3,'0');
 const index=():number=>Math.floor(time/rig.frameMs)%rig.sampleCount;
 const updateButton=():void=>{play.textContent=playing?'Pause rotation':'Play rotation';play.setAttribute('aria-pressed',String(playing));};
 const choose=(i:number):void=>{time=((i+24)%24)*rig.frameMs;playing=false;updateButton();};
 play.onclick=()=>{playing=!playing;updateButton();};updateButton();
 $<HTMLButtonElement>('#turn-prev').onclick=()=>choose(index()-1);$<HTMLButtonElement>('#turn-next').onclick=()=>choose(index()+1);
 $<HTMLSelectElement>('#turn-speed').onchange=e=>{speed=Number((e.target as HTMLSelectElement).value);};slider.oninput=()=>choose(Number(slider.value));
 if(!document.querySelector('#edit-frame'))$<HTMLButtonElement>('#turn-edit').hidden=true;
 $<HTMLButtonElement>('#turn-edit').onclick=()=>{const select=document.querySelector<HTMLSelectElement>('#edit-frame');if(select){select.value=frameName(index());select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#editor')?.scrollIntoView({behavior:'smooth'});}};
 for(let i=0;i<24;i++){
  const card=document.createElement('article'),button=document.createElement('button'),canvas=document.createElement('canvas'),title=document.createElement('p');
  canvas.width=32;canvas.height=44;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`Standing rotation ${i*15} degrees`);
  button.append(canvas);button.onclick=()=>choose(i);button.setAttribute('aria-label',`Inspect ${i*15} degrees`);title.textContent=`${i*15}° · ${name(i*15)}`;card.append(button,title);stops.append(card);thumbs.push(canvas);
 }
 const draw=(canvas:HTMLCanvasElement,frame:Frame,scale:number):void=>{const c=canvas.getContext('2d')!;c.clearRect(0,0,canvas.width,canvas.height);frame.grid.forEach((row,y)=>[...row].forEach((code,x)=>{const colour=data.palette[code];if(colour){c.fillStyle=colour;c.fillRect(x*scale,y*scale,scale,scale);}}));};
 const cache:string[]=[];
 function tick(now:number):void{
  if(playing)time=(time+Math.max(0,Math.min(100,now-last))*speed)%(rig.frameMs*24);last=now;
  const i=index(),angle=i*15;draw(avatar,data.frames[frameName(i)],10);
  if(overlay.checked){const c=avatar.getContext('2d')!,pose=sampleTurntable(rig,angle);c.save();c.scale(10,10);c.lineWidth=.18;
   for(const [n,chain]of rig.connections.entries()){c.strokeStyle=n%2?'#c095f5':'#75edfa';c.beginPath();chain.forEach((joint,j)=>{const p=pose.joints[joint].pixel;j?c.lineTo(...p):c.moveTo(...p);});c.stroke();}
   for(const [joint,p]of Object.entries(pose.joints)){c.fillStyle=joint==='stunner'?'#ff55ff':'#ffff55';c.beginPath();c.arc(...p.pixel,.22,0,Math.PI*2);c.fill();}c.restore();
  }
  for(let j=0;j<24;j++){const frame=data.frames[frameName(j)],signature=frame.grid.join('');if(cache[j]!==signature){draw(thumbs[j],frame,1);cache[j]=signature;}stops.children[j].setAttribute('aria-current',String(i===j));}
  slider.value=String(i);$<HTMLOutputElement>('#turn-label').textContent=`${angle}° · ${name(angle)}`;section.dataset.angle=String(angle);requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);
}
