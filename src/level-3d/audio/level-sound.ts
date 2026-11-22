// The sound of the 3D level page: the game's effects and Crater Fields music, placed and mixed as the game does.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { GameAudio } from './game-audio.ts';
import { mixFor, type ShellScreen } from './mix-states.ts';
import { PATTERNS } from './patterns.ts';
import { roomProfile } from './rooms.ts';
import { placeSound, type SoundAt } from './sound-field.ts';

/** The music track Crater Fields plays (`LEVELS[0].track` in the game). */
export const craterTrack = 'crater';

/** Where the page keeps the mute setting. */
export const muteKey = 'fizz-level-3d:muted';

/** The part of `Storage` the page uses, so a test can hand in a stand-in. */
export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export interface LevelSoundOptions {
	/** Where the mute setting is kept; null or an object that throws means it is not kept. */
	storage?: StorageLike | null;
	/** Where the sim's camera is, in tiles: sounds are panned and softened by their distance from it. */
	camera: () => { x: number; y: number };
	/** Half the sim's view in tiles, as given to `set_view`. */
	half?: { w: number; h: number };
	/** A phone's speaker: the room's sends are lowered. */
	coarse?: boolean;
}

/** One cue the page has played, kept for tooling and tests. */
export interface CueRecord {
	/** The caption word that raised it. */
	caption: string;
	/** The effect it plays, or null when the word has no sound. */
	sfx: string | null;
	at: SoundAt;
	/** Whether the context was running, so the sound could be heard. */
	audible: boolean;
}

/**
 * Plays the game's sound for the level: every caption the sim raises cues its effect (placed by where it happened
 * relative to the camera, as Enhanced does), the level's music loops, the mix muffles it behind a card, and a mute
 * switch silences both and is remembered.
 *
 * It runs in the game's default sound: Enhanced style, Enhanced effects and music (the longer Crater Fields song), the
 * master chain and the room, played through Undertone as the game does, with the built-in synth as the fallback.
 */
export class LevelSound {
	readonly audio: GameAudio;
	/** The most recent cues, oldest first. */
	readonly cues: CueRecord[] = [];
	private mutedNow = false;
	private wasUnlocked = false;
	private readonly listeners = new Set<() => void>();

	constructor(private readonly options: LevelSoundOptions) {
		this.audio = new GameAudio(PATTERNS, undefined, { musicFades: true });
		this.audio.setMode('enhanced');
		this.audio.setSfxStyle('enhanced');
		this.audio.setMusicStyle('enhanced');
		this.audio.setRoom(roomProfile('outdoor', !!options.coarse));
		this.mutedNow = this.readMuted();
		this.audio.setMusic(!this.mutedNow);
		this.audio.setSfx(!this.mutedNow);
	}

	private readMuted(): boolean {
		try {
			return this.options.storage?.getItem(muteKey) === '1';
		} catch {
			return false;
		}
	}

	/** Cues the effect for a caption word raised at `x`, `y` (tiles). Every word is cued, shown or not. */
	cue(text: string, x: number, y: number): void {
		const at = placeSound(x, y, this.options.camera(), this.options.half ?? { w: 12, h: 7 });
		this.audio.caption(text, at);
		this.cues.push({
			caption: text,
			sfx: PATTERNS.captionSfx[text] ?? null,
			at,
			audible: this.audio.ctxState === 'running' && !this.mutedNow,
		});
		if (this.cues.length > 64) this.cues.shift();
	}

	/** Starts the level's music from the top, in the open mix. A level restart calls it again. */
	startLevel(): void {
		this.setScreen('play');
		this.audio.playMusic(craterTrack, true);
	}

	/** Sets how the music is heard: open while playing, muffled behind a card. */
	setScreen(screen: ShellScreen): void {
		this.audio.setMix(mixFor(screen, !!this.options.coarse));
	}

	/** Freezes the sound (the pause screen, a hidden page) or lets it run again. */
	setSuspended(on: boolean): void {
		this.audio.setActive(!on);
	}

	get muted(): boolean {
		return this.mutedNow;
	}

	setMuted(on: boolean): void {
		if (on === this.mutedNow) return;
		this.mutedNow = on;
		this.audio.setMusic(!on);
		this.audio.setSfx(!on);
		try {
			this.options.storage?.setItem(muteKey, on ? '1' : '0');
		} catch {
			/* The setting just is not remembered. */
		}
		for (const listener of this.listeners) listener();
	}

	toggleMuted(): boolean {
		this.setMuted(!this.mutedNow);
		return this.mutedNow;
	}

	/** True once a key press or touch has started the audio context; a later pause does not undo it. */
	get unlocked(): boolean {
		if (this.audio.ctxState === 'running') this.wasUnlocked = true;
		return this.wasUnlocked;
	}

	/** Calls `listener` when the mute setting changes. */
	onMuteChange(listener: () => void): void {
		this.listeners.add(listener);
	}

	/** What tooling reads: the context, the setting, the track playing and the cues so far. */
	debug(): {
		ctx: string;
		muted: boolean;
		track: string | null;
		backend: string;
		mode: string;
		emitters: number;
		cues: CueRecord[];
	} {
		return {
			ctx: this.audio.ctxState,
			muted: this.mutedNow,
			track: this.audio.musicTrack,
			backend: this.audio.backend,
			mode: this.audio.mode,
			emitters: this.audio.emitters,
			cues: this.cues,
		};
	}

	dispose(): void {
		this.audio.dispose();
	}
}
