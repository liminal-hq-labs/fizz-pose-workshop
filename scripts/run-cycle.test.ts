// Verifies run kinematics, rendered foot contacts and continuity across the loop boundary.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { drawRunCycle } from './draw-run-cycle.ts';
import { runPhases, groundY, frameDurationMs, type Limb } from '../source/run-cycle.ts';
import palette from '../source/game-palette.json';

const frames = Object.values(drawRunCycle());
function bend(limb: Limb): number {
  const [root, joint, end] = limb;
  const a = [root[0] - joint[0], root[1] - joint[1]], b = [end[0] - joint[0], end[1] - joint[1]];
  return Math.acos((a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b))) * 180 / Math.PI;
}
test('six phases alternate contact, push-off and flight with opposite arm and leg leads', () => {
  expect(runPhases.map(phase => phase.contact)).toEqual(['near', 'near', 'flight', 'far', 'far', 'flight']);
  expect(frameDurationMs * runPhases.length).toBe(600);
  for (const phase of runPhases) {
    for (const [leg, arm] of [[phase.nearLeg, phase.nearArm], [phase.farLeg, phase.farArm]]) {
      expect((leg[2][0] - leg[0][0]) * (arm[2][0] - arm[0][0])).toBeLessThan(0);
      expect(bend(arm)).toBeGreaterThan(30); expect(bend(arm)).toBeLessThan(150);
      expect(bend(leg)).toBeGreaterThan(30); expect(bend(leg)).toBeLessThan(165);
    }
  }
});
test('rendered soles alternate support, flex at toe-off and clear the ground in flight', () => {
  for (const [index, phase] of runPhases.entries()) {
    const frame = frames[index], floor = frame.grid[groundY];
    const white = [...floor].filter(code => code === 'W').length, grey = [...floor].filter(code => code === 'L').length;
    if (phase.contact === 'flight') { expect(white + grey).toBe(0); }
    else {
      const visible = phase.contact === 'near' ? white : grey;
      const other = phase.contact === 'near' ? grey : white;
      expect(visible).toBe(index === 1 || index === 4 ? 2 : 5); expect(other).toBe(0);
    }
    expect(frame.grid.slice(groundY + 1).every(row => row === '.'.repeat(frame.width))).toBe(true);
    expect(frame.grid.join('')).toContain('M');
    expect(frame.grid.every(row => [...row].every(code => Object.hasOwn(palette, code)))).toBe(true);
  }
});
test('both flight-to-contact transitions drop the leading foot gently without resetting the arms', () => {
  for (const [flightIndex, landingIndex, leading] of [[2, 3, 'farLeg'], [5, 0, 'nearLeg']] as const) {
    const flight = runPhases[flightIndex], landing = runPhases[landingIndex];
    expect(landing[leading][2][0] - flight[leading][2][0]).toBe(-2);
    expect(landing[leading][2][1] - flight[leading][2][1]).toBe(2);
    expect(landing.headTurn).toBe(flight.headTurn);
    for (const arm of ['nearArm', 'farArm'] as const) expect(Math.abs(landing[arm][2][0] - flight[arm][2][0])).toBeLessThanOrEqual(1);
  }
});

 test('camera turns come from facial and shoulder changes while the head centre stays fixed', () => {
  expect(runPhases.map(phase => phase.headTurn)).toEqual([-1, 0, 1, 1, 0, -1]);
  for (const [index, phase] of runPhases.entries()) {
    expect(phase.nearArm[0][0]).toBe(13 + phase.torsoTurn);
    expect(phase.farArm[0][0]).toBe(15 - phase.torsoTurn);
    // Every crown uses the same horizontal anchor; turning changes only tiny eye, mouth and cheek details.
    expect(frames[index].grid[2 + phase.bob].indexOf('k')).toBe(13);
    const eyes = frames[index].grid.slice(0, 14 + phase.bob).join('').split('B').length - 1;
    expect(eyes).toBe(1);
    expect(frames[index].grid[9 + phase.bob].indexOf('B')).toBe(18 + phase.headTurn);
  }
 });
