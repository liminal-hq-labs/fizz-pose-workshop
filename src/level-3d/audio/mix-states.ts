// Episode 1's mix states: how the music is heard while playing, paused and behind a card.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Ported from episodes/episode-1/src/audio/mix.ts of liminal-hq/lieutenant-fizz at commit 94f354d. The dialogue
// and cinematic states and the shell's screen type are left out.

import { MIX_OPEN, type MixShape } from './mix.ts';

/** The names of the mix states this page uses. */
export type MixName = 'open' | 'pause' | 'pauseCoarse' | 'card';

/** The screens that have a mix of their own: playing, the pause screen and the cards shown over the level. */
export type ShellScreen = 'play' | 'pause' | 'card';

/**
 * The mix states, in Enhanced only.
 *
 * - `open`: the music as it is
 * - `pause`: muffled to a dull room-through-a-wall sound, and lower
 * - `pauseCoarse`: the same on a phone, whose small speaker has little left below 900 Hz
 * - `card`: lightly muffled behind the level-cleared and game-over cards
 */
export const MIX: Record<MixName, MixShape> = {
	open: { ...MIX_OPEN },
	pause: { lpf: 900, gain: 0.7 },
	pauseCoarse: { lpf: 1400, gain: 0.7 },
	card: { lpf: 2200, gain: 0.8 },
};

/** The mix for a screen. The result is a copy, so the caller cannot change `MIX`. */
export function mixFor(screen: ShellScreen, coarse = false): MixShape {
	return { ...MIX[mixNameFor(screen, coarse)] };
}

/** The name of the mix state a screen uses. */
export function mixNameFor(screen: ShellScreen, coarse = false): MixName {
	switch (screen) {
		case 'pause':
			return coarse ? 'pauseCoarse' : 'pause';
		case 'card':
			return 'card';
		case 'play':
			return 'open';
	}
}
