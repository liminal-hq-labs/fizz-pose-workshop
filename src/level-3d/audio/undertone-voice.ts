// Builds one Undertone voice from the game's effect or music-part data.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Ported from packages/engine/src/audio.ts of liminal-hq/lieutenant-fizz at commit 94f354d.

import type { ControlPatch, Pattern, SoundType } from '@liminal-hq/undertone';
import type { MusicPart, SfxVoice } from './audio-types.ts';
import { mirrorPan, partMakeup, undertonePan } from './sound-field.ts';
import type { UndertoneModule } from './game-audio.ts';

const isNoise = (n: string): boolean => n === 'white' || n === 'pink' || n === 'brown';

export type Voice = Pattern<ControlPatch>;

/**
 * One Undertone voice. Music parts hold their envelope for the note length; effects are percussive.
 * With `placed` (Enhanced music) a part's role gives it a pan and, if panned, the make-up gain.
 */
export function buildVoice(
	U: UndertoneModule,
	v: SfxVoice | MusicPart,
	vol: number,
	gated: boolean,
	placed = false,
): Voice {
	const text = 'notes' in v ? v.notes : v.n;
	const exact = 'hz' in v ? v.hz : undefined;
	const role = placed && 'notes' in v ? v.role : undefined;
	const noisy = 'noise' in v ? !!v.noise : isNoise(text);
	let p: Voice = noisy
		? U.sound(text as SoundType)
		: U.note(exact ?? text).sound((v.w ?? 'triangle') as SoundType);
	p = p
		.attack(v.a ?? 0.001)
		.decay(v.d ?? 0.1)
		.sustain(gated ? ('s' in v ? (v.s ?? 0.3) : 0.3) : 0)
		.release(v.r ?? 0.05)
		.gain(v.g * vol * partMakeup(role));
	if (role) {
		const pan = undertonePan(role);
		if (pan !== undefined) p = p.pan(pan);
	}
	if (placed && 'mirror' in v && v.mirror !== undefined && 'notes' in v) {
		p = p.pan(mirrorPan(v.role, v.mirror));
	}
	if (v.lpf) p = p.lpf(v.lpf);
	if (v.lpenv) {
		p = p
			.lpenv(v.lpenv)
			.lpa(v.lpa ?? 0.001)
			.lpd(v.lpd ?? 0.1)
			.lps(v.lps ?? 0)
			.lpr(v.lpr ?? 0.05);
	}
	if (v.hpf) p = p.hpf(v.hpf);
	if (v.slide) p = p.slide(v.slide);
	if (v.nudge) p = p.nudge(v.nudge);
	if ('room' in v && v.room) p = p.room(v.room).roomsize(6).orbit(1);
	if ('delay' in v && v.delay) p = p.delay(v.delay).delaytime(0.33).delayfeedback(0.35).orbit(2);
	return p;
}
