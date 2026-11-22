// The 3D level page: loads the sim, wires the controls and heads-up line, and runs the stage or the model gallery.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import sheetJson from '../../vendor/lieutenant-fizz/sprites.json';
import sheetUrl from '../../vendor/lieutenant-fizz/sprites.png?url';
import wasmUrl from '../../vendor/lieutenant-fizz/sim.wasm?url';
import { modelSets } from './registry.ts';
import { LevelSound } from './audio/level-sound.ts';
import { fallLimit, LevelFlow, type Card } from './flow.ts';
import { SimEvent, Input, LevelSim, type SpriteSheet, State } from './sim.ts';
import { Stage } from './stage.ts';
import type { Actor, SpriteDraw } from './types.ts';

const craterFields = 0;
const sheet = sheetJson as SpriteSheet;
const query = new URLSearchParams(location.search);
const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const toast = document.querySelector<HTMLElement>('#toast')!;
const cardEl = document.querySelector<HTMLElement>('#card')!;
const pauseEl = document.querySelector<HTMLElement>('#paused')!;
const hintEl = document.querySelector<HTMLElement>('#sound-hint')!;
const muteButton = document.querySelector<HTMLButtonElement>('#mute')!;
const pauseButton = document.querySelector<HTMLButtonElement>('#pause')!;
/** The level names the sim's LEVEL_START event (`a` is the level id) is shown as. */
const levelNames = ['Crater Fields'];

const keyInputs: Record<string, number> = {
	ArrowLeft: Input.left,
	KeyA: Input.left,
	ArrowRight: Input.right,
	KeyD: Input.right,
	ArrowUp: Input.up,
	KeyW: Input.up,
	ArrowDown: Input.down,
	KeyS: Input.down,
	Space: Input.jump,
	KeyZ: Input.jump,
	KeyX: Input.fire,
	ControlLeft: Input.fire,
	KeyC: Input.pogo,
	ShiftLeft: Input.pogo,
	Enter: Input.confirm,
};

let held = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
interface Controls {
	restart(): void;
	togglePause(): void;
	toggleMute(): void;
	/** A key or tap while a card waits for one; true when it was used. */
	press(): boolean;
}

function wireControls(controls: Controls): void {
	window.addEventListener('keydown', (event: KeyboardEvent) => {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (!event.repeat) {
			if (controls.press()) {
				event.preventDefault();
				return;
			}
			if (event.code === 'KeyR') controls.restart();
			else if (event.code === 'KeyP' || event.code === 'Escape') controls.togglePause();
			else if (event.code === 'KeyM') controls.toggleMute();
		}
		const bit = keyInputs[event.code];
		if (!bit) return;
		held |= bit;
		event.preventDefault();
	});
	window.addEventListener('keyup', (event: KeyboardEvent) => {
		held &= ~(keyInputs[event.code] ?? 0);
	});
	addEventListener('blur', () => {
		held = 0;
	});
	cardEl.addEventListener('pointerdown', () => void controls.press());
	muteButton.addEventListener('click', () => controls.toggleMute());
	pauseButton.addEventListener('click', () => controls.togglePause());
	for (const button of document.querySelectorAll<HTMLButtonElement>('#pad button')) {
		const bit = Input[button.dataset.input as keyof typeof Input];
		const set =
			(on: boolean) =>
			(event: Event): void => {
				event.preventDefault();
				held = on ? held | bit : held & ~bit;
				button.classList.toggle('held', on);
			};
		button.addEventListener('pointerdown', set(true));
		for (const up of ['pointerup', 'pointercancel', 'pointerleave'])
			button.addEventListener(up, set(false));
	}
}

/** When each caption word was last shown, by id: the game does not repeat a word within this many milliseconds. */
const captionSeen = new Map<number, number>();
const captionRepeatMs = 180;
/** How far a caption floats up, in pixels, one whole pixel at a time. */
const captionRise = 24;

/**
 * Floats one of the game's sound words where it happened, in its colour, as the game does: it is centred on the spot,
 * rises a whole pixel at a time and fades, a word is not shown again within 180 ms of itself, and one that happened
 * well off screen is dropped. A word with colour 0 only cues a sound, so it is not shown.
 */
function caption(
	stage: Stage,
	id: number,
	word: { text: string; colour: number } | undefined,
	x: number,
	y: number,
): void {
	if (!word || !word.colour) return;
	const now = performance.now(),
		seen = captionSeen.get(id);
	if (seen !== undefined && now - seen < captionRepeatMs) return;
	captionSeen.set(id, now);
	const at = new THREE.Vector3(x, y, 0).project(stage.camera),
		left = (at.x * 0.5 + 0.5) * innerWidth,
		top = (-at.y * 0.5 + 0.5) * innerHeight;
	if (left < -50 || top < -50 || left > innerWidth + 50 || top > innerHeight + 50) return;
	const element = document.createElement('div');
	element.className = 'cap';
	element.textContent = word.text;
	element.style.color = `#${word.colour.toString(16).padStart(6, '0')}`;
	document.body.append(element);
	element.style.left = `${Math.round(left - element.offsetWidth / 2)}px`;
	element.style.top = `${Math.round(top - element.offsetHeight / 2)}px`;
	element
		.animate(
			[
				{ transform: 'translateY(0px)', opacity: 1 },
				{ transform: `translateY(-${captionRise}px)`, opacity: 0 },
			],
			{ duration: 950, easing: `steps(${captionRise}, end)` },
		)
		.finished.then(() => element.remove())
		.catch(() => element.remove());
}

/** A message in the game's toast panel; it stays 2.8 seconds, as in the game. */
function say(text: string): void {
	if (!text) return;
	toast.textContent = text;
	toast.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => (toast.hidden = true), 2800);
}

/** The game's palette, for the confetti of a cleared level. */
const confettiColours = [
	'#ff5555',
	'#ffff55',
	'#55ff55',
	'#55ffff',
	'#5555ff',
	'#ff55ff',
	'#ffaa40',
];

function confetti(): void {
	for (let i = 0; i < 70; i++) {
		const piece = document.createElement('i');
		piece.className = 'confetti';
		piece.style.background = confettiColours[i % confettiColours.length];
		piece.style.left = `${Math.round(Math.random() * innerWidth)}px`;
		document.body.append(piece);
		const drift = Math.round((Math.random() - 0.5) * 160),
			fall = Math.round(innerHeight * (0.5 + Math.random() * 0.5));
		piece
			.animate(
				[
					{ transform: 'translate(0, -20px)', opacity: 1 },
					{ transform: `translate(${drift}px, ${fall}px)`, opacity: 0.9 },
				],
				{
					duration: 1800 + Math.random() * 1400,
					easing: 'steps(30, end)',
					delay: Math.random() * 500,
				},
			)
			.finished.then(() => piece.remove())
			.catch(() => piece.remove());
	}
}

function showCard(card: Card | null): void {
	cardEl.hidden = !card;
	if (!card) return;
	cardEl.innerHTML = `<h2></h2><p class="text"></p><p class="action"></p>`;
	cardEl.querySelector('h2')!.textContent = card.title;
	cardEl.querySelector('.text')!.textContent = card.text;
	const action = cardEl.querySelector<HTMLElement>('.action')!;
	action.textContent = card.action;
	action.hidden = !card.action;
}

/** Cuts the sprite named `name` out of the sheet as a CSS icon, drawn at a whole-number scale. */
function icon(name: string): string {
	const rect = sheet.sprites[name];
	if (!rect) return '';
	const [left, bottom, width, height] = rect;
	return `<span class="ico" style="--w:${width};--h:${height};--x:${left};--y:${sheet.size - bottom - height}"></span>`;
}

/** The game's HUD: pills of an icon and a number, then a badge for each key held and the pogo. */
function hudHtml(sim: LevelSim): string {
	const lives = Math.max(0, sim.state(State.lives)),
		score = Math.round(sim.state(State.score)),
		ammo = sim.state(State.ammo),
		pill = (name: string, colour: string, value: string, label: string): string =>
			`<span class="pill" role="img" aria-label="${label}" style="color:${colour}">${icon(name)}<b>${value}</b></span>`,
		badges: string[] = [];
	if (sim.state(State.keyRed))
		badges.push(`<span class="badge" style="color:#ff5555">${icon('keyRed')}Red gumdrop</span>`);
	if (sim.state(State.pogoOn)) badges.push(`<span class="badge" style="color:#55ffff">Pogo</span>`);
	return (
		`<div class="pills">${pill('ben_stand', '#55ff55', String(lives), `Lives ${lives}`)}` +
		pill('cookie', '#ffff55', score.toLocaleString('en-CA'), `Snack points ${score}`) +
		pill('soda', ammo > 0 ? '#55ffff' : '#ff5555', String(ammo), `Fizz ${ammo}`) +
		`</div><div class="badges"><span class="lbl">Next life at ${(Math.floor(score / 100) + 1) * 100}</span>${badges.join('')}</div>`
	);
}

/** Sizes the page's text in whole pixels from the window height, as the game does: each glyph pixel is `--n` pixels. */
function scaleText(): void {
	const n = Math.max(2, Math.round(innerHeight / 233));
	document.documentElement.style.setProperty('--n', String(n));
	document.documentElement.style.setProperty('--s', String(Math.max(1, Math.round((n * 2) / 3))));
}

/**
 * The model gallery: every sprite named in `?gallery=a,b,c` (or every sprite the level draws, with `?gallery`) stood in a
 * grid, each family cycling through its frames and turning round, for checking models without playing to them.
 */
function runGallery(stage: Stage, names: string[]): void {
	const labels = document.querySelector<HTMLElement>('#labels')!,
		families = new Map<
			string,
			{ actor: Actor; names: string[]; at: THREE.Vector3; size: number[]; label: HTMLElement }
		>(),
		columns = Number(query.get('columns')) || Math.max(1, Math.ceil(Math.sqrt(names.length * 1.6))),
		gap = Number(query.get('gap')) || 3;
	stage.paused = true;
	for (const name of names) {
		const rect = sheet.sprites[name];
		if (!rect) continue;
		let key = name,
			create: ((draw: SpriteDraw) => Actor) | null = null;
		for (const set of modelSets) {
			const family = set.family(name);
			if (family !== null) {
				key = `${set.name}/${family}`;
				create = (draw) => set.create(family, draw);
				break;
			}
		}
		const known = families.get(key);
		if (known) {
			known.names.push(name);
			continue;
		}
		if (!create) continue;
		const n = families.size,
			at = new THREE.Vector3((n % columns) * gap, -Math.floor(n / columns) * gap, 0),
			size = [rect[2] / 16, rect[3] / 16],
			actor = create(drawOf(name, at, size, false)),
			label = document.createElement('span');
		label.textContent = key;
		labels.append(label);
		stage.scene.add(actor.object);
		families.set(key, { actor, names: [name], at, size, label });
	}
	const rows = Math.ceil(families.size / columns),
		centre = new THREE.Vector3(((columns - 1) * gap) / 2, (-(rows - 1) * gap) / 2, 0),
		distance = Number(query.get('distance')) || Math.max(columns * gap * 1.1, rows * gap * 1.9, 8);
	let start = 0;
	const frame = (now: number): void => {
		start ||= now;
		const time = (now - start) / 1000,
			fixed = query.get('time');
		draw(fixed === null ? time : Number(fixed));
		requestAnimationFrame(frame);
	};
	const draw = (time: number): void => {
		stage.camera.position.set(centre.x - distance * 0.12, centre.y + distance * 0.16, distance);
		stage.camera.lookAt(centre);
		for (const entry of families.values()) {
			const name = entry.names[Math.floor(time / 0.35) % entry.names.length],
				one = drawOf(name, entry.at, entry.size, Math.floor(time / 4) % 2 === 1);
			entry.actor.update(one, {
				time,
				dt: 1 / 60,
				ben: { x: entry.at.x + 4, y: entry.at.y },
				camera: {
					x: stage.camera.position.x,
					y: stage.camera.position.y,
					z: stage.camera.position.z,
				},
				draws: [one],
			});
			const p = entry.at
				.clone()
				.add(new THREE.Vector3(0, -gap * 0.42, 0))
				.project(stage.camera);
			entry.label.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
			entry.label.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
		}
		stage.renderer.render(stage.scene, stage.camera);
	};
	Object.assign(window, { gallery: { draw, families: [...families.keys()] } });
	requestAnimationFrame(frame);
}

function drawOf(name: string, at: THREE.Vector3, size: number[], flip: boolean): SpriteDraw {
	const rect = sheet.sprites[name];
	return {
		name,
		x: at.x,
		y: at.y,
		w: rect ? rect[2] / 16 : size[0],
		h: rect ? rect[3] / 16 : size[1],
		flip,
		rot: 0,
		tint: 0xffffff,
		alpha: 1,
		emissive: false,
		order: 0,
	};
}

async function start(): Promise<void> {
	const [wasm, sheetImage] = await Promise.all([
		fetch(wasmUrl).then((response) => response.arrayBuffer()),
		new THREE.TextureLoader().loadAsync(sheetUrl),
	]);
	sheetImage.magFilter = sheetImage.minFilter = THREE.NearestFilter;
	sheetImage.generateMipmaps = false;
	sheetImage.colorSpace = THREE.SRGBColorSpace;
	const sim = await LevelSim.load(wasm, sheet);
	sim.enter(craterFields);
	const stage = new Stage({
		canvas,
		sim,
		sheet,
		sheetImage,
		sets: query.has('flat') ? [] : modelSets,
		held: () => held,
	});
	/* A page held with `?paused` (tooling) keeps the sim still whatever the flow does. */
	const hold = query.has('paused');
	const sound = new LevelSound({
		storage: (() => {
			try {
				return localStorage;
			} catch {
				return null;
			}
		})(),
		camera: () => sim.camera,
		coarse: !!window.matchMedia?.('(pointer: coarse)').matches,
	});
	const syncButtons = (): void => {
		muteButton.setAttribute('aria-pressed', String(sound.muted));
		muteButton.textContent = sound.muted ? 'Sound off' : 'Sound on';
	};
	sound.onMuteChange(syncButtons);
	syncButtons();
	scaleText();
	document.documentElement.style.setProperty('--sheet', `url(${sheetUrl})`);
	const timers = {
		later: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
		cancel: (timer: unknown): void => clearTimeout(timer as ReturnType<typeof setTimeout>),
	};
	const flow = new LevelFlow({
		card: showCard,
		freeze: (on) => {
			stage.paused = on || hold;
		},
		muffle: (on) => sound.setScreen(on ? 'card' : 'play'),
		pauseScreen: (on) => {
			pauseEl.hidden = !on;
			pauseButton.setAttribute('aria-pressed', String(on));
			sound.setSuspended(on);
			held = 0;
		},
		retry: () => {
			sim.reenter(craterFields);
			sound.startLevel();
		},
		newGame: () => {
			sim.enter(craterFields);
			sound.startLevel();
		},
		celebrate: confetti,
		...timers,
	});
	stage.resize();
	addEventListener('resize', () => {
		stage.resize();
		scaleText();
	});
	/* Tooling reaches the page through this: pause, place Ben, advance by whole steps, list sprites with no model, and read
	   the sound (the audio context, the music track and the cues played). */
	Object.assign(window, {
		level: {
			stage,
			sim,
			Input,
			State,
			restart: () => flow.restart(),
			flow,
			sound,
			soundState: () => sound.debug(),
		},
	});
	const gallery = query.get('gallery');
	if (gallery !== null) {
		stage.sync(0, 0);
		const all = [...new Set(stage.draws.map((draw) => draw.name))];
		runGallery(stage, gallery ? gallery.split(',') : all);
		Object.assign(window, { ready: true });
		return;
	}
	wireControls({
		restart: () => flow.restart(),
		togglePause: () => flow.togglePause(),
		toggleMute: () => void sound.toggleMuted(),
		press: () => flow.press(),
	});
	document.addEventListener('visibilitychange', () => {
		if (document.hidden && flow.phase === 'play' && !flow.paused) flow.togglePause();
	});
	if (hold) stage.paused = true;
	sound.startLevel();
	let hudKey = '';
	const frame = (now: number): void => {
		stage.tick(now);
		for (const event of sim.events()) {
			if (event.kind === SimEvent.caption) {
				const word = sim.captions[event.c];
				if (word) sound.cue(word.text, event.a, event.b);
				caption(stage, event.c, word, event.a, event.b);
			}
			if (event.kind === SimEvent.toast) say(sim.toasts[event.a] ?? '');
			if (event.kind === SimEvent.levelStart) say(levelNames[event.a] ?? '');
			if (event.kind === SimEvent.levelComplete)
				flow.complete(levelNames[event.a] ?? 'The level', sim.state(State.score));
			if (event.kind === SimEvent.died) flow.died(event.a, levelNames[event.b] ?? 'The level');
			if (event.kind === SimEvent.gameOver) flow.gameOver(event.a);
		}
		/* The sim lets Ben fall for ever from a hole in the world; far below the level counts as a fall. */
		if (flow.phase === 'play' && sim.state(State.playerY) < fallLimit) {
			const lives = sim.state(State.lives) - 1;
			sim.setLives(lives);
			if (lives < 0) flow.gameOver(sim.state(State.score));
			else flow.died(lives, levelNames[craterFields] ?? 'The level');
		}
		const html =
			hudHtml(sim) +
			(query.has('debug')
				? `<span>${Math.round(stage.stats.fps)} fps · ${stage.stats.calls} calls · ${Math.round(stage.stats.triangles / 1000)}k triangles · sync ${stage.stats.syncMs.toFixed(1)} ms · no model: ${[...stage.unmodelled].join(' ') || 'none'}</span>`
				: '');
		if (html !== hudKey) {
			hudKey = html;
			hud.innerHTML = html;
		}
		hintEl.hidden = sound.unlocked || sound.muted;
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
	Object.assign(window, { ready: true });
}

void start();
