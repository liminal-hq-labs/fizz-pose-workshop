// The 3D pages: loads the sim, wires the controls, heads-up line and prompts, and runs the game, one level or the model gallery.
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
import { levelName, LEVELS, promptFor, saucerId, type MapPrompt } from './levels.ts';
import {
	applyProgress,
	captureProgress,
	clearedCount,
	describeProgress,
	firstAreaLevels,
	readProgress,
	writeProgress,
} from './progress.ts';
import { SimEvent, Input, LevelSim, Mode, type SpriteSheet, State } from './sim.ts';
import { Stage } from './stage.ts';
import type { Actor, SpriteDraw } from './types.ts';

const craterFields = 0;
const sheet = sheetJson as SpriteSheet;
const query = new URLSearchParams(location.search);
/**
 * `game` is the game page: it starts on the overworld, goes back to it after a level or a death and keeps a save. `level`
 * is the page that goes straight into a level and starts it again in place.
 */
const kind: 'game' | 'level' = document.body.dataset.start === 'map' ? 'game' : 'level';
/** The level the page starts in: `?level=<id>`, or Crater Fields; on the game page only when one is asked for. */
const askedLevel = query.get('level');
const startLevel =
	askedLevel !== null && /^\d+$/.test(askedLevel) ? Number(askedLevel) : craterFields;
const startOnMap = kind === 'game' && askedLevel === null;
const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const toast = document.querySelector<HTMLElement>('#toast')!;
const promptEl = document.querySelector<HTMLElement>('#prompt')!;
const startEl = document.querySelector<HTMLElement>('#start')!;
const keysEl = document.querySelector<HTMLElement>('#keys')!;
const cardEl = document.querySelector<HTMLElement>('#card')!;
const pauseEl = document.querySelector<HTMLElement>('#paused')!;
const hintEl = document.querySelector<HTMLElement>('#sound-hint')!;
const muteButton = document.querySelector<HTMLButtonElement>('#mute')!;
const pauseButton = document.querySelector<HTMLButtonElement>('#pause')!;

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
	NumpadEnter: Input.confirm,
};

let held = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
interface Controls {
	restart(): void;
	togglePause(): void;
	toggleMute(): void;
	/** A key or tap while a card waits for one; true when it was used. */
	press(): boolean;
	/** A key while the start card is up; true when it was used, so the key is not also played. */
	startKey(event: KeyboardEvent): boolean;
}

function wireControls(controls: Controls): void {
	window.addEventListener('keydown', (event: KeyboardEvent) => {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (controls.startKey(event)) {
			event.preventDefault();
			return;
		}
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

/**
 * The game's HUD: pills of an icon and a number, then a badge for each key held and the pogo. The map shows the same
 * pills, then how many of the first area's levels are cleared where a level shows the keys.
 */
function hudHtml(sim: LevelSim): string {
	const lives = Math.max(0, sim.state(State.lives)),
		score = Math.round(sim.state(State.score)),
		ammo = sim.state(State.ammo),
		onMap = sim.mode === Mode.map,
		pill = (name: string, colour: string, value: string, label: string): string =>
			`<span class="pill" role="img" aria-label="${label}" style="color:${colour}">${icon(name)}<b>${value}</b></span>`,
		badges: string[] = [];
	if (onMap) {
		const cleared = clearedCount(sim.state(State.doneMask));
		badges.push(
			`<span class="badge" style="color:${cleared === firstAreaLevels.length ? '#55ff55' : '#ffff55'}">Cleared ${cleared} of ${firstAreaLevels.length}</span>`,
		);
	} else {
		if (sim.state(State.keyRed))
			badges.push(`<span class="badge" style="color:#ff5555">${icon('keyRed')}Red gumdrop</span>`);
		if (sim.state(State.pogoOn))
			badges.push(`<span class="badge" style="color:#55ffff">Pogo</span>`);
	}
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

let promptKey = '';

/** Shows the map's prompt panel for a landmark, or hides it. */
function showPrompt(prompt: MapPrompt | null): void {
	const key = prompt ? `${prompt.title}|${prompt.text}|${prompt.action}` : '';
	if (key === promptKey) return;
	promptKey = key;
	promptEl.hidden = !prompt;
	if (!prompt) return;
	promptEl.innerHTML = `<h2></h2><p class="text"></p><p class="action"></p>`;
	promptEl.querySelector('h2')!.textContent = prompt.title;
	promptEl.querySelector('.text')!.textContent = prompt.text;
	const action = promptEl.querySelector<HTMLElement>('.action')!;
	action.textContent = actionText(prompt);
	action.hidden = !prompt.action;
}

/** The keys line for the scene and the page. */
function keysText(mode: 'map' | 'level'): string {
	if (mode === 'map')
		return 'Arrows or WASD to walk · Enter or Space at a level to go in · P to pause · M to mute';
	return `Arrows or A D to run · Space to jump · C to pogo · X to fire the Fizz Stunner · P to pause · M to mute${kind === 'level' ? ' · R to restart' : ''}`;
}

/** The button label for a prompt's action: what Enter does there. */
function actionText(prompt: MapPrompt): string {
	if (!prompt.action) return '';
	const press = window.matchMedia?.('(pointer: coarse)').matches ? 'Tap Enter' : 'Press Enter';
	return prompt.action === 'Enter' ? press : `${press} to ${prompt.action.toLowerCase()}`;
}

function browserStorage(): Storage | null {
	try {
		return localStorage;
	} catch {
		return null;
	}
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
	if (startOnMap) sim.newGameOnMap();
	else sim.enter(startLevel);
	const stage = new Stage({
		canvas,
		sim,
		sheet,
		sheetImage,
		sets: query.has('flat') ? [] : modelSets,
		held: () => held,
	});
	/* A page held with `?paused` (tooling) keeps the sim still whatever the flow does; so does the start card. */
	let hold = query.has('paused');
	let startOpen = false;
	const holdSim = (): boolean => hold || startOpen;
	const storage = browserStorage();
	const sound = new LevelSound({
		storage,
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

	/* The prompt the map is showing, from the sim's last MAP_PROMPT. */
	let prompt: MapPrompt | null = null;
	let saveWarned = false;
	/** Keeps the game, as the game does each time it goes to the map. Returns whether it was kept. */
	const saveNow = (): boolean => {
		const kept = writeProgress(storage, captureProgress(sim));
		if (!kept && !saveWarned) {
			saveWarned = true;
			say("Couldn't save: storage is full or blocked");
		}
		return kept;
	};
	/** Starts a new game on the overworld and keeps it, as a new game does in the game. */
	const startNewGame = (): void => {
		sim.newGameOnMap();
		prompt = null;
		soundScene = '';
		saveNow();
	};
	/** Loads the save kept and goes to the map. Returns false when there is none. */
	const continueGame = (): boolean => {
		const saved = readProgress(storage);
		if (!saved) return false;
		sim.newGame();
		applyProgress(sim, saved);
		sim.enterMap();
		prompt = null;
		soundScene = '';
		saveNow();
		return true;
	};
	const flow = new LevelFlow({
		card: showCard,
		freeze: (on) => {
			stage.paused = on || holdSim();
		},
		muffle: (on) => sound.setScreen(on ? 'card' : 'play'),
		pauseScreen: (on) => {
			pauseEl.hidden = !on;
			pauseButton.setAttribute('aria-pressed', String(on));
			sound.setSuspended(on);
			held = 0;
		},
		retry: () => {
			sim.reenter(startLevel);
			sound.startLevel(startLevel);
		},
		newGame: () => {
			if (kind === 'game') startNewGame();
			else {
				sim.enter(startLevel);
				sound.startLevel(startLevel);
			}
		},
		toMap:
			kind === 'game'
				? () => {
						sim.enterMap();
						prompt = null;
						saveNow();
					}
				: undefined,
		celebrate: confetti,
		...timers,
	});
	stage.resize();
	addEventListener('resize', () => {
		stage.resize();
		scaleText();
	});

	/** Reads what the sim reported since the last look and acts on it. */
	const handleEvents = (): void => {
		for (const event of sim.events()) {
			if (event.kind === SimEvent.caption) {
				const word = sim.captions[event.c];
				if (word) sound.cue(word.text, event.a, event.b);
				caption(stage, event.c, word, event.a, event.b);
			}
			if (event.kind === SimEvent.toast) say(sim.toasts[event.a] ?? '');
			if (event.kind === SimEvent.mapPrompt) prompt = promptFor(event.a, event.b, event.c);
			if (event.kind === SimEvent.levelStart) {
				/* The sim enters a level itself when Ben confirms at its door, and keeps the map's view until told. */
				sim.frameLevel();
				prompt = null;
				say(levelName(event.a));
			}
			if (event.kind === SimEvent.levelComplete) {
				if (kind === 'game' && event.a >= saucerId) flow.leaveToMap();
				else
					flow.complete(
						levelName(event.a),
						sim.state(State.score),
						kind === 'game' ? LEVELS[event.a]?.cleared : undefined,
					);
			}
			if (event.kind === SimEvent.died) flow.died(event.a, levelName(event.b));
			if (event.kind === SimEvent.gameOver) flow.gameOver(event.a);
		}
	};

	/** The start card of the game page: continue the save, or start a new game. */
	const startCard = {
		continueButton: startEl.querySelector<HTMLButtonElement>('#start-continue')!,
		newButton: startEl.querySelector<HTMLButtonElement>('#start-new')!,
		saveLine: startEl.querySelector<HTMLElement>('#start-save')!,
	};
	let started = kind === 'level' || askedLevel !== null;
	const begin = (how: 'continue' | 'new'): void => {
		if (!startOpen) return;
		if (how === 'continue' && !continueGame()) startNewGame();
		else if (how === 'new') startNewGame();
		startOpen = false;
		startEl.hidden = true;
		started = true;
		stage.paused = holdSim();
		held = 0;
	};
	const openStartCard = (): void => {
		const saved = readProgress(storage);
		startOpen = true;
		startEl.hidden = false;
		stage.paused = true;
		startCard.continueButton.hidden = !saved;
		startCard.saveLine.hidden = !saved;
		startCard.saveLine.textContent = saved ? describeProgress(saved) : '';
		startCard.newButton.classList.toggle('primary', !saved);
		(saved ? startCard.continueButton : startCard.newButton).focus();
	};
	startCard.continueButton.addEventListener('click', () => begin('continue'));
	startCard.newButton.addEventListener('click', () => begin('new'));

	let hudKey = '';
	/** Shows what the sim says: the heads-up line, the map prompt, the keys line and the touch pad for the scene. */
	const updateUi = (): void => {
		const mode = sim.mode === Mode.map ? 'map' : 'level',
			html =
				hudHtml(sim) +
				(query.has('debug')
					? `<span>${Math.round(stage.stats.fps)} fps · ${stage.stats.calls} calls · ${Math.round(stage.stats.triangles / 1000)}k triangles · sync ${stage.stats.syncMs.toFixed(1)} ms · no model: ${[...stage.unmodelled].join(' ') || 'none'}</span>`
					: '');
		if (html !== hudKey) {
			hudKey = html;
			hud.innerHTML = html;
		}
		if (document.body.dataset.mode !== mode) {
			document.body.dataset.mode = mode;
			keysEl.textContent = keysText(mode);
		}
		showPrompt(
			mode === 'map' && flow.phase === 'play' && !flow.paused && !startOpen ? prompt : null,
		);
		hintEl.hidden = sound.unlocked || sound.muted;
	};
	/** The scene the sound was last set for, so a change of scene switches the music and the room. */
	let soundScene = '';
	/** What the page does after each frame: acts on the sim's events and falls, keeps the sound and the display in step. */
	const afterFrame = (): void => {
		handleEvents();
		/* The sim lets Ben fall for ever from a hole in the world; far below the level counts as a fall. */
		if (sim.mode === Mode.level && flow.phase === 'play' && sim.state(State.playerY) < fallLimit) {
			const lives = sim.state(State.lives) - 1;
			sim.setLives(lives);
			if (lives < 0) flow.gameOver(sim.state(State.score));
			else flow.died(lives, levelName(sim.state(State.levelId)));
		}
		/* A change of scene moves the music and the room with it; a restart in place has its own call. */
		const shown = stage.showing;
		if (started && shown.key !== soundScene) {
			soundScene = shown.key;
			sound.setScene(shown.mode, shown.level);
		}
		updateUi();
	};
	/** Steps the sim a number of whole steps and runs everything the page does after a frame. */
	const advance = (steps: number, heldBits: number): void => {
		stage.advance(steps, heldBits);
		afterFrame();
	};
	/** Puts Ben on the map at a spot through the sim's map position, as a save does. Returns where he stands then. */
	const placeOnMap = (x: number, y: number): { x: number; y: number } => {
		sim.setState(State.mapX, x);
		sim.setState(State.mapY, y);
		sim.enterMap();
		prompt = null;
		handleEvents();
		return { x: sim.state(State.playerX), y: sim.state(State.playerY) };
	};
	/* Tooling reaches the page through this: pause, place Ben, advance by whole steps with the page's flow running, list
	   sprites with no model, read the sound (the audio context, the music track and the room) and the save. */
	Object.assign(window, {
		level: {
			kind,
			stage,
			sim,
			Input,
			State,
			Mode,
			restart: () => flow.restart(),
			flow,
			sound,
			soundState: () => sound.debug(),
			advance,
			/** The input bits the keys and touch buttons hold now. */
			held: () => held,
			/** Keeps the sim still whatever the flow does (tooling), or lets it run. */
			setHold: (on: boolean) => {
				hold = on;
				stage.paused = holdSim();
			},
			placeOnMap,
			prompt: () => prompt,
			save: () => readProgress(storage),
			startNewGame,
			continueGame,
			begin,
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
		restart: () => {
			if (kind === 'level') flow.restart();
		},
		togglePause: () => {
			if (!startOpen) flow.togglePause();
		},
		toggleMute: () => void sound.toggleMuted(),
		press: () => flow.press(),
		startKey: (event) => {
			if (!startOpen) return false;
			const canContinue = !startCard.continueButton.hidden;
			if (event.repeat) return true;
			if (event.code === 'KeyN') begin('new');
			else if (event.code === 'KeyC' && canContinue) begin('continue');
			else if (event.code === 'Enter' || event.code === 'Space')
				begin(canContinue && document.activeElement !== startCard.newButton ? 'continue' : 'new');
			else return false;
			return true;
		},
	});
	document.addEventListener('visibilitychange', () => {
		if (document.hidden && flow.phase === 'play' && !flow.paused && !startOpen) flow.togglePause();
	});
	if (hold) stage.paused = true;
	if (kind === 'game' && askedLevel === null) {
		/* The map shows behind the start card. Tooling skips the card with `?new` or `?continue`. */
		if (query.has('continue')) {
			started = true;
			if (!continueGame()) startNewGame();
		} else if (query.has('new')) {
			started = true;
			startNewGame();
		} else openStartCard();
	}
	const frame = (now: number): void => {
		stage.tick(now);
		afterFrame();
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
	Object.assign(window, { ready: true });
}

void start();
