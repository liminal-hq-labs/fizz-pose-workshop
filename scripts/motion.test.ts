// Guards saved sprite cycles against frozen frames, jolts, flickering features and broken outlines, and pins the reference cycles.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import pinned from './fixtures/pinned-reference-motion.json';
import { rigCatalogue } from '../src/rig/catalogue.ts';
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
  // Firing holds by repeating identical frames: ready (6) equals settle (5) and aim (1), so the loop freezes for three beats.
  { check: 'duplicate', subject: 'fizz-blaster', at: '4>5', fixedBy: 'Phase 1: remove duplicate frames and use per-frame durations' },
  { check: 'duplicate', subject: 'fizz-blaster', at: '5>0', fixedBy: 'Phase 1: remove duplicate frames and use per-frame durations' },
  // With three of six steps frozen, the median collapses and discharge and recovery read as spikes.
  { check: 'spike', subject: 'fizz-blaster', at: '0>1', fixedBy: 'Phase 1: retime firing recoil' },
  { check: 'spike', subject: 'fizz-blaster', at: '2>3', fixedBy: 'Phase 1: retime firing recoil' },
  // Phone idle repeats "Read" as "Settle and scroll", then snaps back to standing across the loop seam.
  { check: 'duplicate', subject: 'phone-idle', at: '4>5', fixedBy: 'Phase 1: remove the duplicate phone frame' },
  { check: 'spike', subject: 'phone-idle', at: '0>1', fixedBy: 'Phase 1: add holds and in-betweens to the phone idle' },
  { check: 'spike', subject: 'phone-idle', at: '5>0', fixedBy: 'Phase 1: add holds and in-betweens to the phone idle' },
  // The ledge pull jumps the head 8 to 9 pixels in its last steps and teleports from standing back to hanging at the seam.
  ...['mantle', 'mantle-left'].flatMap(subject => ['3>4', '4>5', '5>0'].map(at => ({ check: 'head-travel' as const, subject, at, fixedBy: 'Phase 1/2: ledge anticipation, holds and interpolated in-betweens' }))),
  // The magenta belt vanishes for the push-to-crouch frame.
  { check: 'feature-pop', subject: 'mantle', at: '4:-M', fixedBy: 'Phase 2: redraw the ledge rig with continuous patches' },
  { check: 'feature-pop', subject: 'mantle-left', at: '4:-M', fixedBy: 'Phase 2: redraw the ledge rig with continuous patches' },
  // Jump drops the head 8 pixels from apex to fall in one step.
  { check: 'head-travel', subject: 'jump', at: '3>4', fixedBy: 'Phase 1/2: jump anticipation and interpolated fall' },
  // Nearest-neighbour patch rotation drops pixels of the helmet's ink rim.
  { check: 'helmet-rim', subject: 'jump', at: '2', fixedBy: 'Phase 2: restrict patch rotation to authored angle variants' },
  { check: 'helmet-rim', subject: 'death', at: '2', fixedBy: 'Phase 2: restrict patch rotation to authored angle variants' },
  { check: 'helmet-rim', subject: 'death', at: '3', fixedBy: 'Phase 2: restrict patch rotation to authored angle variants' },
  // Death's head roll swings left and right on every key and its lean reverses twice. The comic wobble is intended, so Phase 2
  // must author it as deliberate beats (and replace these entries with a dedicated wobble test) rather than flip at every key.
  { check: 'roll-flip', subject: 'death', at: 'headRoll 1>2', fixedBy: 'Phase 2: author the death wobble as deliberate beats' },
  { check: 'roll-flip', subject: 'death', at: 'headRoll 2>3', fixedBy: 'Phase 2: author the death wobble as deliberate beats' },
  { check: 'roll-flip', subject: 'death', at: 'headRoll 3>4', fixedBy: 'Phase 2: author the death wobble as deliberate beats' },
  { check: 'roll-flip', subject: 'death', at: 'lean 3>4', fixedBy: 'Phase 2: author the death wobble as deliberate beats' },
  { check: 'roll-flip', subject: 'death', at: 'lean 4>5', fixedBy: 'Phase 2: author the death wobble as deliberate beats' },
  // The turntable's pinned 45° and 315° standing sprites carry light-blue shading that none of their in-betweens have,
  // and the interpolated rear half loses helmet rim ink between keys.
  { check: 'feature-pop', subject: 'standing-360', at: '3:+b', fixedBy: 'Phase 5: turntable rebuild with gradual feature fades' },
  { check: 'feature-pop', subject: 'standing-360', at: '21:+b', fixedBy: 'Phase 5: turntable rebuild with gradual feature fades' },
  ...['4', '5', '6', '7', '8', '16', '17', '18', '19'].map(at => ({ check: 'helmet-rim' as const, subject: 'standing-360', at, fixedBy: 'Phase 5: turntable rebuild' })),
  // Intended effects rather than faults: the Stunner's muzzle flash lasts one frame, and the study splits its long side-view
  // hold across the loop seam. Keep these while the effect stays deliberate.
  { check: 'feature-pop', subject: 'fizz-blaster', at: '1:+C', fixedBy: 'intended: one-frame muzzle flash' },
  { check: 'feature-pop', subject: 'stunner-fire', at: '1:+C', fixedBy: 'intended: one-frame muzzle flash' },
  { check: 'duplicate', subject: 'stunner-fire', at: '3>0', fixedBy: 'intended: side-view hold split across the loop seam' },
];

const frames = loadSavedFrames();
const cycles = Object.entries(savedAnimations).map(([name, animation]) => ({ name, sequence: animation.frames.map(key => frames[key]) }));
const key = (failure: Pick<KnownFailure, 'check' | 'subject' | 'at'>): string => `${failure.check} ${failure.subject} @ ${failure.at}`;

function findings(check: Check): string[] {
  const found: string[] = [];
  const add = (subject: string, at: string): void => { found.push(key({ check, subject, at })); };
  if (check === 'roll-flip') {
    for (const { rig, animation } of rigCatalogue) for (const channel of ['headRoll', 'lean'] as const) {
      const keys = rig.performance?.keys ?? [];
      for (let i = 1; i < keys.length; i++) {
        const a = keys[i - 1][channel], b = keys[i][channel];
        if (Math.sign(a) * Math.sign(b) < 0 && Math.abs(a) >= rollFlip && Math.abs(b) >= rollFlip) add(animation, `${channel} ${i - 1}>${i}`);
      }
    }
    return found;
  }
  for (const { name, sequence } of cycles) {
    const steps = cycleSteps(sequence.length), changes = steps.map(({ from, to }) => changedPixels(sequence[from], sequence[to]));
    if (check === 'duplicate') steps.forEach(({ from, to }, i) => { if (changes[i] === 0) add(name, `${from}>${to}`); });
    if (check === 'spike') { const limit = spikeRatio * median(changes); steps.forEach(({ from, to }, i) => { if (changes[i] > limit) add(name, `${from}>${to}`); }); }
    if (check === 'head-travel') for (const { from, to } of steps) {
      const a = helmetCentre(sequence[from]), b = helmetCentre(sequence[to]);
      if (a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) > maxHeadTravel) add(name, `${from}>${to}`);
    }
    if (check === 'feature-pop' && sequence.length > 2) {
      const counts = sequence.map(colourCounts);
      sequence.forEach((_, i) => {
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
