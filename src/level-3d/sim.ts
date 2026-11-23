// Loads the vendored Episode 1 simulation and reads each frame's sprites out of its instance buffer.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { SpriteDraw } from './types.ts';

/** Input bits for `step`, as the sim defines them. */
export const Input = {
	left: 1,
	right: 2,
	up: 4,
	down: 8,
	jump: 16,
	pogo: 32,
	fire: 64,
	confirm: 128,
} as const;
/** Indices for `state`, as the sim defines them. */
export const State = {
	lives: 0,
	score: 1,
	nextLife: 2,
	ammo: 3,
	doneMask: 4,
	mapX: 5,
	mapY: 6,
	hasMapPos: 7,
	keyRed: 8,
	playerX: 13,
	playerY: 14,
	playerDead: 15,
	levelId: 17,
	pogoOn: 23,
} as const;
/** Sim modes. */
export const Mode = { none: 0, attract: 1, map: 2, level: 3 } as const;
/** Event kinds worth showing. */
export const SimEvent = {
	caption: 1,
	toast: 3,
	levelComplete: 4,
	died: 5,
	gameOver: 6,
	mapPrompt: 10,
	levelStart: 11,
} as const;
/** One thing the sim reported: a kind and up to five numbers whose meaning depends on it. */
export interface SimEventRecord {
	kind: number;
	a: number;
	b: number;
	c: number;
}
/** Half the view the sim frames in a level and on the map, in tiles: it clamps its camera this far inside the edges. */
export const levelView = { w: 12, h: 7 } as const;
export const mapView = { w: 8, h: 6 } as const;
/** The map's size in tiles, north up: the sim's X runs east and Y north. */
export const mapSize = { w: 60, h: 44 } as const;
/** The sim's fixed step, in seconds. */
export const stepSeconds = 1 / 60;

const stride = 20;
const spriteTable = 0,
	captionTable = 1,
	toastTable = 2;

interface Exports {
	memory: WebAssembly.Memory;
	stride(): number;
	table_len(table: number): number;
	name_ptr(table: number, i: number): number;
	name_len(table: number, i: number): number;
	caption_colour(i: number): number;
	sprite_table_ptr(): number;
	instance_ptr(): number;
	out_ptr(): number;
	events_ptr(): number;
	events_len(): number;
	events_clear(): void;
	game_new(): void;
	enter_level(id: number): void;
	enter_map(): void;
	set_view(halfW: number, halfH: number): void;
	step(held: number): void;
	render(alpha: number, flags: number): number;
	mode(): number;
	state_get(i: number): number;
	state_set(i: number, v: number): void;
}

/** The sprite sheet's layout: `[left, bottom, width, height]` in pixels for each sprite, in a square sheet of `size`. */
export interface SpriteSheet {
	size: number;
	sprites: Record<string, number[]>;
}

/**
 * The real Episode 1 rules, compiled to WebAssembly from `liminal-hq/lieutenant-fizz` (see `vendor/lieutenant-fizz`).
 * The sim owns everything that happens; this page only draws what it says to draw.
 */
export class LevelSim {
	readonly names: string[];
	/** The sound words the sim can raise, such as `boing` and `fzzt`, each with its colour; colour 0 is never shown. */
	readonly captions: { text: string; colour: number }[];
	/** The one-line messages the sim can raise, such as the red cookie door opening. */
	readonly toasts: string[];
	private constructor(
		private readonly x: Exports,
		sheet: SpriteSheet,
	) {
		if (x.stride() !== stride)
			throw new Error(`instance stride is ${x.stride()}, expected ${stride}`);
		this.names = this.table(spriteTable);
		this.captions = this.table(captionTable).map((text, index) => ({
			text,
			colour: x.caption_colour(index),
		}));
		this.toasts = this.table(toastTable);
		/* The sim tags each instance with its sprite's sheet position. Give every sprite its index there instead, so an
		   instance says which sprite it is; the sizes are the real ones, because the sim scales sprites by them. */
		/* A call into the sim can grow its memory and detach the old buffer, so take each pointer before the buffer. */
		const tablePointer = x.sprite_table_ptr(),
			table = new Float32Array(x.memory.buffer, tablePointer, this.names.length * 6);
		this.names.forEach((name, i) => {
			const rect = sheet.sprites[name];
			if (!rect) throw new Error(`the sprite sheet has no "${name}"`);
			table.set([i, 0, 1, 1, rect[2], rect[3]], i * 6);
		});
	}

	/** A name table the sim owns. A call into the sim can grow its memory, so each pointer is taken before the buffer. */
	private table(table: number): string[] {
		const text = new TextDecoder(),
			out: string[] = [];
		for (let i = 0, count = this.x.table_len(table); i < count; i++) {
			const pointer = this.x.name_ptr(table, i),
				length = this.x.name_len(table, i);
			out.push(text.decode(new Uint8Array(this.x.memory.buffer, pointer, length)));
		}
		return out;
	}

	static async load(wasm: BufferSource, sheet: SpriteSheet): Promise<LevelSim> {
		const { instance } = (await WebAssembly.instantiate(
			wasm,
			{},
		)) as unknown as WebAssembly.WebAssemblyInstantiatedSource;
		return new LevelSim(instance.exports as unknown as Exports, sheet);
	}

	/** Where the sim's own camera looked in the last frame, in tiles: sounds are placed against it. */
	readonly camera = { x: 0, y: 0 };

	/** Loads the level again without starting a new game: lives, snack points and Fizz ammo carry over, as after a death in the game. */
	reenter(level: number): void {
		this.x.enter_level(level);
		this.x.set_view(levelView.w, levelView.h);
	}

	/**
	 * Puts the sim on the overworld, as the game does after a level: Ben stands where the sim last put him on the map
	 * (the level's doorstep after one), the map prompt is raised again and a level just cleared throws its flag.
	 */
	enterMap(): void {
		this.x.enter_map();
		this.x.set_view(mapView.w, mapView.h);
	}

	/** Tells the sim a level has begun, so it frames the side view; the sim itself enters a level when Ben confirms at one. */
	frameLevel(): void {
		this.x.set_view(levelView.w, levelView.h);
	}

	/** Starts a new game with no scene: three lives, no snack points, nothing cleared, no map position. */
	newGame(): void {
		this.x.game_new();
	}

	/** Starts a new game on the overworld. */
	newGameOnMap(): void {
		this.newGame();
		this.enterMap();
	}

	/** Sets one state value, for restoring a save and for tooling. */
	setState(index: number, value: number): void {
		this.x.state_set(index, value);
	}

	/** Sets the lives, for a fall the sim itself does not notice. */
	setLives(lives: number): void {
		this.x.state_set(State.lives, lives);
	}

	/** Starts a new game in a level. Crater Fields is 0. */
	enter(level: number): void {
		this.x.game_new();
		this.x.enter_level(level);
		this.x.set_view(levelView.w, levelView.h);
	}

	step(held: number): void {
		this.x.step(held);
	}

	get mode(): number {
		return this.x.mode();
	}

	state(index: number): number {
		return this.x.state_get(index);
	}

	/** Places Ben, for tooling and for a saved map position. On the map the sim also snaps its camera to him. */
	teleport(x: number, y: number): void {
		this.x.state_set(State.playerX, x);
		this.x.state_set(State.playerY, y);
	}

	/**
	 * What the sim reported since the last call. A caption carries where it happened (`a`, `b` in tiles) and which word
	 * (`c`); a toast carries which message (`a`).
	 */
	events(): SimEventRecord[] {
		const count = this.x.events_len();
		if (!count) return [];
		const pointer = this.x.events_ptr(),
			raw = new Float32Array(this.x.memory.buffer, pointer, count * 6),
			list: SimEventRecord[] = [];
		for (let i = 0; i < count; i++)
			list.push({ kind: raw[i * 6], a: raw[i * 6 + 1], b: raw[i * 6 + 2], c: raw[i * 6 + 3] });
		this.x.events_clear();
		return list;
	}

	/**
	 * Every sprite of the whole level at `alpha` between the last two steps, and where the sim's own camera looks. The
	 * list is rebuilt into `into` to avoid garbage.
	 */
	frame(alpha: number, into: SpriteDraw[]): { cameraX: number; cameraY: number; count: number } {
		this.x.render(alpha, 0);
		const outPointer = this.x.out_ptr(),
			instancePointer = this.x.instance_ptr(),
			out = new Float32Array(this.x.memory.buffer, outPointer, 32),
			count = out[0],
			b = new Float32Array(this.x.memory.buffer, instancePointer, count * stride);
		for (let i = 0; i < count; i++) {
			const o = i * stride,
				draw = (into[i] ??= {} as SpriteDraw),
				ax = b[o],
				ay = b[o + 1],
				bx = b[o + 4],
				by = b[o + 5],
				packed = b[o + 19];
			draw.name = this.names[Math.round(b[o + 16])] ?? '';
			draw.x = b[o + 12];
			draw.y = b[o + 13];
			draw.w = Math.hypot(ax, ay);
			draw.h = Math.hypot(bx, by);
			draw.flip = ax * by - ay * bx < 0;
			draw.rot = Math.atan2(ay * (draw.flip ? -1 : 1), ax * (draw.flip ? -1 : 1));
			draw.tint = Math.round(b[o + 18]);
			draw.alpha = packed % 2;
			draw.emissive = Math.floor(packed / 2) % 2 === 1;
			draw.order = i;
		}
		into.length = count;
		this.camera.x = out[1];
		this.camera.y = out[2];
		return { cameraX: out[1], cameraY: out[2], count };
	}
}
