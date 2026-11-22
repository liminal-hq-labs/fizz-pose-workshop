// The data shapes of the game's sound: effect voices, music parts and tracks, and the table that holds them.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Ported from packages/engine/src/audio.ts of liminal-hq/lieutenant-fizz at commit 94f354d.

import type { PartRole } from './sound-field.ts';

/** One-shot SFX voice, as data (Undertone voice controls). */
export interface SfxVoice extends FilterEnvelope {
	/** Note name (`e4`) or noise type (`white`, `pink`, `brown`). */
	n: string;
	w?: OscillatorType;
	a?: number;
	d?: number;
	r?: number;
	g: number;
	lpf?: number;
	hpf?: number;
	slide?: number;
	nudge?: number;
	/** An exact pitch in Hz, used in place of `n` for an effect that moves its pitch in small steps. */
	hz?: number;
}

/**
 * A filter envelope on `lpf`: it opens to `lpenv` Hz at the attack (`lpa` seconds), falls to `lps` of
 * the way back over `lpd`, and closes over `lpr` after the note. Undertone only; the built-in synth
 * plays the voice without it.
 */
export interface FilterEnvelope {
	lpenv?: number;
	lpa?: number;
	lpd?: number;
	lps?: number;
	lpr?: number;
}

/** One part of a looping music track (mini-notation pattern plus voice settings). */
export interface MusicPart extends FilterEnvelope {
	notes: string;
	w?: OscillatorType;
	noise?: boolean;
	a?: number;
	d?: number;
	s?: number;
	r?: number;
	g: number;
	lpf?: number;
	hpf?: number;
	slide?: number;
	room?: number;
	delay?: number;
	/** What the part does in the mix; Enhanced uses it to place the part in the stereo field. */
	role?: PartRole;
	/** Seconds the part starts after the beat. */
	nudge?: number;
	/**
	 * Makes the part a partner layer that pans opposite its role in Enhanced (this is the pan it takes
	 * when the role is centred). Without a role, or in Classic, it has no effect.
	 */
	mirror?: number;
}

/**
 * A longer arrangement of a track, in sections. Each stream is one voice across the sections: the
 * part it plays in each, or null where it is silent. The song loops from its last section to its
 * first, at the track's `bpm`, so its length is the total of `cycles` (a cycle is one bar of four).
 */
export interface MusicSong {
	bpm: number;
	/** The length of each section in cycles. */
	cycles: number[];
	streams: (MusicPart | null)[][];
}

export interface MusicTrack {
	bpm: number;
	parts: MusicPart[];
}

/**
 * A longer arrangement of a track, in sections. Each stream is one voice across the sections: the
 * part it plays in each, or null where it is silent. The song loops from its last section to its
 * first, at the track's `bpm`, so its length is the total of `cycles` (a cycle is one bar of four).
 */
export interface MusicSong {
	bpm: number;
	/** The length of each section in cycles. */
	cycles: number[];
	streams: (MusicPart | null)[][];
}

export interface AudioPatterns {
	sfx: Record<string, SfxVoice[]>;
	music: Record<string, MusicTrack>;
	/** A longer arrangement for some or all of the tracks, played in place of `music` when the music style is Enhanced. */
	songs?: Record<string, MusicSong>;
	/** A second set of voices for some or all of the effects, played in place of `sfx` when the effects style is Enhanced. */
	sfxEnhanced?: Record<string, SfxVoice[]>;
	/** Caption text to SFX name, so on-screen sound captions and audio always agree. */
	captionSfx: Record<string, string>;
}
