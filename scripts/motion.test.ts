// Guards saved sprite cycles against frozen frames, jolts, flickering features and broken outlines, and pins the reference cycles.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import pinned from './fixtures/pinned-reference-motion.json';
import { rigCatalogue } from '../src/rig/catalogue.ts';
import { sampleRig, sampleTime } from '../src/rig/sample.ts';
import { frameDurations, type TimedRig } from '../src/rig/timing.ts';
import { loadSavedFrames, savedAnimations, cycleSteps, changedPixels, median, helmetCentre, colourCounts, exposedEdges, helmetCodes } from './motion-metrics.ts';

// The run and look up/down cycles are the motion benchmark: smooth spacing, no frozen frames and no jolts. The thresholds
// below are set from them. Each value is checked against every saved cycle and every step wraps from the last frame to the first.
const spikeRatio = 2;            // a step may change at most twice the cycle's median number of pixels
const maxHeadTravel = 7;         // helmet centre may move at most this many pixels per step; the look loop peaks at 6.1
const featurePixels = 2;         // a colour of at least this many pixels may not appear or vanish for a single frame
const exposedEdgeSlack = 4;      // a frame may expose at most this many more unoutlined edge pixels than its cycle median
const rollFlip = 3;              // head roll and lean may not swing across zero between keys when both sides reach this many degrees

type Check = 'duplicate' | 'spike' | 'head-travel' | 'feature-pop' | 'helmet-rim' | 'exposed-edges' | 'roll-flip';
interface KnownFailure { readonly check: Check; readonly subject: string; readonly at: string; readonly fixedBy: string; }

// Existing faults recorded so the suite passes today. Each entry must still fail: when a fix lands, the test below
// reports the entry as stale and it has to be removed in the same change. Never add an entry to make new work pass.
const knownFailures: readonly KnownFailure[] = [
  // The turntable's pinned 45° and 315° standing sprites carry light-blue shading that none of their in-betweens have,
  // and the interpolated rear half loses helmet rim ink between keys.
  { check: 'feature-pop', subject: 'standing-360', at: '3:+b', fixedBy: 'Phase 5: turntable rebuild with gradual feature fades' },
  { check: 'feature-pop', subject: 'standing-360', at: '21:+b', fixedBy: 'Phase 5: turntable rebuild with gradual feature fades' },
  ...['4', '5', '6', '7', '8', '16', '17', '18', '19'].map(at => ({ check: 'helmet-rim' as const, subject: 'standing-360', at, fixedBy: 'Phase 5: turntable rebuild' })),
  // The jump keeps its approved six-frame timing, which drops the head 8 pixels from the fall pose to the landing in one step.
  ...['jump', 'jump-left'].map(subject => ({ check: 'head-travel' as const, subject, at: '3>4', fixedBy: 'kept by request: the original six-frame jump timing' })),
  // Intended effects rather than faults: the Stunner's muzzle flash lasts one frame, and the study splits its long side-view
  // hold across the loop seam. Keep these while the effect stays deliberate.
  { check: 'feature-pop', subject: 'fizz-blaster', at: '1:+C', fixedBy: 'intended: one-frame muzzle flash' },
  { check: 'feature-pop', subject: 'stunner-fire', at: '1:+C', fixedBy: 'intended: one-frame muzzle flash' },
  { check: 'duplicate', subject: 'stunner-fire', at: '3>0', fixedBy: 'intended: side-view hold split across the loop seam' },
];

const frames = loadSavedFrames();
// One-shots (saved with `loop: false`) hold their final pose and replay after a rest, so they have no wrapping step.
const cycles = Object.entries(savedAnimations).map(([name, animation]) => ({ name, loop: animation.loop !== false, sequence: animation.frames.map(key => frames[key]) }));
const key = (failure: Pick<KnownFailure, 'check' | 'subject' | 'at'>): string => `${failure.check} ${failure.subject} @ ${failure.at}`;

function findings(check: Check): string[] {
  const found: string[] = [];
  const add = (subject: string, at: string): void => { found.push(key({ check, subject, at })); };
  if (check === 'roll-flip') {
    for (const { rig, animation } of rigCatalogue) for (const channel of ['headRoll', 'lean'] as const) {
      const keys = rig.performance?.keys ?? [];
      for (let i = 1; i < keys.length; i++) {
        const a = keys[i - 1][channel], b = keys[i][channel];
        // A swing onto a key marked `beat` is a deliberate comic snap; the death wobble test below holds those to account.
        if (keys[i].beat) continue;
        if (Math.sign(a) * Math.sign(b) < 0 && Math.abs(a) >= rollFlip && Math.abs(b) >= rollFlip) add(animation, `${channel} ${i - 1}>${i}`);
      }
    }
    return found;
  }
  for (const { name, loop, sequence } of cycles) {
    const steps = cycleSteps(sequence.length, loop), changes = steps.map(({ from, to }) => changedPixels(sequence[from], sequence[to]));
    if (check === 'duplicate') steps.forEach(({ from, to }, i) => { if (changes[i] === 0) add(name, `${from}>${to}`); });
    if (check === 'spike') { const limit = spikeRatio * median(changes); steps.forEach(({ from, to }, i) => { if (changes[i] > limit) add(name, `${from}>${to}`); }); }
    if (check === 'head-travel') for (const { from, to } of steps) {
      const a = helmetCentre(sequence[from]), b = helmetCentre(sequence[to]);
      if (a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) > maxHeadTravel) add(name, `${from}>${to}`);
    }
    if (check === 'feature-pop' && sequence.length > 2) {
      const counts = sequence.map(colourCounts);
      sequence.forEach((_, i) => {
        if (!loop && (i === 0 || i === sequence.length - 1)) return;
        const before = counts[(i + sequence.length - 1) % sequence.length], now = counts[i], after = counts[(i + 1) % sequence.length];
        for (const code of new Set([...Object.keys(before), ...Object.keys(now), ...Object.keys(after)])) {
          const [p, c, n] = [before[code] ?? 0, now[code] ?? 0, after[code] ?? 0];
          if (c >= featurePixels && !p && !n) add(name, `${i}:+${code}`);
          if (!c && p >= featurePixels && n >= featurePixels) add(name, `${i}:-${code}`);
        }
      });
    }
    if (check === 'helmet-rim') {
      const rims = sequence.map(frame => exposedEdges(frame, helmetCodes)), best = Math.min(...rims);
      rims.forEach((rim, i) => { if (rim > best) add(name, String(i)); });
    }
    if (check === 'exposed-edges') {
      const edges = sequence.map(frame => exposedEdges(frame)), limit = median(edges) + exposedEdgeSlack;
      edges.forEach((edge, i) => { if (edge > limit) add(name, String(i)); });
    }
  }
  return found;
}

const descriptions: Record<Check, string> = {
  'duplicate': 'no cycle holds by repeating an identical consecutive frame',
  'spike': `no step changes more than ${spikeRatio}x its cycle's median pixel count`,
  'head-travel': `the helmet moves at most ${maxHeadTravel} pixels per step`,
  'feature-pop': 'no colour feature appears or vanishes for a single frame',
  'helmet-rim': 'every frame keeps as much helmet ink rim as the best frame in its cycle',
  'exposed-edges': `no frame exposes more than ${exposedEdgeSlack} extra unoutlined edge pixels beyond its cycle median`,
  'roll-flip': `performance keys never swing head roll or lean across zero by ${rollFlip} degrees or more`,
};
for (const check of Object.keys(descriptions) as Check[]) test(`motion: ${descriptions[check]}`, () => {
  const found = findings(check), allowed = knownFailures.filter(failure => failure.check === check).map(key);
  expect(found.filter(item => !allowed.includes(item))).toEqual([]);
  // A known failure that no longer reproduces has been fixed: delete its entry so the guard covers that cycle again.
  expect(allowed.filter(item => !found.includes(item))).toEqual([]);
});

// Death is comic, not realistic: the head wobbles from side to side on held beats while the body sags one way, then a single
// deliberate topple ends it. Each beat is its own saved sprite held long enough to read, and nothing flips sides between beats.
test('death wobbles on deliberate, readable beats and topples once', () => {
  const entry = rigCatalogue.find(item => item.animation === 'death')!, rig = entry.rig as TimedRig, keys = rig.performance!.keys;
  const times = Array.from({ length: rig.sampleCount }, (_, i) => sampleTime(rig, i)), holds = frameDurations(rig);
  const flips = (channel: 'headRoll' | 'lean'): number[] => keys.flatMap((key, i) => i && Math.sign(keys[i - 1][channel]) * Math.sign(key[channel]) < 0 ? [i] : []);
  const rollFlips = flips('headRoll'), leanFlips = flips('lean');
  // At least three wobbles, each landing on a beat that is sampled as its own sprite and held for at least 160 ms.
  expect(rollFlips.length).toBeGreaterThanOrEqual(3);
  for (const i of [...rollFlips, ...leanFlips]) {
    expect(keys[i].beat).toBe(true);
    const sample = times.indexOf(keys[i].phase);
    expect(sample).toBeGreaterThanOrEqual(0); expect(holds[sample]).toBeGreaterThanOrEqual(160);
  }
  // The wobble alternates sides on consecutive flips, so it reads as one rhythm rather than random twitching.
  for (let i = 1; i < rollFlips.length; i++) expect(Math.sign(keys[rollFlips[i]].headRoll)).toBe(-Math.sign(keys[rollFlips[i - 1]].headRoll));
  // The body sways one way and topples to the other side exactly once, at the final, held key, with the head flopping along.
  expect(leanFlips).toEqual([keys.length - 1]);
  const last = keys[keys.length - 1]; expect(last.hold).toBe(true); expect(Math.sign(last.headRoll)).toBe(Math.sign(last.lean));
  // A wobble stays within the seated head's range, and the sampled curve comes to rest on every beat.
  for (const key of keys) expect(Math.abs(key.headRoll)).toBeLessThanOrEqual(12);
  for (const i of rollFlips) {
    const at = keys[i].phase, roll = (t: number): number => sampleRig(rig, t).headAngle! * 180 / Math.PI;
    expect(roll(at)).toBeCloseTo(keys[i].headRoll, 6);
    // Zero velocity on the beat: a step of 0.005 either side moves the roll by a tiny second-order amount, not a first-order swing.
    for (const step of [-.005, .005]) expect(Math.abs(roll(Math.min(1, at + step)) - keys[i].headRoll)).toBeLessThan(.1);
  }
});

test('the reference cycles use their measured spacing as the benchmark', () => {
  for (const name of ['walk-run', 'look-up-down']) {
    const sequence = savedAnimations[name].frames.map(frame => frames[frame]);
    const changes = cycleSteps(sequence.length).map(({ from, to }) => changedPixels(sequence[from], sequence[to]));
    expect(Math.min(...changes)).toBeGreaterThan(0); expect(Math.max(...changes)).toBeLessThanOrEqual(spikeRatio * median(changes));
  }
});

// The run and look up/down cycles are the approved quality reference. Their saved grids and timing may only change
// through a deliberate, reviewed redraw (for example the Stunner redesign); update the fixture in that same change.
// The pinned run faces are the user's deliberate hand edits. The rig now reproduces them itself (see `face.test.ts`), and
// `draw:run` keeps any override that differs from the previous redraw unless it is run with `--replace-edits`.
test('run and look up/down cycles stay byte-for-byte identical to the pinned reference', () => {
  for (const [name, animation] of Object.entries(pinned.animations)) expect(savedAnimations[name]).toEqual(animation);
  for (const [name, frame] of Object.entries(pinned.frames)) expect(frames[name]).toEqual(frame);
});
