// Runs the Classic Fizz gallery and shared pixel editor.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import original from '../assets.json';
import { initialiseEditor } from './editor.js';
const DATA = structuredClone(original);
const motionNames={'walk-run':'Walk / run','pogo':'Pogo · extend / compress','climb':'Ladder climb','mantle':'Ledge pull-up · grip / haul / push','fizz-blaster':'Fizz Blaster · recoil'};
function card(title,key,animated,extra=''){return `<article><div class="stage"><canvas role="img" aria-label="${title}" data-${animated?'animation':'frame'}="${key}" ${extra}></canvas></div><h3>${title}</h3><p>${animated?`<a href="animations/${key}.svg">Animated SVG</a> · <a href="animations/${key}.gif">GIF</a>`:`<a href="frames/${key}.png">PNG</a> · <a href="frames/${key}.svg">SVG</a>`}</p></article>`;}
document.querySelector('#motions').innerHTML=Object.entries(motionNames).map(([k,v])=>card(v,k,true)).join('');
const directionNames={NW:'North-west',N:'North',NE:'North-east',W:'West',E:'East',SW:'South-west',S:'South',SE:'South-east'};
document.querySelector('#compass').innerHTML=['NW','N','NE','W',null,'E','SW','S','SE'].map(d=>d?card(directionNames[d],'overworld-'+d,true,'data-topdown="true"'):'<div aria-hidden="true" style="display:grid;place-items:center;color:#a9ee73">N ↑</div>').join('');
document.querySelector('#frames').innerHTML=Object.keys(DATA.frames).map(k=>card(k.replace('ben_','').replaceAll('_',' '),k,false,k.startsWith('benMap')?'data-topdown="true"':'')).join('');
let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,elapsed=0,last=performance.now(),scale=6,speed=1;
const btn=document.querySelector('#play');function updateButton(){btn.textContent=playing?'Pause animations':'Play animations';btn.setAttribute('aria-pressed',String(playing));}updateButton();btn.onclick=()=>{playing=!playing;updateButton();};
document.querySelector('#scale').onchange=e=>{scale=Number(e.target.value);};document.querySelector('#speed').onchange=e=>{speed=Number(e.target.value);};document.querySelector('#flip').onchange=e=>{document.documentElement.style.setProperty('--facing',e.target.checked?-1:1);};
const canvases=[...document.querySelectorAll('canvas')];
function tick(now){if(playing)elapsed+=(now-last)*speed;last=now;for(const c of canvases){let key=c.dataset.frame;if(c.dataset.animation){const a=DATA.animations[c.dataset.animation];let t=elapsed%a.durationsMs.reduce((s,v)=>s+v,0),i=0;while(i<a.frames.length-1&&t>=a.durationsMs[i]){t-=a.durationsMs[i];i++;}key=a.frames[i];}const f=DATA.frames[key];if(c.width!==f.width||c.height!==f.height){c.width=f.width;c.height=f.height;}const top=c.dataset.topdown;const actualScale=top&&innerWidth<600?3:scale;c.style.width=f.width*actualScale+'px';c.style.height=f.height*actualScale+'px';if(top)c.style.transform='none';const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const colour=DATA.palette[f.grid[y][x]];if(colour){ctx.fillStyle=colour;ctx.fillRect(x,y,1,1);}}}requestAnimationFrame(tick);}requestAnimationFrame(tick);

initialiseEditor(DATA);
