// Episode 1's Enhanced music: how the overworld, Crater Fields and Meteor Mesa cues become songs, by the engine's song builder.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Ported from episodes/episode-1/src/audio/songs.ts of liminal-hq/lieutenant-fizz at commit 94f354d. Only the
// map, crater and sky definitions are kept: the other cues belong to levels this page does not play yet.

import type { MusicSong, MusicTrack } from './audio-types.ts';
import { songFor, type SongDef } from './music-songs.ts';

/** How each cue becomes a song; the crater tune has an intro and a fill, a contrast section a fifth up and a lift of a tone. */
const DEFS: Record<string, SongDef> = {
	crater: { trim: 0.75, contrast: 5, lift: 2, arp: true },
	sky: { trim: 0.88, contrast: 7, lift: 2, arp: true },
	/* The overworld starts straight on the tune and has no fill, since an intro distracts from its melody. */
	map: { trim: 0.9, contrast: 7, lift: 0, arp: false, intro: 0, noFill: true, form: 'A B A′' },
};

/** The Enhanced song for every cue that has one (here, the overworld, Crater Fields and Meteor Mesa). */
export function buildSongs(music: Record<string, MusicTrack>): Record<string, MusicSong> {
	return Object.fromEntries(
		Object.entries(DEFS).flatMap(([id, def]) => {
			const track = music[id];
			return track ? [[id, songFor(track, def)] as const] : [];
		}),
	);
}
