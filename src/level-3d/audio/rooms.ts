// The rooms Enhanced sound is heard in: the neutral room, the overworld's and the open air Crater Fields and Meteor Mesa sit in.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Ported from episodes/episode-1/src/audio/rooms.ts of liminal-hq/lieutenant-fizz at commit 94f354d. The
// other levels' rooms and the screen-to-room lookup are left out: `levels.ts` names each level's room and the page picks the map's.

import type { RoomProfile } from './master.ts';

/** The kinds of place this page uses. */
export type RoomName = 'neutral' | 'map' | 'outdoor';

/**
 * The rooms, as data to tune by ear. Lengths in seconds, `coarseSeconds` being the shorter length
 * used on a phone; sends are linear; `lpf` and `hpf` shape the send in Hz; `predelay` is in
 * seconds; `damping` darkens the tail (0 to 1); `ring` adds a resonance at `hz`.
 *
 * `neutral` is the room before rooms existed (the title, the cinematics and the ending): it must
 * stay equal to `MASTER_DEFAULTS.reverb`, which a test checks.
 */
export const ROOMS: Record<RoomName, RoomProfile> = {
	neutral: {
		seconds: 0.8,
		coarseSeconds: 0.6,
		sfxSend: 0.1,
		musicSend: 0.06,
		hpf: 300,
		lpf: 5000,
		predelay: 0.012,
		damping: 0,
		seed: 0,
	},
	// The overworld: close and dry.
	map: {
		seconds: 0.5,
		coarseSeconds: 0.4,
		sfxSend: 0.08,
		musicSend: 0.06,
		hpf: 300,
		lpf: 4500,
		predelay: 0.006,
		damping: 0.5,
		seed: 1,
	},
	// Open air: almost no room at all.
	outdoor: {
		seconds: 0.4,
		coarseSeconds: 0.35,
		sfxSend: 0.04,
		musicSend: 0.03,
		hpf: 300,
		lpf: 4000,
		predelay: 0.005,
		damping: 0.6,
		seed: 2,
	},
};

/** What a phone's speaker does with a bigger reverb is mostly mud, so the sends are lowered. */
export const COARSE_SEND = 0.8;

/** The profile to hand to the audio engine: the named room, with the sends lowered on a phone. */
export function roomProfile(name: RoomName, coarse: boolean): RoomProfile {
	const r = ROOMS[name];
	if (!coarse) return { ...r };
	return { ...r, sfxSend: r.sfxSend * COARSE_SEND, musicSend: r.musicSend * COARSE_SEND };
}
