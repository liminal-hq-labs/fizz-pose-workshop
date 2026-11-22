// The 3D level page: loads the sim, wires the controls and heads-up line, and runs the stage or the model gallery.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import sheetJson from '../../vendor/lieutenant-fizz/sprites.json';
import sheetUrl from '../../vendor/lieutenant-fizz/sprites.png?url';
import wasmUrl from '../../vendor/lieutenant-fizz/sim.wasm?url';
import { modelSets } from './registry.ts';
import { SimEvent, Input, LevelSim, Mode, type SpriteSheet, State } from './sim.ts';
import { Stage } from './stage.ts';
import type { Actor, SpriteDraw } from './types.ts';

const craterFields = 0;
const sheet = sheetJson as SpriteSheet;
const query = new URLSearchParams(location.search);
const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const toast = document.querySelector<HTMLElement>('#toast')!;

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
function wireControls(restart: () => void): void {
	window.addEventListener('keydown', (event: KeyboardEvent) => {
		if (event.code === 'KeyR') restart();
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

function say(text: string): void {
	toast.textContent = text;
	toast.classList.add('show');
	setTimeout(() => toast.classList.remove('show'), 1800);
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
	const stage = new Stage({ canvas, sim, sheet, sheetImage, sets: modelSets, held: () => held });
	const restart = (): void => {
		sim.enter(craterFields);
	};
	stage.resize();
	addEventListener('resize', () => stage.resize());
	/* Tooling reaches the page through this: pause, place Ben, advance by whole steps, and list sprites with no model. */
	Object.assign(window, { level: { stage, sim, Input, State, restart } });
	const gallery = query.get('gallery');
	if (gallery !== null) {
		stage.sync(0, 0);
		const all = [...new Set(stage.draws.map((draw) => draw.name))];
		runGallery(stage, gallery ? gallery.split(',') : all);
		Object.assign(window, { ready: true });
		return;
	}
	wireControls(restart);
	if (query.has('paused')) stage.paused = true;
	const frame = (now: number): void => {
		stage.tick(now);
		for (const kind of sim.events()) {
			if (kind === SimEvent.levelComplete) say('Level complete!');
			if (kind === SimEvent.died) say('Ouch!');
			if (kind === SimEvent.gameOver) say('Game over');
		}
		if (sim.mode !== Mode.level) restart();
		hud.innerHTML =
			`<span>Lives <b>${sim.state(State.lives)}</b></span><span>Snacks <b>${sim.state(State.score)}</b></span>` +
			`<span>Fizz <b>${sim.state(State.ammo)}</b></span>` +
			(sim.state(State.keyRed) ? '<span><b>Red gumdrop</b></span>' : '') +
			(sim.state(State.pogoOn) ? '<span><b>Pogo</b></span>' : '') +
			(query.has('debug') ? `<span>no model: ${[...stage.unmodelled].join(' ')}</span>` : '');
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
	Object.assign(window, { ready: true });
}

void start();
