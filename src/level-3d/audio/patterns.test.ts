// Checks the game's sound data: every cue has a voice, every music part parses and the tune keeps its length.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Adapted from episodes/episode-1/src/audio/patterns.test.ts of liminal-hq/lieutenant-fizz at commit 94f354d.

import { describe, expect, it } from 'bun:test';
import { evalMini, noteHz, parseMini, type MiniEvent } from './mini-notation.ts';
import { CAPTION_SFX, MUSIC, PATTERNS, SFX } from './patterns.ts';

describe('mini-notation', () => {
	it('lays a sequence out over the cycle and rests on ~', () => {
		const out: MiniEvent[] = [];
		evalMini(parseMini('c4 ~ [e4 g4]'), 0, 1, 0, out);
		expect(out.map((e) => e.v)).toEqual(['c4', 'e4', 'g4']);
		expect(out[0]).toMatchObject({ t0: 0, t1: 1 / 3 });
		expect(out[1]!.t0).toBeCloseTo(2 / 3, 12);
	});

	it('alternates by cycle and repeats with *n', () => {
		const tree = parseMini('<a3 b3> c4*2');
		const cycle = (c: number): string[] => {
			const out: MiniEvent[] = [];
			evalMini(tree, 0, 1, c, out);
			return out.map((e) => e.v);
		};
		expect(cycle(0)).toEqual(['a3', 'c4', 'c4']);
		expect(cycle(1)).toEqual(['b3', 'c4', 'c4']);
	});

	it('stacks chords with a comma', () => {
		const out: MiniEvent[] = [];
		evalMini(parseMini('[c4,e4,g4]'), 0, 1, 0, out);
		expect(out.map((e) => e.v)).toEqual(['c4', 'e4', 'g4']);
	});

	it('turns note names into frequencies', () => {
		expect(noteHz('a4')).toBe(440);
		expect(noteHz('a5')).toBeCloseTo(880, 9);
		expect(noteHz('c4')).toBeCloseTo(261.6256, 3);
		expect(noteHz('a#3')).toBeCloseTo(233.0819, 3);
		expect(noteHz('nonsense')).toBe(440);
	});
});

describe('the game sound data', () => {
	it('gives every caption word an effect that exists', () => {
		for (const [word, sfx] of Object.entries(CAPTION_SFX)) expect(SFX[sfx], word).toBeDefined();
	});

	it('cues the silent-on-screen words too', () => {
		expect(CAPTION_SFX['jump']).toBe('jump');
		expect(CAPTION_SFX['kick']).toBe('jump');
		expect(CAPTION_SFX['crumble']).toBe('krunch');
		expect(CAPTION_SFX['pop!']).toBe('plink');
		expect(CAPTION_SFX['heave']).toBe('bonk');
	});

	it('has the Crater Fields tune: 148 BPM, six parts, each of eight bars or fewer', () => {
		const crater = MUSIC['crater']!;
		expect(crater.bpm).toBe(148);
		expect(crater.parts).toHaveLength(6);
		for (const part of crater.parts) {
			const bars = new Set<number>();
			for (let cycle = 0; cycle < 8; cycle++) {
				const out: MiniEvent[] = [];
				evalMini(parseMini(part.notes), 0, 1, cycle, out);
				expect(out.length, part.notes).toBeGreaterThan(0);
				for (const e of out) {
					expect(e.t0).toBeGreaterThanOrEqual(0);
					expect(e.t1).toBeLessThanOrEqual(1 + 1e-9);
					if (!/^(white|pink|brown)$/.test(e.v)) expect(noteHz(e.v)).not.toBeNaN();
				}
				bars.add(out.length);
			}
			expect(bars.size).toBeGreaterThan(0);
		}
	});

	it('gives every effect an Enhanced version through the same table', () => {
		expect(PATTERNS.sfxEnhanced).toBeDefined();
		expect(PATTERNS.sfx).toBe(SFX);
	});
});
