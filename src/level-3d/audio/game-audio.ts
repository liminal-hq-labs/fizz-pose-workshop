// The game's audio manager: effects and music through Undertone, with the built-in synth as the fallback, the Enhanced sound field, master chain and mix stage.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Ported from packages/engine/src/audio.ts of liminal-hq/lieutenant-fizz at commit 94f354d. The live-tuning method (`tune`) is left out.

import type { AudioContextLike } from '@liminal-hq/undertone';
import type { AudioPatterns, MusicSong, SfxVoice } from './audio-types.ts';
import { Master, type RoomProfile } from './master.ts';
import { MIX_OPEN, holdRamp, mixRamps, type MixShape, type Ramp } from './mix.ts';
import { MiniSynth } from './mini-synth.ts';
import {
	routedContext,
	createEmitter,
	createMusicBus,
	lpfHz,
	mixAt,
	scheduleRamp,
	setMixNow,
	type MusicBus,
} from './sound-graph.ts';
import type { AudioMode, SoundAt } from './sound-field.ts';
import { buildVoice, type Voice } from './undertone-voice.ts';

/** How long the master chain stays after the switch to Classic, so sounds already in it can finish. */
const MASTER_DETACH_MS = 2000;

/** Where an unplaced sound sits in Enhanced: the centre, at full level. */
const CENTRE: SoundAt = { pan: 0, gain: 1 };

/** The runtime surface of `@liminal-hq/undertone` the game uses (the module namespace, or a test double). */
export type UndertoneModule = Pick<
	typeof import('@liminal-hq/undertone'),
	'note' | 'sound' | 'stack'
> &
	Partial<Pick<typeof import('@liminal-hq/undertone'), 'arrange' | 'silence'>>;

/**
 * Game audio manager. Sound effects and music are built as `@liminal-hq/undertone` 0.2 stacks
 * (effects play once, music loops at the track's BPM). If Undertone fails to load, or throws while
 * building or starting a sound, that sound falls back to the built-in synth, which implements the
 * same patterns. The context unlocks on the first click or key press.
 */
export class GameAudio {
	music = true;
	sfx = true;
	musicVol = 1;
	sfxVol = 1;
	backend = 'Loading Undertone';
	/** Classic is today's sound, untouched. Enhanced places sound effects in the stereo field. */
	mode: AudioMode = 'classic';
	/** Which set of voices effects play: Classic is the game's own, Enhanced adds pitch curves, bell partials and a filter that opens at each attack. */
	sfxStyle: AudioMode = 'classic';
	/** Which arrangement of the music plays: Classic is the game's own loops, Enhanced the longer songs where there are any. */
	musicStyle: AudioMode = 'classic';
	/** How many sound effects have been placed through an emitter (always 0 in Classic). */
	emitters = 0;
	private ctx: AudioContext | null = null;
	private mini: MiniSynth | null = null;
	private ut: UndertoneModule | null = null;
	private handle: { stop(): void } | null = null;
	private track: string | null = null;
	private pending: string | null = null;
	/** True until the Undertone load settles; music waits for it so it never starts on the built-in synth first. */
	private utLoading = true;
	/** Only the app boot path waits for Undertone; the web build starts music on the built-in synth at the first gesture. */
	private readonly waitForUndertone: boolean;
	private disposed = false;
	/** Each music loop gets a gain of its own, so one track can fade out as the next fades in (see `playMusic`). */
	private readonly musicFades: boolean;
	/** The gain the loop playing goes through, when `musicFades` is on. */
	private loopFade: GainNode | null = null;
	/** Loops that are fading out, with the timers that stop them. */
	private readonly retiring = new Set<{
		handle: { stop(): void };
		fade: GainNode;
		timer: ReturnType<typeof setTimeout>;
	}>();
	/** The Enhanced music route, built the first time Enhanced music plays. */
	private musicBus: MusicBus | null = null;
	/** The Enhanced master chain, built on first use and taken down shortly after Classic returns. */
	private master: Master | null = null;
	private masterTimer: ReturnType<typeof setTimeout> | undefined;
	/** The mix the game last asked for. Classic and a music bus not yet built only keep it. */
	private mixTarget: MixShape = MIX_OPEN;
	/** The ramps of the last mix change, kept here so the next starts from where they have got to. */
	private mixPlan: { lpf: Ramp; gain: Ramp } = {
		lpf: holdRamp('exp', MIX_OPEN.lpf, 0),
		gain: holdRamp('lin', MIX_OPEN.gain, 0),
	};
	/** True from the page hiding to its return: the context is suspended or about to be. */
	private hidden = false;
	/** The room Enhanced sound is in; kept in Classic and before the chain exists, applied when built. */
	private room: RoomProfile | null = null;
	private readonly cache = new Map<string, Voice>();
	private readonly unlock = (): void => {
		if (this.disposed) return;
		this.ensure();
		if (this.ctx && this.ctx.state === 'suspended' && !this.hidden) void this.ctx.resume();
	};

	constructor(
		private readonly patterns: AudioPatterns,
		load: () => Promise<UndertoneModule> = () => import('@liminal-hq/undertone'),
		options: { unlockAtBoot?: boolean; musicFades?: boolean } = {},
	) {
		this.waitForUndertone = !!options.unlockAtBoot;
		this.musicFades = !!options.musicFades;
		// A page that went to the background before this was built missed the visibility event.
		this.hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
		window.addEventListener('pointerdown', this.unlock);
		// Chrome does not count a touch's pointerdown as a user gesture, but its pointerup is one.
		window.addEventListener('pointerup', this.unlock);
		window.addEventListener('keydown', this.unlock);
		// The app's WebView allows autoplay, so it needs no gesture: create and resume the context now. The
		// handlers above stay as the fallback, and the web build leaves this off (no context before a gesture).
		if (options.unlockAtBoot) this.unlock();
		load().then(
			(m) => {
				if (this.disposed) return;
				this.utLoading = false;
				if (
					typeof m?.note === 'function' &&
					typeof m.sound === 'function' &&
					typeof m.stack === 'function'
				) {
					this.ut = m;
					this.backend = 'Undertone 0.2';
				} else this.backend = 'Built-in synth';
				// On the web the built-in loop may already be playing (the first gesture came before the import
				// settled); hand it over to Undertone, as the build did before the boot path began to wait.
				if (this.ut && this.handle && this.track) this.playMusic(this.track, true);
				else this.flushPending();
			},
			(e: unknown) => {
				console.warn('Undertone unavailable, using the built-in synth', e);
				if (this.disposed) return;
				this.utLoading = false;
				this.backend = 'Built-in synth';
				this.flushPending();
			},
		);
	}

	/** Starts the music asked for while there was no context or Undertone was still loading. */
	private flushPending(): void {
		if (!this.ctx || !this.mini || (this.waitForUndertone && this.utLoading) || !this.pending)
			return;
		const t = this.pending;
		this.pending = null;
		this.playMusic(t, true);
	}

	private ensure(): AudioContext | null {
		if (this.disposed) return null;
		if (this.ctx) return this.ctx;
		const AC =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AC) return null;
		this.ctx = new AC();
		this.mini = new MiniSynth(this.ctx, this.ctx.destination);
		// A context created while hidden (some WebViews start it running) stays quiet until the page returns.
		if (this.hidden && this.ctx.state === 'running') void this.ctx.suspend();
		this.flushPending();
		return this.ctx;
	}

	private undertoneEffect(U: UndertoneModule, name: string, voices: readonly SfxVoice[]): Voice {
		const key = `${name}@${this.sfxVol}@${this.sfxStyle}`;
		const hit = this.cache.get(key);
		if (hit) return hit;
		const fx = U.stack(...voices.map((v) => buildVoice(U, v, this.sfxVol, false)));
		this.cache.set(key, fx);
		return fx;
	}

	/** The track whose loop is running now, or null when none is (music off, not unlocked yet or nothing asked for). */
	get musicTrack(): string | null {
		return this.handle ? this.track : null;
	}

	/** The state of the audio context, or `none` before the first input creates it. */
	get ctxState(): string {
		return this.ctx?.state ?? 'none';
	}

	/**
	 * Switches between Classic and Enhanced for the sounds that start from now on. Nothing is built
	 * here, and Classic never touches the Enhanced path, so switching back restores it exactly.
	 */
	setMode(mode: AudioMode): void {
		if (mode === this.mode) return;
		this.mode = mode;
		clearTimeout(this.masterTimer);
		if (mode === 'classic' && this.master) {
			// Sounds already in the chain finish first; a quick switch back keeps the chain.
			this.masterTimer = setTimeout(() => this.detachMaster(), MASTER_DETACH_MS);
		}
		// A music bus kept from before takes the mix and volume asked for in the meantime.
		if (mode === 'enhanced') this.syncBus();
		if (mode === 'enhanced' && this.room) this.master?.setRoom(this.room);
		// The running loop is on the old route, so start it again on the new one.
		if (this.handle && this.music && this.track) this.playMusic(this.track, true);
	}

	/**
	 * The master chain, built the first time Enhanced needs it, or null (send sound straight to the
	 * destination, as before the chain existed) if the context cannot build one.
	 */
	private masterFor(ctx: AudioContext): Master | null {
		if (this.master) return this.master;
		try {
			const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
			this.master = new Master(ctx, ctx.destination, coarse, this.room);
			return this.master;
		} catch (err) {
			console.warn('Master chain unavailable, playing Enhanced sound unmastered', err);
			return null;
		}
	}

	/** Takes the master chain and the music bus that feeds it out of the graph. */
	private detachMaster(): void {
		this.masterTimer = undefined;
		if (this.mode !== 'classic') return;
		this.master?.dispose();
		this.master = null;
		this.musicBus = null;
	}

	/** Sets the bus's volume and mix to the values asked for, with no ramp. */
	private syncBus(): void {
		const bus = this.musicBus;
		if (!bus || !this.ctx) return;
		const now = this.ctx.currentTime;
		bus.level.gain.cancelScheduledValues(now);
		bus.level.gain.setValueAtTime(this.musicVol, now);
		setMixNow(bus, this.mixTarget, now);
		this.mixPlan = {
			lpf: holdRamp('exp', this.mixTarget.lpf, now),
			gain: holdRamp('lin', this.mixTarget.gain, now),
		};
	}

	/**
	 * Sets how the music is heard: a low-pass and a gain (see `mix.ts`). In Enhanced the music bus
	 * glides there, closing over 0.18 s and opening over 0.35 s. In Classic, or before the bus
	 * exists, the value is only kept, and is applied without a ramp when the bus is built or Enhanced
	 * returns. While the page is hidden the context is frozen, so the change is made at once and is
	 * already in place when the page comes back.
	 */
	setMix(shape: MixShape): void {
		if (shape.lpf === this.mixTarget.lpf && shape.gain === this.mixTarget.gain) return;
		this.mixTarget = { lpf: shape.lpf, gain: shape.gain };
		const bus = this.mode === 'enhanced' ? this.musicBus : null;
		const ctx = this.ctx;
		if (!bus || !ctx) return;
		const now = ctx.currentTime;
		if (this.hidden || ctx.state !== 'running') {
			this.syncBus();
			return;
		}
		const ramps = mixRamps(mixAt(this.mixPlan, now), this.mixTarget, now);
		scheduleRamp(bus.lpf.frequency, ramps.lpf, (hz) => lpfHz(bus.nyquist, hz));
		scheduleRamp(bus.mix.gain, ramps.gain);
		this.mixPlan = ramps;
	}

	/** The mix last asked for, and whether the music bus is carrying it (Enhanced with music started). */
	get mixState(): { lpf: number; gain: number; applied: boolean } {
		return { ...this.mixTarget, applied: this.mode === 'enhanced' && this.musicBus !== null };
	}

	/** True while the master chain exists (Enhanced has been used and Classic has not yet detached it). */
	get masterBuilt(): boolean {
		return this.master !== null;
	}

	/**
	 * Puts Enhanced sound in a room: the reverb's length, sends, filters and character, crossfaded
	 * from the room before. In Classic, or before the master chain exists, it only remembers the room
	 * and the chain starts in it. Classic itself has no room.
	 */
	setRoom(profile: RoomProfile): void {
		this.room = profile;
		if (this.mode === 'enhanced') this.master?.setRoom(profile);
	}

	/** The music bus for Enhanced, or null (play the music as Classic) if the context cannot build one. */
	private enhancedMusic(ctx: AudioContext): MusicBus | null {
		if (this.musicBus) return this.musicBus;
		try {
			this.musicBus = createMusicBus(ctx, this.masterFor(ctx)?.musicBus ?? ctx.destination);
			this.syncBus();
			return this.musicBus;
		} catch (err) {
			console.warn('Music field unavailable, playing the music as Classic', err);
			return null;
		}
	}

	/** An emitter for one Enhanced sound, or null (play it as Classic) if the context cannot build one. */
	private emitter(ctx: AudioContext, at: SoundAt): GainNode | null {
		try {
			const e = createEmitter(ctx, at, this.masterFor(ctx)?.sfxBus ?? ctx.destination);
			this.emitters++;
			return e;
		} catch (err) {
			console.warn('Sound field unavailable, playing this sound as Classic', err);
			return null;
		}
	}

	/**
	 * Plays a sound effect. Classic ignores `at` and plays the effect on the real context, centred.
	 * Enhanced routes the effect's voices into an emitter for this one call (a gain into a stereo
	 * panner into the destination), which places it at `at` (the centre if omitted).
	 */
	play(name: string, at?: SoundAt): void {
		const voices = this.voicesFor(name);
		if (!this.sfx || !voices) return;
		const ctx = this.ensure();
		if (!ctx || ctx.state !== 'running') return;
		try {
			// Undertone schedules a play() synchronously, so the voices of this call all connect to
			// this call's emitter before the next call can build its own.
			const emitter = this.mode === 'enhanced' ? this.emitter(ctx, at ?? CENTRE) : null;
			if (this.ut) {
				try {
					const fx = this.undertoneEffect(this.ut, name, voices);
					if (emitter) fx.play({ ctx: routedContext(ctx, emitter) });
					else fx.play({ ctx });
					return;
				} catch (e) {
					console.warn('Undertone sfx failed, using the built-in synth', name, e);
				}
			}
			this.mini?.playSfx(voices, this.sfxVol, emitter ?? undefined);
		} catch (e) {
			console.warn('sfx failed', name, e);
		}
	}

	/** The voices of an effect in the style in effect: Enhanced falls back to Classic for an effect with no Enhanced version. */
	private voicesFor(name: string): SfxVoice[] | undefined {
		const enhanced = this.sfxStyle === 'enhanced' ? this.patterns.sfxEnhanced?.[name] : undefined;
		return enhanced ?? this.patterns.sfx[name];
	}

	/** Chooses which version of the effects plays from now on. Effects already playing finish as they were. */
	setSfxStyle(style: AudioMode): void {
		this.sfxStyle = style;
	}

	/** Plays the sound effect tied to an on-screen caption, if it has one, placed at `at`. */
	caption(text: string, at?: SoundAt): void {
		const k = this.patterns.captionSfx[text];
		if (k) this.play(k, at);
	}

	/**
	 * Plays a track. With `fadeSeconds` (and `musicFades` on) the track already playing fades out over that long as
	 * the new one fades in, so the two overlap; without it the old one stops at once.
	 */
	playMusic(track: string | null, force = false, fadeSeconds = 0): void {
		if (this.disposed) return;
		if (track === this.track && !force) return;
		this.track = track;
		const old = this.handle;
		const oldFade = this.loopFade;
		this.handle = null;
		this.loopFade = null;
		this.pending = null;
		const crossfade = fadeSeconds > 0 && this.musicFades && !!old && !!oldFade && !!this.ctx;
		if (crossfade && old && oldFade && this.ctx) {
			const now = this.ctx.currentTime;
			oldFade.gain.cancelScheduledValues(now);
			oldFade.gain.setValueAtTime(oldFade.gain.value, now);
			oldFade.gain.linearRampToValueAtTime(0, now + fadeSeconds);
			const retired = {
				handle: old,
				fade: oldFade,
				timer: setTimeout(
					() => {
						old.stop();
						// The loop is done with its gain, so take it out of the graph.
						oldFade.disconnect();
						this.retiring.delete(retired);
					},
					fadeSeconds * 1000 + 150,
				),
			};
			this.retiring.add(retired);
		} else {
			old?.stop();
		}
		const t = track ? this.patterns.music[track] : undefined;
		const song = track && this.musicStyle === 'enhanced' ? this.patterns.songs?.[track] : undefined;
		if (!this.music || !t) return;
		if (!this.ctx || !this.mini || (this.waitForUndertone && this.utLoading)) {
			this.pending = track;
			return;
		}
		const field = this.mode === 'enhanced' ? this.enhancedMusic(this.ctx) : null;
		// This loop's own gain, into the music bus (Enhanced) or the speakers (Classic); the loop is played into it.
		const fade = this.musicFades ? this.ctx.createGain() : null;
		if (fade) {
			fade.gain.value = crossfade ? 0 : 1;
			fade.connect(field ? field.bus : this.ctx.destination);
			if (crossfade) fade.gain.linearRampToValueAtTime(1, this.ctx.currentTime + fadeSeconds);
			this.loopFade = fade;
		}
		const into = fade ? routedContext(this.ctx, fade) : null;
		if (this.ut && song && this.ut.arrange && this.ut.silence) {
			try {
				this.handle = this.loopSong(this.ut, song, field, into);
				return;
			} catch (e) {
				console.warn('Undertone song failed, playing the track', track, e);
			}
		}
		if (this.ut) {
			try {
				const U = this.ut;
				const voices = t.parts.map((p) =>
					buildVoice(U, p, field ? 1 : this.musicVol, true, !!field),
				);
				this.handle = U.stack(...voices).loop({
					ctx: into ?? field?.routed ?? this.ctx,
					bpm: t.bpm,
				});
				return;
			} catch (e) {
				console.warn('Undertone music failed, using the built-in synth', track, e);
			}
		}
		// Classic with a fade plays on a synth of its own that ends in the fade (its parts keep no stereo roles).
		this.handle = fade
			? field
				? this.mini.loop(t, 1, fade)
				: new MiniSynth(this.ctx, fade).loop(t, this.musicVol)
			: this.mini.loop(t, field ? 1 : this.musicVol, field?.bus);
	}

	/** Loops a song: one stream per voice, each arranged across the sections it plays in. */
	private loopSong(
		U: UndertoneModule,
		song: MusicSong,
		field: MusicBus | null,
		into: AudioContextLike | null = null,
	): { stop(): void } {
		const arrange = U.arrange!;
		const silence = U.silence! as Voice;
		const vol = field ? 1 : this.musicVol;
		const streams = song.streams.map((stream) =>
			arrange(
				...song.cycles.map((cycles, section): [number, Voice] => {
					const part = stream[section];
					return [cycles, part ? buildVoice(U, part, vol, true, !!field) : silence];
				}),
			),
		);
		return U.stack(...streams).loop({
			ctx: into ?? field?.routed ?? this.ctx!,
			bpm: song.bpm,
		});
	}

	/** Stops the loops still fading out, and takes their gains out of the graph. */
	private stopRetiring(): void {
		for (const r of this.retiring) {
			clearTimeout(r.timer);
			r.handle.stop();
			r.fade.disconnect();
		}
		this.retiring.clear();
	}

	/**
	 * Chooses which arrangement of the music plays. The running track starts again from the top on the
	 * new one; a track with no song plays as Classic in either style.
	 */
	setMusicStyle(style: AudioMode): void {
		if (style === this.musicStyle) return;
		this.musicStyle = style;
		if (this.handle && this.music && this.track) this.playMusic(this.track, true);
	}

	setMusic(on: boolean): void {
		// Setting the state it is already in must not restart the running loop.
		if (on === this.music) return;
		this.music = on;
		this.handle?.stop();
		this.handle = null;
		this.loopFade = null;
		this.stopRetiring();
		if (on && this.track) this.playMusic(this.track, true);
	}

	setSfx(on: boolean): void {
		this.sfx = on;
	}

	/**
	 * Sets music loudness from 0 to 1. In Enhanced the music bus's level glides to it and the loop
	 * keeps playing (the patterns are built at full level). In Classic the volume is baked into the
	 * patterns, so the running loop restarts so the new level takes effect.
	 */
	setMusicVolume(v: number): void {
		const vol = Math.min(1, Math.max(0, v));
		if (vol === this.musicVol) return;
		this.musicVol = vol;
		const bus = this.mode === 'enhanced' ? this.musicBus : null;
		if (bus && this.ctx) {
			const now = this.ctx.currentTime;
			bus.level.gain.cancelScheduledValues(now);
			bus.level.gain.setTargetAtTime(vol, now, 0.02);
			return;
		}
		if (this.music && this.track) this.playMusic(this.track, true);
	}

	/** Sets sound effect loudness from 0 to 1. Effects built at the old level are dropped. */
	setSfxVolume(v: number): void {
		const vol = Math.min(1, Math.max(0, v));
		if (vol === this.sfxVol) return;
		this.sfxVol = vol;
		this.cache.clear();
	}

	/** Suspends or resumes the whole context (tab hidden, pause menu). */
	setActive(on: boolean): void {
		this.hidden = !on;
		if (!this.ctx || this.disposed) return;
		void (on ? this.ctx.resume() : this.ctx.suspend());
	}

	dispose(): void {
		this.disposed = true;
		clearTimeout(this.masterTimer);
		this.master?.dispose();
		this.master = null;
		this.handle?.stop();
		this.handle = null;
		this.stopRetiring();
		window.removeEventListener('pointerdown', this.unlock);
		window.removeEventListener('pointerup', this.unlock);
		window.removeEventListener('keydown', this.unlock);
		void this.ctx?.close();
	}
}
