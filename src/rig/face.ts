// Projects facial landmarks from head-local rig coordinates and snaps them with one shared head anchor.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { add, radians, rotate, type Vec2 } from './kinematics.ts';
import type { Frame } from '../types.ts';

export interface FaceSettings { yawDegrees: number; eye: number[]; mouth: number[]; ear: number[]; shiftAmplitude: number; shiftLimits?: number[]; eyeTravelPixels?: number; mouthWidth?: number; mouthFront?: number; profile: { nose: number[]; cheek: number[]; chin: number[] }; }
export interface FaceLandmark { local: Vec2; world: Vec2; pixel: Vec2; }
export interface FacePose { anchor: Vec2; pixelAnchor: Vec2; yaw: number; shift: number; pixelShift: number; eye: FaceLandmark; mouth: FaceLandmark; mouthPixels: Vec2[]; ear: FaceLandmark; nose: FaceLandmark; noseTip: FaceLandmark; noseVisible: boolean; cheek: FaceLandmark; chin: FaceLandmark; }
// `snappedAnchor` lets a rig seat the head on its own quantised body instead of rounding the continuous neck.
export function sampleFace(anchor: Vec2, turn: number, settings: FaceSettings, time = 0, angle = 0, restAnchor?: Vec2, snappedAnchor?: Vec2): FacePose {
  const yaw = radians(settings.yawDegrees) * turn;
  const rawShift = settings.shiftAmplitude * Math.sin(time * Math.PI * 2);
  let shift = Math.max(settings.shiftLimits?.[0] ?? -Infinity, Math.min(settings.shiftLimits?.[1] ?? Infinity, rawShift));
  let pixelShift = Math.round(shift);
  const pixelAnchor: Vec2 = snappedAnchor ? [snappedAnchor[0], snappedAnchor[1]] : [Math.round(anchor[0]), Math.round(anchor[1])];
  if (restAnchor && settings.eyeTravelPixels !== undefined) {
    const projectedEye = settings.eye[0] * Math.cos(yaw) + settings.eye[2] * Math.sin(yaw);
    const half = settings.eyeTravelPixels / 2;
    const restPixel = Math.round(restAnchor[0]) + Math.round(settings.eye[0]);
    const restWorld = restAnchor[0] + settings.eye[0];
    shift = Math.max(restWorld-half,Math.min(restWorld+half,anchor[0]+projectedEye+shift))-anchor[0]-projectedEye;
    pixelShift = Math.max(restPixel-half,Math.min(restPixel+half,pixelAnchor[0]+Math.round(projectedEye)+pixelShift))-pixelAnchor[0]-Math.round(projectedEye);
  }
  const project = (point: number[], moves = true): FaceLandmark => {
    const featureShift = moves ? shift : 0, snappedShift = moves ? pixelShift : 0;
    const horizontal = point[0] * Math.cos(yaw) + point[2] * Math.sin(yaw);
    const local = rotate([horizontal + featureShift, point[1]], angle);
    const snapped = rotate([Math.round(horizontal) + snappedShift, Math.round(point[1])], angle);
    // Round in head space first; independent world rounding would reintroduce pixel drift.
    return { local, world: add(anchor, local), pixel: add(pixelAnchor, [Math.round(snapped[0]), Math.round(snapped[1])]) };
  };
  const noseVisible = Math.abs(turn) < .45;
  const noseTip = project(settings.profile.nose, false);
  const nose = project([settings.profile.nose[0] - (noseVisible ? 0 : 1), settings.profile.nose[1], settings.profile.nose[2]], false);
  const mouth = project(settings.mouth);
  // A fixed-width mouth starts under the eye and slides back only where the head-local profile edge (`mouthFront`) stops it.
  // Without `mouthWidth`, the mouth is one pixel and widens backwards on the camera-facing turn.
  const width = settings.mouthWidth, front = width ? Math.min(mouth.pixel[0] + width - 1, pixelAnchor[0] + (settings.mouthFront ?? Infinity)) : 0;
  const mouthPixels: Vec2[] = width ? Array.from({ length: width }, (_, i): Vec2 => [front - width + 1 + i, mouth.pixel[1]])
    : turn < -.45 ? [project([settings.mouth[0] - 1, settings.mouth[1], settings.mouth[2]]).pixel, mouth.pixel] : [mouth.pixel];
  return { anchor, pixelAnchor, yaw, shift, pixelShift, eye: project(settings.eye), mouth, mouthPixels, ear: project(settings.ear, false), nose, noseTip, noseVisible, cheek: project(settings.profile.cheek, false), chin: project(settings.profile.chin, false) };
}
export function facePixels(frame: Frame, colour: string, anchor: Vec2): Vec2[] {
  const result: Vec2[] = [];
  for (let y = Math.max(0, anchor[1] - 13); y <= Math.min(frame.height - 1, anchor[1]); y++) {
    for (let x = Math.max(0, anchor[0] - 7); x <= Math.min(frame.width - 1, anchor[0] + 7); x++) if (frame.grid[y][x] === colour) result.push([x, y]);
  }
  return result;
}
