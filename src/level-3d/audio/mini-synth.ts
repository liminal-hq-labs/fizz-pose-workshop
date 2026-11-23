// The built-in Web Audio synth: plays effects and loops music tracks from the game's voice data.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Ported from packages/engine/src/audio.ts of liminal-hq/lieutenant-fizz at commit 94f354d.

import type { MiniEvent } from './mini-notation.ts';
import { evalMini, noteHz, parseMini } from './mini-notation.ts';
import type { MusicTrack, SfxVoice } from './audio-types.ts';
import { isPanned, partMakeup, partPanAt, type PartRole } from './sound-field.ts';

const isNoise = (n: string): boolean => n === 'white' || n === 'pink' || n === 'brown';

interface VoiceSpec {
	n: string;
	hz?: number;
	w?: OscillatorType;
	a?: number;
	d?: number;
	s?: number;
	r?: number;
	g: number;
	lpf?: number;
	hpf?: number;
	slide?: number;
	nudge?: number;
	delay?: number;
	/** The part's role, set only when it is placed in the stereo field. */
	role?: PartRole;
	/** Where the voice sits in its cycle, 0 up to 1, for roles that alternate their pan. */
	cyclePos?: number;
}

/** Built-in Web Audio synth: plays the same patterns as Undertone, plus music loops. */
export class MiniSynth {
	private readonly noise: Partial<Record<string, AudioBuffer>> = {};
	private readonly delay: DelayNode;
	/** Echo lines for outputs other than the synth's own, made when a part asks for one. */
	private readonly echoes = new Map<AudioNode, DelayNode>();

	constructor(
		private readonly ctx: AudioContext,
		private readonly out: AudioNode,
	) {
		this.delay = ctx.createDelay(1);
		this.delay.delayTime.value = 0.33;
		const fb = ctx.createGain();
		fb.gain.value = 0.35;
		this.delay.connect(fb);
		fb.connect(this.delay);
		this.delay.connect(out);
	}

	/** The echo line that feeds `out`: the synth's own, or one made for that output. */
	private echoInto(out: AudioNode): DelayNode {
		if (out === this.out) return this.delay;
		let line = this.echoes.get(out);
		if (!line) {
			line = this.ctx.createDelay(1);
			line.delayTime.value = 0.33;
			const fb = this.ctx.createGain();
			fb.gain.value = 0.35;
			line.connect(fb);
			fb.connect(line);
			line.connect(out);
			this.echoes.set(out, line);
		}
		return line;
	}

	private noiseBuf(kind: string): AudioBuffer {
		const hit = this.noise[kind];
		if (hit) return hit;
		const ctx = this.ctx;
		const len = Math.floor(ctx.sampleRate * 1.5);
		const buf = ctx.createBuffer(1, len, ctx.sampleRate);
		const d = buf.getChannelData(0);
		let l = 0;
		let p0 = 0;
		let p1 = 0;
		let p2 = 0;
		for (let i = 0; i < len; i++) {
			const w = Math.random() * 2 - 1;
			if (kind === 'brown') {
				l = (l + 0.02 * w) / 1.02;
				d[i] = l * 3.5;
			} else if (kind === 'pink') {
				p0 = 0.997 * p0 + w * 0.029591;
				p1 = 0.985 * p1 + w * 0.032534;
				p2 = 0.95 * p2 + w * 0.048056;
				d[i] = (p0 + p1 + p2 + w * 0.05) * 1.5;
			} else d[i] = w;
		}
		this.noise[kind] = buf;
		return buf;
	}

	voice(v: VoiceSpec, when: number, dur: number, gated: boolean, out: AudioNode = this.out): void {
		const ctx = this.ctx;
		const t = when + (v.nudge ?? 0);
		let src: AudioBufferSourceNode | OscillatorNode;
		if (isNoise(v.n)) {
			const s = ctx.createBufferSource();
			s.buffer = this.noiseBuf(v.n);
			src = s;
		} else {
			const o = ctx.createOscillator();
			o.type = v.w ?? 'triangle';
			const f = v.hz ?? noteHz(v.n);
			if (v.slide) {
				o.frequency.setValueAtTime(f * 2, t);
				o.frequency.exponentialRampToValueAtTime(f, t + v.slide);
			} else o.frequency.setValueAtTime(f, t);
			src = o;
		}
		let node: AudioNode = src;
		if (v.lpf) {
			const f = ctx.createBiquadFilter();
			f.type = 'lowpass';
			f.frequency.value = v.lpf;
			node.connect(f);
			node = f;
		}
		if (v.hpf) {
			const f = ctx.createBiquadFilter();
			f.type = 'highpass';
			f.frequency.value = v.hpf;
			node.connect(f);
			node = f;
		}
		const g = ctx.createGain();
		const a = v.a || 0.001;
		const d = v.d || 0.1;
		const s = gated ? (v.s ?? 0) : 0;
		const r = v.r || 0.05;
		const peak = v.g * partMakeup(v.role);
		g.gain.setValueAtTime(0, t);
		g.gain.linearRampToValueAtTime(peak, t + a);
		g.gain.linearRampToValueAtTime(peak * s, t + a + d);
		const end = gated ? Math.max(t + a + d, t + dur) : t + a + d;
		g.gain.setValueAtTime(peak * s, end);
		g.gain.linearRampToValueAtTime(0, end + r);
		node.connect(g);
		// A panned part goes through a stereo panner, as Undertone's `.pan()` does; its echo follows it.
		let tail: AudioNode = g;
		if (v.role && isPanned(v.role)) {
			const panner = ctx.createStereoPanner();
			panner.pan.value = partPanAt(v.role, v.cyclePos ?? 0);
			g.connect(panner);
			tail = panner;
		}
		tail.connect(out);
		if (v.delay) {
			const sg = ctx.createGain();
			sg.gain.value = v.delay;
			tail.connect(sg);
			sg.connect(this.echoInto(out));
		}
		src.start(t);
		src.stop(end + r + 0.05);
	}

	/** Plays an effect's voices into `out` (the synth's own output when left out). */
	playSfx(list: readonly SfxVoice[], vol: number, out?: AudioNode): void {
		const t = this.ctx.currentTime + 0.01;
		for (const v of list) this.voice({ ...v, g: v.g * vol }, t, 0, false, out);
	}

	/**
	 * Loops a track, scheduling voices ~300 ms ahead. Returns a stopper. With `out` the track plays
	 * into that node instead of the synth's own output, and each part is placed by its role.
	 */
	loop(track: MusicTrack, vol: number, out?: AudioNode): { stop(): void } {
		const ctx = this.ctx;
		const cyc = 240 / track.bpm;
		const parsed = track.parts.map((p) => ({ p, tree: parseMini(p.notes) }));
		let c = 0;
		let next = ctx.currentTime + 0.1;
		let stopped = false;
		const tick = (): void => {
			if (stopped) return;
			while (next < ctx.currentTime + 0.3) {
				for (const { p, tree } of parsed) {
					const ev: MiniEvent[] = [];
					evalMini(tree, 0, 1, c, ev);
					for (const e of ev) {
						this.voice(
							{ ...p, n: e.v, g: p.g * vol, role: out ? p.role : undefined, cyclePos: e.t0 },
							next + e.t0 * cyc,
							(e.t1 - e.t0) * cyc,
							true,
							out,
						);
					}
				}
				c++;
				next += cyc;
			}
		};
		tick();
		const id = setInterval(tick, 50);
		return {
			stop: () => {
				stopped = true;
				clearInterval(id);
			},
		};
	}
}
