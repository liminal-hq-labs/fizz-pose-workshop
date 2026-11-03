// Selects the continuous motion sampler for reusable side-view rigs and places the saved sprite samples along it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { sampleRunRig, type SideRig, type RigPose } from './run.ts';
import { reflectPose } from './reflect.ts';
import { samplePerformance } from './performance.ts';
import { sampleActionRig } from './actions.ts';
export function sampleRig(rig: SideRig, time: number): RigPose {
  if (rig.mirrored || rig.facing === 'left') return reflectPose(sampleRig({...rig,mirrored:false,facing:'right'},time),rig.width);
  if (rig.performance) return samplePerformance(rig, time);
  return rig.motion === 'pogo' || rig.motion === 'fire' ? sampleActionRig(rig, time) : sampleRunRig(rig, time);
}

/**
 * Phase of saved sprite `index`. A performance may list its own `sampleTimes`, so in-betweens fall wherever the motion needs
 * them rather than on its keys. Otherwise one-shot performances include both endpoints and loops space their samples evenly.
 */
export function sampleTime(rig: SideRig, index: number): number {
  const times = rig.performance?.sampleTimes;
  if (times) return times[index];
  return index / (rig.performance && !rig.performance.loop ? rig.sampleCount - 1 : rig.sampleCount);
}

/** The saved sprite shown at rig `time`: the last sample at or before it (the nearest one for evenly spaced one-shots). */
export function sampleIndex(rig: SideRig, time: number): number {
  if (!rig.performance?.sampleTimes) {
    return rig.performance && !rig.performance.loop ? Math.max(0, Math.min(rig.sampleCount - 1, Math.round(time * (rig.sampleCount - 1)))) : Math.max(0, Math.min(rig.sampleCount - 1, Math.floor(time * rig.sampleCount + 1e-8)));
  }
  return Math.max(0, rig.performance.sampleTimes.findLastIndex(sample => sample <= time + 1e-8));
}
