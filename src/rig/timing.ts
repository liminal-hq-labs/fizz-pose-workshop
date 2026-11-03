// Resolves how long each sampled sprite frame is held, so cycles can anticipate, hold and release instead of ticking evenly.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { SideRig } from './run.ts';

/** A rig that may carry per-frame hold times in milliseconds; omitted means every frame lasts durationMs / sampleCount. */
export type TimedRig = SideRig & { readonly frameDurationsMs?: readonly number[] };

export function frameDurations(rig: TimedRig): number[] {
  const holds = rig.frameDurationsMs;
  if (!holds) return Array.from({ length: rig.sampleCount }, () => rig.durationMs / rig.sampleCount);
  if (holds.length !== rig.sampleCount || holds.some(hold => !Number.isInteger(hold) || hold <= 0 || hold % 10 !== 0) || holds.reduce((sum, hold) => sum + hold, 0) !== rig.durationMs) {
    throw new Error('Frame durations must be one positive multiple of 10 ms per sample and add up to the rig duration.');
  }
  return [...holds];
}

/** How long a one-shot rests on its final pose before the gallery and every exported GIF/SVG replay it. */
export const oneShotRestMs = 1200;
/**
 * Playback durations for an exported animation. Every export loops so any viewer keeps it moving; a one-shot folds a rest
 * into its final frame, so it still reads as a finished action that holds before replaying.
 */
export function exportDurations(durations: readonly number[], loop: boolean): number[] {
  return durations.map((duration, index) => !loop && index === durations.length - 1 ? duration + oneShotRestMs : duration);
}
/** One playback cycle in milliseconds: every frame's hold, plus the rest on a one-shot's final pose. */
export function playbackCycleMs(durations: readonly number[], loop: boolean): number {
  return exportDurations(durations, loop).reduce((sum, duration) => sum + duration, 0);
}
/**
 * Where playback stands `elapsedMs` after it started, in the same timing the gallery and exports use. It always wraps: a loop
 * runs straight on, and a one-shot rests on its final pose and then replays from the first frame. `progress` runs from 0 to
 * 1 through the frame's own hold and stays at 1 during the rest.
 */
export function playbackFrame(durations: readonly number[], loop: boolean, elapsedMs: number): { index: number; progress: number } {
  const cycle = playbackCycleMs(durations, loop);
  let time = ((elapsedMs % cycle) + cycle) % cycle, index = 0;
  while (index < durations.length - 1 && time >= durations[index]) { time -= durations[index]; index++; }
  return { index, progress: Math.min(1, time / durations[index]) };
}
/** The elapsed playback time at which frame `index` starts. */
export function frameStartMs(durations: readonly number[], index: number): number {
  return durations.slice(0, index).reduce((sum, duration) => sum + duration, 0);
}

/** Whether a rig's saved sprite animation and exports loop straight back to the first frame, with no rest on the final pose. */
export function replaysContinuously(rig: SideRig): boolean { return !rig.performance || rig.performance.loop || rig.performance.replay === 'continuous'; }
