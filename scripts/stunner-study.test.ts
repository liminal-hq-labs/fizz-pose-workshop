// Verifies isolated weapon source fidelity, palette limits and provenance of inferred views.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import{test,expect}from'bun:test';
import{drawStunnerStudy}from'./draw-stunner-study.ts';
import study from '../source/fizz-stunner-study.json';
import skin from '../source/ben-side-skin.json';
import palette from '../source/game-palette.json';

const frames=drawStunnerStudy();
test('isolated holster and held profile preserve every pixel of the source patches',()=>{
 for(const[name,rows]of[['stunner_holstered',skin.stunner.pixels],['stunner_sideRight',skin.weapon.pixels]]as const){
  const f=frames[name],x=8-Math.floor(rows[0].length/2),y=8-Math.floor(rows.length/2);
  rows.forEach((row,dy)=>expect(f.grid[y+dy].slice(x,x+row.length)).toBe(row));
 }
 expect(frames.stunner_sideLeft.grid).toEqual(frames.stunner_sideRight.grid.map(row=>[...row].reverse().join('')));
});
test('all standalone views keep the game palette and additional angles identify their provenance',()=>{
 expect(Object.keys(frames)).toHaveLength(11);
 for(const f of Object.values(frames))expect(f.grid.every(row=>row.length===16&&[...row].every(c=>Object.hasOwn(palette,c)))).toBe(true);
 expect(study.views.find(v=>v.name==='stunner_front')!.kind).toBe('inferred');expect(study.views.find(v=>v.name==='stunner_rear')!.kind).toBe('inferred');
 expect(frames.stunner_fire.grid.join('')).toContain('C');expect(frames.stunner_fire.grid.join('')).toContain('y');
});
