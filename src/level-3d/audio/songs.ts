// Episode 1's Enhanced music: how the Crater Fields cue becomes a song, by the engine's song builder.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Ported from episodes/episode-1/src/audio/songs.ts of liminal-hq/lieutenant-fizz at commit 94f354d. Only the crater
// definition is kept: the other cues belong to levels this page does not have.

import type { MusicSong, MusicTrack } from './audio-types.ts';
import { songFor, type SongDef } from './music-songs.ts';

/** How each cue becomes a song; the crater tune has an intro and a fill, a contrast section a fifth up and a lift of a tone. */
const DEFS: Record<string, SongDef> = {
	crater: { trim: 0.75, contrast: 5, lift: 2, arp: true },
};

/** The Enhanced song for every cue that has one (here, Crater Fields). */
export function buildSongs(music: Record<string, MusicTrack>): Record<string, MusicSong> {
	return Object.fromEntries(
		Object.entries(DEFS).flatMap(([id, def]) => {
			const track = music[id];
			return track ? [[id, songFor(track, def)] as const] : [];
		}),
	);
}
