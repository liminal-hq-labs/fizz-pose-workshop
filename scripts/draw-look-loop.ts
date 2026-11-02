// Registers a front-facing look-and-bend loop using the saved hand-edited sprite studies.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {readFile,writeFile} from 'node:fs/promises';
import type {Animation,WorkshopData} from '../src/types.ts';
export const lookLoop: Animation = {
 frames:['ben_standFront','ben_frontLookUp','ben_standFront','ben_frontBendHalf','ben_frontBendFull','ben_frontBendHalf'],
 durationsMs:[200,800,200,400,400,400], loop:true,
};
if(import.meta.main){
 const file=new URL('../source/poses.json',import.meta.url);
 const data:Omit<WorkshopData,'palette'>=JSON.parse(await readFile(file,'utf8'));
 data.animations['look-up-down']=lookLoop;
 await writeFile(file,JSON.stringify(data,null,2)+'\n');
 console.log('Saved the front-facing look loop: 800 ms looking up, 400 ms per downward bend pose.');
}
