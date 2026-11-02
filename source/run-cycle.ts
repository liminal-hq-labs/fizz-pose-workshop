// Defines the ordered contacts, limb relationships and head motion of Ben's running cycle.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export type Point = readonly [number, number];
export type Limb = readonly [Point, Point, Point];
export type ShoeStyle = 'flat' | 'toeOff';
export interface RunPhase {
  readonly name: string;
  readonly contact: 'near' | 'far' | 'flight';
  readonly bob: number;
  readonly headTurn: -1 | 0 | 1;
  readonly torsoTurn: -1 | 0 | 1;
  readonly nearLeg: Limb;
  readonly farLeg: Limb;
  readonly nearArm: Limb;
  readonly farArm: Limb;
  readonly nearShoe: ShoeStyle;
  readonly farShoe: ShoeStyle;
}

export const groundY = 34;
export const frameDurationMs = 100;

// Turn −1 opens towards the camera, 0 is profile, and +1 turns slightly away.
// Each limb is shoulder/hip → elbow/knee → hand/ankle. Positive x faces right;
// positive y points down. The second three phases exchange the supporting leg.
export const runPhases: readonly RunPhase[] = [
  {
    name: 'Near contact', contact: 'near', bob: 1, headTurn: -1, torsoTurn: -1,
    nearLeg: [[13, 25], [16, 28], [16, 32]],
    farLeg: [[12, 25], [9, 28], [5, 26]],
    nearArm: [[12, 17], [10, 20], [8, 18]],
    farArm: [[16, 17], [18, 20], [20, 18]],
    nearShoe: 'flat', farShoe: 'flat',
  },
  {
    name: 'Near push-off', contact: 'near', bob: 0, headTurn: 0, torsoTurn: 0,
    nearLeg: [[13, 24], [12, 28], [8, 30]],
    farLeg: [[12, 24], [15, 26], [14, 29]],
    nearArm: [[13, 17], [13, 21], [16, 20]],
    farArm: [[15, 17], [15, 21], [12, 20]],
    nearShoe: 'toeOff', farShoe: 'flat',
  },
  {
    name: 'Flight · far leg leads', contact: 'flight', bob: -1, headTurn: 1, torsoTurn: 1,
    nearLeg: [[13, 23], [10, 27], [6, 25]],
    farLeg: [[12, 23], [16, 26], [18, 30]],
    nearArm: [[14, 17], [16, 20], [18, 18]],
    farArm: [[14, 17], [12, 20], [10, 18]],
    nearShoe: 'flat', farShoe: 'flat',
  },
  {
    name: 'Far contact', contact: 'far', bob: 1, headTurn: 1, torsoTurn: 1,
    nearLeg: [[13, 25], [10, 28], [6, 26]],
    farLeg: [[12, 25], [16, 28], [16, 32]],
    nearArm: [[14, 17], [16, 20], [18, 18]],
    farArm: [[14, 17], [11, 20], [9, 18]],
    nearShoe: 'flat', farShoe: 'flat',
  },
  {
    name: 'Far push-off', contact: 'far', bob: 0, headTurn: 0, torsoTurn: 0,
    nearLeg: [[13, 24], [15, 26], [15, 29]],
    farLeg: [[12, 24], [11, 28], [8, 30]],
    nearArm: [[13, 17], [13, 21], [10, 20]],
    farArm: [[15, 17], [15, 21], [18, 20]],
    nearShoe: 'flat', farShoe: 'toeOff',
  },
  {
    name: 'Flight · near leg leads', contact: 'flight', bob: -1, headTurn: -1, torsoTurn: -1,
    nearLeg: [[13, 23], [17, 26], [18, 30]],
    farLeg: [[12, 23], [9, 27], [5, 25]],
    nearArm: [[12, 17], [10, 20], [8, 18]],
    farArm: [[16, 17], [18, 20], [20, 18]],
    nearShoe: 'flat', farShoe: 'flat',
  },
];
