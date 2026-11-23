// Tests for the level's sound: cues placed by the camera, the level music, the mix behind a card and the mute switch.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { FakeAudioContext } from './fake-audio-context.ts';
import { LevelSound, muteKey, type StorageLike } from './level-sound.ts';

/** Runs the fake clock on and lets the promises it settles (a context resuming) finish. */
async function tick(ms: number): Promise<void> {
	vi.advanceTimersByTime(ms);
	for (let i = 0; i < 4; i++) await Promise.resolve();
}

const listeners = new Map<string, () => void>();
const realWindow = globalThis.window;

beforeEach(() => {
	FakeAudioContext.instances = [];
	listeners.clear();
	vi.useFakeTimers();
	Object.assign(globalThis, {
		window: {
			AudioContext: FakeAudioContext,
			addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
			removeEventListener: (type: string) => listeners.delete(type),
		},
	});
});

afterEach(() => {
	vi.useRealTimers();
	Object.assign(globalThis, { window: realWindow });
});

const memory = (
	initial: Record<string, string> = {},
): StorageLike & { data: Record<string, string> } => {
	const data = { ...initial };
	return {
		data,
		getItem: (k) => data[k] ?? null,
		setItem: (k, v) => void (data[k] = v),
	};
};
const make = (storage: StorageLike | null = memory()): LevelSound =>
	new LevelSound({ storage, camera: () => ({ x: 20, y: 7 }) });
const unlock = async (): Promise<FakeAudioContext> => {
	listeners.get('keydown')!();
	await tick(0);
	return FakeAudioContext.instances[0]!;
};

describe('LevelSound', () => {
	it('is the game default: Enhanced, with the effects style Enhanced', () => {
		const sound = make();
		expect(sound.audio.mode).toBe('enhanced');
		expect(sound.audio.sfxStyle).toBe('enhanced');
		sound.dispose();
	});

	it('starts the level music when the context unlocks, and from the top on each start', async () => {
		const sound = make();
		sound.startLevel();
		expect(sound.unlocked).toBe(false);
		await unlock();
		expect(sound.unlocked).toBe(true);
		expect(sound.debug().track).toBe('crater');
		const nodes = FakeAudioContext.instances[0]!.nodes.length;
		sound.startLevel();
		expect(FakeAudioContext.instances[0]!.nodes.length).toBeGreaterThan(nodes);
		sound.dispose();
	});

	it('cues every caption word, shown or not, panned by where it happened', async () => {
		const sound = make();
		const ctx = await unlock();
		sound.cue('jump', 20, 7);
		sound.cue('crunch', 32, 7);
		sound.cue('no such word', 0, 0);
		const [centre, right, none] = sound.debug().cues;
		expect(centre).toMatchObject({ caption: 'jump', sfx: 'jump', audible: true });
		expect(centre!.at.pan).toBe(0);
		expect(right!.at.pan).toBeCloseTo(0.6, 12);
		expect(none!.sfx).toBeNull();
		expect(ctx.all('panner').map((p) => p.pan.value)).toEqual([0, 0.6]);
		sound.dispose();
	});

	it('muffles the music behind a card and opens it again', async () => {
		const sound = make();
		await unlock();
		sound.startLevel();
		sound.setScreen('card');
		expect(sound.audio.mixState).toMatchObject({ lpf: 2200, gain: 0.8 });
		sound.setScreen('play');
		expect(sound.audio.mixState).toMatchObject({ lpf: 20000, gain: 1 });
		sound.dispose();
	});

	it('mutes music and effects, remembers it, and restarts the music when unmuted', async () => {
		const storage = memory();
		const sound = make(storage);
		await unlock();
		sound.startLevel();
		expect(sound.toggleMuted()).toBe(true);
		expect(storage.data[muteKey]).toBe('1');
		expect(sound.debug().track).toBeNull();
		const before = FakeAudioContext.instances[0]!.all('oscillator').length;
		sound.cue('jump', 20, 7);
		expect(FakeAudioContext.instances[0]!.all('oscillator')).toHaveLength(before);
		expect(sound.debug().cues[0]!.audible).toBe(false);
		sound.toggleMuted();
		expect(storage.data[muteKey]).toBe('0');
		expect(sound.debug().track).toBe('crater');
		sound.dispose();
	});

	it('reads a remembered mute, and survives storage that throws', () => {
		expect(make(memory({ [muteKey]: '1' })).muted).toBe(true);
		const broken: StorageLike = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
		};
		const sound = make(broken);
		expect(sound.muted).toBe(false);
		expect(() => sound.setMuted(true)).not.toThrow();
		expect(sound.muted).toBe(true);
		expect(make(null).muted).toBe(false);
	});

	it('tells listeners when the mute setting changes', () => {
		const sound = make();
		let calls = 0;
		sound.onMuteChange(() => calls++);
		sound.setMuted(true);
		sound.setMuted(true);
		sound.setMuted(false);
		expect(calls).toBe(2);
	});

	it('stays unlocked after a pause suspends the context', async () => {
		const sound = make();
		await unlock();
		expect(sound.unlocked).toBe(true);
		sound.setSuspended(true);
		expect(sound.audio.ctxState).toBe('suspended');
		expect(sound.unlocked).toBe(true);
		sound.dispose();
	});
});
