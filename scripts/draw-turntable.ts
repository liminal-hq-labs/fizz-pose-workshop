// Builds editable standing rotation frames, a looping preview and a saved three-dimensional rig study.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import rig from '../source/ben-turntable-rig.json';
import skin from '../source/ben-turntable-skin.json';
import keyData from '../source/ben-turntable-keys.json';
import { sampleTurntable, validateTurntable, type TurntableRig } from '../src/rig/turntable.ts';
import { turntableKeys, sampleTurntableSkin, type TurntableKeys } from './turntable-reference.ts';
import { gif, png, rects } from './images.ts';
import { validateFrames } from '../src/model.ts';
import type { Frame, Frames, WorkshopData } from '../src/types.ts';

// JSON imports widen the draft names to strings; the loader checks every stop when it builds.
export const turntableData = keyData as unknown as TurntableKeys;
export const stopName = (angle: number): string => 'ben_turn' + String(angle).padStart(3, '0');

export function buildTurntable(): Frames {
	validateTurntable(rig);
	const keys = turntableKeys(rig, skin, turntableData);
	const frames = Object.fromEntries(
		Array.from({ length: rig.sampleCount }, (_, i) => {
			const angle = (i * 360) / rig.sampleCount;
			return [stopName(angle), sampleTurntableSkin(rig, keys, angle, turntableData)];
		}),
	);
	return validateFrames(frames, frames, skin.palette);
}
export function turntableDiagram(config: TurntableRig, angle: number): string {
	const pose = sampleTurntable(config, angle);
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${config.width * 10}" height="${config.height * 10}" viewBox="0 0 ${config.width} ${config.height}"><rect width="100%" height="100%" fill="#102018"/>` +
		config.connections
			.map(
				(chain, i) =>
					`<polyline points="${chain.map((name) => pose.joints[name].pixel.join(',')).join(' ')}" fill="none" stroke="${i % 2 ? '#a080d0' : '#75edfa'}" stroke-width=".25"/>`,
			)
			.join('') +
		Object.entries(pose.joints)
			.map(
				([name, j]) =>
					`<circle cx="${j.pixel[0]}" cy="${j.pixel[1]}" r=".23" fill="${name === 'stunner' ? '#ff55ff' : '#ffef5f'}"><title>${name}</title></circle>`,
			)
			.join('') +
		'</svg>'
	);
}
/** Pixels that differ between two equally sized frames. */
export function changedPixels(a: Frame, b: Frame): number {
	let count = 0;
	for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) if (a.grid[y][x] !== b.grid[y][x]) count++;
	return count;
}
if (import.meta.main) {
	const root = new URL('../', import.meta.url),
		frames = buildTurntable();
	const authored: Omit<WorkshopData, 'palette'> = JSON.parse(await readFile(new URL('source/poses.json', root), 'utf8'));
	const edits: Frames = JSON.parse(await readFile(new URL('edits.json', root), 'utf8'));
	Object.assign(authored.frames, frames);
	Object.assign(edits, frames);
	authored.animations['standing-360'] = {
		frames: Object.keys(frames),
		durationsMs: Object.keys(frames).map(() => rig.frameMs),
		loop: true,
	};
	await writeFile(new URL('source/poses.json', root), JSON.stringify(authored, null, 2) + '\n');
	await writeFile(new URL('edits.json', root), JSON.stringify(edits, null, 2) + '\n');
	const folder = new URL('rig/ben-turntable/', root);
	await mkdir(folder, { recursive: true });
	await writeFile(new URL('rig.json', folder), JSON.stringify(rig, null, 2) + '\n');
	await writeFile(new URL('skin.json', folder), JSON.stringify(skin, null, 2) + '\n');
	await writeFile(new URL('keys.json', folder), JSON.stringify(keyData, null, 2) + '\n');
	await writeFile(
		new URL('samples.json', folder),
		JSON.stringify(
			{
				frameMs: rig.frameMs,
				samples: Array.from({ length: rig.sampleCount }, (_, i) => sampleTurntable(rig, (i * 360) / rig.sampleCount)),
			},
			null,
			2,
		) + '\n',
	);
	const list = Object.entries(frames);
	const continuity = {
		notes:
			'Per-stop continuity: crown and lowest sole rows, Stunner pixels (purple, on the right hip only) and pixels changed from the previous stop. The occupied width must fit a 24-pixel crop (x4–27).',
		frames: list.map(([name, frame], i) => {
			const columns = frame.grid.flatMap((row) => [...row].flatMap((code, x) => (code === '.' ? [] : [x])));
			return {
				name,
				crownY: frame.grid.findIndex((row) => /[^.]/.test(row)),
				soleY: frame.grid.findLastIndex((row) => /[^.]/.test(row)),
				left: Math.min(...columns),
				right: Math.max(...columns),
				stunnerPixels: [...frame.grid.join('')].filter((code) => code === 'M' || code === 'm').length,
				changedFromPrevious: changedPixels(list[(i + list.length - 1) % list.length][1], frame),
				cleanedRows: Object.keys(turntableData.inbetweens.find((s) => stopName(s.angle) === name)?.rows ?? {}).length,
			};
		}),
	};
	await writeFile(new URL('continuity-review.json', folder), JSON.stringify(continuity, null, 2) + '\n');
	await writeFile(
		new URL('sprites.gif', folder),
		gif(
			Object.values(frames),
			Object.keys(frames).map(() => rig.frameMs),
			skin.palette,
		),
	);
	for (const [i, frame] of Object.values(frames).entries()) {
		const degrees = String((i * 360) / rig.sampleCount).padStart(3, '0');
		await writeFile(new URL(`sprite-${degrees}.png`, folder), png(frame, skin.palette));
		await writeFile(
			new URL(`sprite-${degrees}.svg`, folder),
			`<svg xmlns="http://www.w3.org/2000/svg" width="${rig.width}" height="${rig.height}" viewBox="0 0 ${rig.width} ${rig.height}" shape-rendering="crispEdges">${rects(frame, skin.palette)}</svg>`,
		);
		await writeFile(new URL(`rig-${degrees}.svg`, folder), turntableDiagram(rig, (i * 360) / rig.sampleCount));
	}
	console.log(`Saved ${list.length} standing rotation stops, their joint tracks and the reusable keys.`);
}
