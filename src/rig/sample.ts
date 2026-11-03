// Selects the continuous motion sampler for reusable side-view rigs and places the saved sprite samples along it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { sampleRunRig, type SideRig, type RigPose } from './run.ts';
import { reflectPose } from './reflect.ts';
import { samplePerformance } from './performance.ts';
import { sampleActionRig } from './actions.ts';
import { frameDurations, frameStartMs, playbackFrame, replaysContinuously } from './timing.ts';
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

/**
 * The rig viewer's playback at `elapsedMs`: the sprite on screen and the continuous rig time, both following the saved frame
 * holds. Within a frame the rig moves from that sample's phase to the next (to the cycle end after the last sample), so the
 * skeleton and the sprite stay in step. Playback always wraps; a one-shot rests on its final pose before replaying.
 */
export function rigPlayback(rig: SideRig, elapsedMs: number): { index: number; time: number } {
  const durations = frameDurations(rig), { index, progress } = playbackFrame(durations, replaysContinuously(rig), elapsedMs);
  const from = sampleTime(rig, index), to = index < rig.sampleCount - 1 ? sampleTime(rig, index + 1) : 1;
  return { index, time: from + (to - from) * progress };
}
/**
 * When a one-shot with a follow-up loop (the phone sit-down into typing) hands over: once its final sprite has had its
 * hold, skipping the rest a lone one-shot takes before replaying.
 */
export function handoverMs(rig: SideRig): number { return frameDurations(rig).reduce((sum, hold) => sum + hold, 0); }
/** The elapsed playback time that shows rig `time`, the inverse of `rigPlayback` within the first cycle. */
export function playbackElapsed(rig: SideRig, time: number): number {
  const durations = frameDurations(rig), index = sampleIndex(rig, time), from = sampleTime(rig, index), to = index < rig.sampleCount - 1 ? sampleTime(rig, index + 1) : 1;
  return frameStartMs(durations, index) + (to > from ? (time - from) / (to - from) : 0) * durations[index];
}

/** The saved sprite shown at rig `time`: the last sample at or before it (the nearest one for evenly spaced one-shots). */
export function sampleIndex(rig: SideRig, time: number): number {
  if (!rig.performance?.sampleTimes) {
    return rig.performance && !rig.performance.loop ? Math.max(0, Math.min(rig.sampleCount - 1, Math.round(time * (rig.sampleCount - 1)))) : Math.max(0, Math.min(rig.sampleCount - 1, Math.floor(time * rig.sampleCount + 1e-8)));
  }
  return Math.max(0, rig.performance.sampleTimes.findLastIndex(sample => sample <= time + 1e-8));
}
