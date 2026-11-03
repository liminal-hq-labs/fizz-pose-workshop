// Checks that every animation keeps cycling: the rig viewer, the gallery and the GIF/SVG exports all wrap without stopping.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handoverTarget, rigCatalogue } from '../src/rig/catalogue.ts';
import { handoverMs, playbackElapsed, rigPlayback, sampleRig, sampleTime } from '../src/rig/sample.ts';
import { exportDurations, frameDurations, oneShotRestMs, playbackCycleMs, playbackFrame, replaysContinuously } from '../src/rig/timing.ts';
import { savedAnimations } from './motion-metrics.ts';

/** Every frame index shown across one cycle, sampled each millisecond, with how long each stays on screen. */
function shown(durations: readonly number[], loop: boolean): { index: number; ms: number }[] {
  const runs: { index: number; ms: number }[] = [];
  for (let ms = 0; ms < playbackCycleMs(durations, loop); ms++) {
    const { index } = playbackFrame(durations, loop, ms);
    if (runs.at(-1)?.index === index) runs.at(-1)!.ms++; else runs.push({ index, ms: 1 });
  }
  return runs;
}

test('the rig viewer plays every action continuously in its frame holds and wraps instead of stopping', () => {
  for (const { animation, rig } of rigCatalogue) {
    const durations = frameDurations(rig), loop = replaysContinuously(rig), cycle = playbackCycleMs(durations, loop);
    // Each sprite appears once, in order, for its own hold; a one-shot's final pose also holds the rest. Nothing is skipped.
    expect(shown(durations, loop)).toEqual(exportDurations(durations, loop).map((ms, index) => ({ index, ms })));
    // Playback never stops: a whole cycle later it is back on the first sprite and the first pose, and it keeps going.
    for (const k of [1, 2, 7]) { expect(rigPlayback(rig, k * cycle)).toEqual(rigPlayback(rig, 0)); }
    expect(rigPlayback(rig, 0)).toEqual({ index: 0, time: 0 });
    // The continuous rig never runs backwards within a cycle, and reaches the end pose before wrapping.
    let previous = -1;
    for (let ms = 0; ms < cycle; ms += 5) { const { time } = rigPlayback(rig, ms); expect(time).toBeGreaterThanOrEqual(previous - 1e-9); previous = time; }
    expect(rigPlayback(rig, cycle - 1e-6).time).toBeCloseTo(1, 5);
    // Each sprite is shown at the start of its hold, so stepping and the scrubber land where playback would.
    for (let i = 0; i < rig.sampleCount; i++) {
      const at = playbackElapsed(rig, sampleTime(rig, i));
      expect(rigPlayback(rig, at)).toEqual({ index: i, time: sampleTime(rig, i) });
    }
    // A loop joins at the seam; a one-shot rests on its final pose and then replays.
    if (loop && !(rig.performance && !rig.performance.loop)) expect(sampleRig(rig, 1)).toEqual(sampleRig(rig, 0));
    if (!loop) { expect(cycle).toBe(rig.durationMs + oneShotRestMs); expect(rigPlayback(rig, rig.durationMs + oneShotRestMs / 2).index).toBe(rig.sampleCount - 1); }
    expect(animation in savedAnimations).toBe(true);
  }
});

/** The loop count in a GIF's NETSCAPE2.0 extension: 0 repeats forever, undefined means it plays once. */
function gifLoops(bytes: Uint8Array): number | undefined {
  const marker = new TextEncoder().encode('NETSCAPE2.0');
  for (let i = 0; i < bytes.length - marker.length - 4; i++) {
    if (marker.every((byte, j) => bytes[i + j] === byte)) return bytes[i + marker.length + 2] | (bytes[i + marker.length + 3] << 8);
  }
  return undefined;
}
/** Each frame delay in a GIF, in milliseconds. */
function gifDelays(bytes: Uint8Array): number[] {
  const delays: number[] = [];
  for (let i = 0; i < bytes.length - 5; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4) delays.push((bytes[i + 4] | (bytes[i + 5] << 8)) * 10);
  return delays;
}

test('every gallery animation cycles and its GIF and SVG exports loop forever with the same timing', () => {
  const root = new URL('../', import.meta.url);
  for (const [name, animation] of Object.entries(savedAnimations)) {
    const loop = animation.loop !== false, durations = exportDurations(animation.durationsMs, loop), cycle = playbackCycleMs(animation.durationsMs, loop);
    // The gallery shows every frame in order for its hold, holds a one-shot's final pose and then replays from the first.
    expect(shown(animation.durationsMs, loop).map(run => run.ms)).toEqual(durations);
    expect(playbackFrame(animation.durationsMs, loop, cycle).index).toBe(0);
    const gif = new Uint8Array(readFileSync(new URL(`animations/${name}.gif`, root)));
    expect(gifLoops(gif)).toBe(0);
    expect(gifDelays(gif)).toEqual(durations);
    const svg = readFileSync(new URL(`animations/${name}.svg`, root), 'utf8'), rules = [...svg.matchAll(/animation:a\d+ (\d+)ms steps\(1,end\) (\w+)/g)];
    expect(rules).toHaveLength(animation.frames.length);
    for (const [, ms, repeat] of rules) { expect(Number(ms)).toBe(cycle); expect(repeat).toBe('infinite'); }
  }
  // Every rig's own sprite GIF and skeleton SVG loop too.
  for (const { folder, rig } of rigCatalogue) {
    const gif = new Uint8Array(readFileSync(new URL(`rig/${folder}/sprites.gif`, root)));
    expect(gifLoops(gif)).toBe(0); expect(gifDelays(gif)).toEqual(exportDurations(frameDurations(rig), replaysContinuously(rig)));
    expect(readFileSync(new URL(`rig/${folder}/rig.svg`, root), 'utf8')).toContain('infinite');
  }
});

test('a one-shot with a follow-up loop hands over in the viewer once its final sprite has had its hold', () => {
  const handovers = rigCatalogue.filter(entry => entry.then);
  expect(handovers.map(entry => `${entry.animation}>${entry.then}`)).toEqual(['phone-idle>phone-typing']);
  for (const entry of handovers) {
    const next = rigCatalogue[handoverTarget(entry)], at = handoverMs(entry.rig);
    // The lead-in is a one-shot and its follow-up a loop that keeps cycling on the same timeline.
    expect(replaysContinuously(entry.rig)).toBe(false); expect(replaysContinuously(next.rig)).toBe(true);
    // The hand-over comes after every lead-in sprite has had its full hold, but before the rest a lone one-shot takes.
    expect(at).toBe(frameDurations(entry.rig).reduce((sum, hold) => sum + hold, 0));
    expect(rigPlayback(entry.rig, at - 1).index).toBe(entry.rig.sampleCount - 1);
    expect(at).toBeLessThan(playbackCycleMs(frameDurations(entry.rig), false));
    // The follow-up starts on its first sprite and its seam joins, so the viewer can loop it for as long as it plays.
    expect(rigPlayback(next.rig, 0)).toEqual({ index: 0, time: 0 });
    expect(rigPlayback(next.rig, playbackCycleMs(frameDurations(next.rig), true))).toEqual(rigPlayback(next.rig, 0));
  }
});
