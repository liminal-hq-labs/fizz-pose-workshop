// Verifies that rig-derived facial dots stay attached to the same head-local pixels.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import rig from '../source/ben-side-rig.json';
import skin from '../source/ben-side-skin.json';
import { sampleRunRig } from '../src/rig/run.ts';
import { sampleFace, facePixels } from '../src/rig/face.ts';
import { drawRunCycle } from './draw-run-cycle.ts';
import { skinRig } from './rig-skin.ts';
import pinned from './fixtures/pinned-reference-motion.json';

test('small camera turns cannot push eye and mouth across independent world rounding boundaries', () => {
  // Continuous features only: the discrete `featureTurn` poses deliberately move the dots by a whole pixel.
  const continuous = { ...rig.face, featureTurn: undefined };
  const towards = sampleFace([10.49, 20.49], -1, continuous), away = sampleFace([10.49, 20.49], 1, continuous);
  expect(Math.round(towards.eye.world[0])).not.toBe(Math.round(away.eye.world[0]));
  expect(towards.eye.pixel).toEqual(away.eye.pixel); expect(towards.mouth.pixel).toEqual(away.mouth.pixel);
  expect(towards.eye.pixel).toEqual([12, 15]); expect(towards.mouth.pixel).toEqual([12, 17]);
});
test('facial landmarks share one right-and-left shift while following the rig anchor', () => {
  for (let i = 0; i <= 240; i++) {
    const pose = sampleRunRig(rig, i / 240), face = pose.face;
    expect(face.anchor).toEqual(pose.neck);
    expect([face.eye.pixel[0] - face.pixelAnchor[0], face.eye.pixel[1] - face.pixelAnchor[1]]).toEqual([2 + face.pixelShift, -5]);
    expect([face.mouth.pixel[0] - face.pixelAnchor[0], face.mouth.pixel[1] - face.pixelAnchor[1]]).toEqual([2 + face.pixelShift, -3]);
    expect(face.eye.pixel[0]).toBe(face.mouth.pixel[0]); expect(face.mouth.pixel[1] - face.eye.pixel[1]).toBe(2);
    expect(Math.abs(face.eye.local[0] - rig.face.eye[0] - face.shift)).toBeLessThan(.1);
    expect(face.eye.pixel[0] - face.ear.pixel[0]).toBe(3 + face.pixelShift);
    expect(face.ear.pixel[1] - face.eye.pixel[1]).toBe(1);
  }
});
test('all six actual sprite grids contain exactly the rig eye and mouth, including the loop seam', () => {
  const frames = Object.values(drawRunCycle()), positions = [];
  for (const [i, frame] of frames.entries()) {
    const face = sampleRunRig(rig, i / rig.sampleCount).face;
    expect(facePixels(frame, skin.face.eye, face.pixelAnchor)).toEqual(face.eyePixels);
    expect(facePixels(frame, skin.face.mouth, face.pixelAnchor)).toEqual(face.mouthPixels);
    expect(frame.grid[face.eye.pixel[1]][face.eye.pixel[0]]).toBe(skin.face.eye);
    expect(frame.grid[face.mouth.pixel[1]][face.mouth.pixel[0]]).toBe(skin.face.mouth);
    positions.push(face.eye.pixel);
  }
  expect(positions).toEqual([[17, 10], [18, 10], [18, 9], [17, 10], [16, 10], [17, 9]]);
  for (let i = 0; i < positions.length; i++) {
    const next = positions[(i + 1) % positions.length];
    expect(Math.abs(positions[i][0] - next[0])).toBeLessThanOrEqual(3);
    expect(Math.abs(positions[i][1] - next[1])).toBeLessThanOrEqual(1);
  }
});

// The head turn leads the stride slightly, so the away pose spans frames 2 and 3, the camera-facing peak is frame 5 and
// frame 6 eases back to the profile features while keeping the camera-facing shading.
test('six head-local samples turn away for two frames, then towards the camera for one peak frame', () => {
  expect(Array.from({length: 6}, (_, i) => sampleRunRig(rig, i / 6).face.pixelShift)).toEqual([0, 1, 1, 0, -1, 0]);
});

test('nose silhouette tucks into the head at either turn while the ear and jaw stay still', () => {
 const frames=Object.values(drawRunCycle());
 for(const [i,frame]of frames.entries()){
  const face=sampleRunRig(rig,i/6).face;
  expect(face.ear.pixel[0]-face.pixelAnchor[0]).toBe(-1);expect(face.chin.pixel[0]-face.pixelAnchor[0]).toBe(0);
  expect(Math.abs(face.pixelShift)).toBeLessThanOrEqual(2);
  expect(frame.grid[face.nose.pixel[1]][face.nose.pixel[0]]).toBe('k');
  expect(frame.grid[face.noseTip.pixel[1]][face.noseTip.pixel[0]]).toBe(face.noseVisible?'k':'.');
  expect(face.noseVisible).toBe(i===0||i===3||i===5);
 }
});
test('the mouth keeps its front pixel on the profile edge and widens backwards as the face turns towards the camera', () => {
 const faces=Array.from({length:6},(_,i)=>sampleRunRig(rig,i/6).face);
 for(const f of faces){
  const xs=f.mouthPixels.map(p=>p[0]-f.pixelAnchor[0]);
  expect(xs.at(-1)).toBe(rig.face.mouthFront);
  xs.forEach((x,i)=>expect(x).toBe(xs[0]+i));
  // The mouth always includes the pixel under the near eye.
  expect(xs).toContain(f.eye.pixel[0]-f.pixelAnchor[0]);
 }
 // One pixel turned away, two in profile (frames 1, 4 and 6) and three at the camera-facing peak.
 expect(faces.map(f=>f.mouthPixels.map(p=>p[0]))).toEqual([[17,18],[18],[18],[17,18],[16,17,18],[17,18]]);
 // Only the camera-facing peak reveals the far eye, in front of the near eye.
 expect(faces.map(f=>f.eyePixels.map(p=>p[0]))).toEqual([[17],[18],[18],[17],[16,18],[17]]);
 const xs=faces.flatMap(f=>[...f.eyePixels,...f.mouthPixels].map(p=>p[0]));
 expect(Math.max(...xs)-Math.min(...xs)).toBeLessThanOrEqual(2);
});
test('the rig alone redraws the six saved run faces, without relying on editor overrides', () => {
 // The pinned frames hold the hand-edited faces; the rig and skin reproduce them so a redraw does not lose them.
 for(const [name,frame] of Object.entries(drawRunCycle())) expect(frame).toEqual(pinned.frames[name as keyof typeof pinned.frames]);
});

test('eye anchor travels at most two canvas pixels including the body bob, with the mouth following',()=>{
 const faces=Array.from({length:241},(_,i)=>sampleRunRig(rig,i/240).face);
 const xs=faces.map(f=>f.eye.pixel[0]),ys=faces.map(f=>f.eye.pixel[1]);
 expect(Math.max(...xs)-Math.min(...xs)).toBeLessThanOrEqual(2);
 expect(Math.max(...ys)-Math.min(...ys)).toBeLessThanOrEqual(1);
 for(const f of faces){expect(f.mouth.pixel[0]).toBe(f.eye.pixel[0]);expect(f.mouth.pixel[1]-f.eye.pixel[1]).toBe(2);}
});

// The run's head turn is carried by the face sliding inside a still helmet, not by the helmet itself hopping.
test('the running helmet keeps one column and bobs the same way in both strides', () => {
 const faces=Array.from({length:6},(_,i)=>sampleRunRig(rig,i/6).face);
 expect(new Set(faces.map(f=>f.pixelAnchor[0])).size).toBe(1);
 for(let i=0;i<3;i++)expect(faces[i+3].pixelAnchor).toEqual(faces[i].pixelAnchor);
});
test('the collar rests directly on the shirt in every running sprite, with no ink gap under the neck', () => {
 for(const [i,frame] of Object.values(drawRunCycle()).entries()){
  const [x,y]=sampleRunRig(rig,i/rig.sampleCount).face.pixelAnchor;
  // The collar is head-local row 14, on the anchor row, with white from two pixels behind the anchor to one in front.
  expect(frame.grid[y].slice(x-2,x+2)).toBe('WWWW');
  expect(frame.grid[y+1].slice(x-2,x+2)).toMatch(/[^k.]/);
 }
});
test('turning the head never speckles the face with alternating grey and skin pixels', () => {
 for(let i=0;i<=240;i++){
  const pose=sampleRunRig(rig,i/240),frame=skinRig(rig,skin,pose),y=pose.face.pixelAnchor[1];
  // Face rows run from just below the brim (head-local 9) to the jaw (head-local 12): the back shade and the ear may form two grey runs at most.
  for(let row=y-5;row<=y-2;row++)expect(frame.grid[row].match(/L+/g)?.length??0).toBeLessThanOrEqual(2);
 }
});
