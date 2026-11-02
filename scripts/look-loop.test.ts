// Verifies look-loop timing and reuse of the saved camera-facing artwork.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import{test,expect}from'bun:test';
import{lookLoop}from'./draw-look-loop.ts';
import poses from '../source/poses.json';

test('looking down holds each bend pose for half as long as looking up',()=>{
 const up=lookLoop.frames.indexOf('ben_frontLookUp');
 lookLoop.frames.forEach((name,i)=>{expect(poses.frames).toHaveProperty(name);if(name.startsWith('ben_frontBend'))expect(lookLoop.durationsMs[i]*2).toBe(lookLoop.durationsMs[up]);});
 expect(lookLoop.frames).toContain('ben_standFront');expect(lookLoop.loop).toBe(true);
});
