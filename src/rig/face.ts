// Projects facial landmarks from head-local rig coordinates and snaps them with one shared head anchor.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { add, radians, type Vec2 } from './kinematics.ts';
import type { Frame } from '../types.ts';

export interface FaceSettings { yawDegrees: number; eye: number[]; mouth: number[]; }
export interface FaceLandmark { local: Vec2; world: Vec2; pixel: Vec2; }
export interface FacePose { anchor: Vec2; pixelAnchor: Vec2; yaw: number; eye: FaceLandmark; mouth: FaceLandmark; }
export function sampleFace(anchor: Vec2, turn: number, settings: FaceSettings): FacePose {
  const yaw = radians(settings.yawDegrees) * turn;
  const pixelAnchor: Vec2 = [Math.round(anchor[0]), Math.round(anchor[1])];
  const project = (point: number[]): FaceLandmark => {
    const local: Vec2 = [point[0] * Math.cos(yaw) + point[2] * Math.sin(yaw), point[1]];
    // Round in head space first; independent world rounding would reintroduce pixel drift.
    return { local, world: add(anchor, local), pixel: add(pixelAnchor, [Math.round(local[0]), Math.round(local[1])]) };
  };
  return { anchor, pixelAnchor, yaw, eye: project(settings.eye), mouth: project(settings.mouth) };
}
export function facePixels(frame: Frame, colour: string, anchor: Vec2): Vec2[] {
  const result: Vec2[] = [];
  for (let y = Math.max(0, anchor[1] - 13); y <= Math.min(frame.height - 1, anchor[1]); y++) {
    for (let x = Math.max(0, anchor[0] - 7); x <= Math.min(frame.width - 1, anchor[0] + 7); x++) if (frame.grid[y][x] === colour) result.push([x, y]);
  }
  return result;
}
