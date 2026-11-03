// Builds the standing turntable from eight authored keys, morphed in-betweens and their hand-cleaned rows.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Frame, Frames } from '../src/types.ts';
import type { TurntableRig } from '../src/rig/turntable.ts';
import { mirrorGrid, morphGrid } from '../src/rig/turntable-morph.ts';

export interface TurntableSkin {
	readonly references: Frames;
}
/** A 45° key: a saved standing sprite padded onto the turntable canvas, or an authored grid. */
export interface TurntableKeySource {
	readonly angle: number;
	readonly reference?: string;
	readonly extendLeg?: boolean;
	readonly grid?: readonly string[];
	readonly source?: string;
}
/** A 15° in-between: a morph of its neighbouring keys or a mirror of its partner, plus cleaned rows. */
export interface TurntableInbetween {
	readonly angle: number;
	readonly draft: 'morph' | 'mirror';
	readonly of?: number;
	readonly axis?: number;
	readonly rows: Readonly<Record<string, string>>;
	readonly notes?: string;
}
export interface TurntableKeys {
	readonly keys: readonly TurntableKeySource[];
	readonly inbetweens: readonly TurntableInbetween[];
}
export interface TurntableKey {
	readonly angle: number;
	readonly frame: Frame;
	readonly reference: string;
}

export function padStanding(frame: Frame, rig: TurntableRig, extendFrontLeg = false): Frame {
	if (extendFrontLeg)
		frame = { ...frame, grid: [...frame.grid.slice(0, 30), frame.grid[29], ...frame.grid.slice(30, -1)] };
	const bottom = frame.grid.findLastIndex((row) => /[^.]/.test(row)),
		dy = rig.groundY - bottom,
		dx = Math.floor((rig.width - frame.width) / 2);
	const rows = Array.from({ length: rig.height }, () => Array<string>(rig.width).fill('.'));
	frame.grid.forEach((row, y) =>
		[...row].forEach((code, x) => {
			if (code !== '.') rows[y + dy][x + dx] = code;
		}),
	);
	return { width: rig.width, height: rig.height, grid: rows.map((row) => row.join('')) };
}

/** The eight 45° keys in angle order, with the front repeated at 360° to close the loop. */
export function turntableKeys(rig: TurntableRig, skin: TurntableSkin, data: TurntableKeys): TurntableKey[] {
	const keys = data.keys.map((key): TurntableKey => {
		if (key.reference) {
			const saved = skin.references[key.reference];
			if (!saved) throw new Error(`Turntable key ${key.angle}° names a missing reference.`);
			return { angle: key.angle, frame: padStanding(saved, rig, key.extendLeg), reference: key.reference };
		}
		if (!key.grid || key.grid.length !== rig.height || key.grid.some((row) => row.length !== rig.width))
			throw new Error(`Turntable key ${key.angle}° needs a ${rig.width} × ${rig.height} grid.`);
		return {
			angle: key.angle,
			frame: { width: rig.width, height: rig.height, grid: [...key.grid] },
			reference: key.source ?? 'authored key',
		};
	});
	keys.sort((a, b) => a.angle - b.angle);
	if (keys.length !== 8 || keys.some((key, i) => key.angle !== i * 45))
		throw new Error('The turntable needs one key every 45° from 0° to 315°.');
	return [...keys, { ...keys[0], angle: 360 }];
}

/** The plain morph of the two keys around `angle`, before any hand cleaning. */
export function morphDraft(keys: readonly TurntableKey[], angle: number): Frame {
	const yaw = ((angle % 360) + 360) % 360,
		index = Math.max(0, keys.findLastIndex((key) => key.angle <= yaw)),
		a = keys[index],
		b = keys[index + 1],
		t = (yaw - a.angle) / (b.angle - a.angle);
	if (t === 0) return structuredClone(a.frame);
	return { ...a.frame, grid: morphGrid(a.frame.grid, b.frame.grid, t) };
}

function applyRows(frame: Frame, rows: Readonly<Record<string, string>>, angle: number): Frame {
	const grid = [...frame.grid];
	for (const [y, row] of Object.entries(rows)) {
		const index = Number(y);
		if (!Number.isInteger(index) || index < 0 || index >= grid.length || row.length !== frame.width)
			throw new Error(`Turntable ${angle}° has a cleaned row ${y} that does not fit the canvas.`);
		grid[index] = row;
	}
	return { ...frame, grid };
}

/**
 * Draws one turntable stop. Keys return their authored or saved pixels. A stored in-between starts
 * from its draft (the morph of its keys, or the mirror of its already finished partner) and replaces
 * the rows that were cleaned by hand. Any other angle returns the plain morph.
 */
export function sampleTurntableSkin(
	rig: TurntableRig,
	keys: readonly TurntableKey[],
	angle: number,
	data: TurntableKeys,
	seen: ReadonlySet<number> = new Set(),
): Frame {
	const yaw = ((angle % 360) + 360) % 360,
		key = keys.find((candidate) => candidate.angle === yaw);
	if (key) return structuredClone(key.frame);
	const inbetween = data.inbetweens.find((candidate) => candidate.angle === yaw);
	if (!inbetween) return morphDraft(keys, yaw);
	let draft: Frame;
	if (inbetween.draft === 'mirror') {
		if (inbetween.of === undefined || inbetween.axis === undefined || seen.has(yaw))
			throw new Error(`Turntable ${yaw}° needs a mirror partner and axis without a cycle.`);
		const partner = sampleTurntableSkin(rig, keys, inbetween.of, data, new Set([...seen, yaw]));
		draft = { ...partner, grid: mirrorGrid(partner.grid, inbetween.axis) };
	} else draft = morphDraft(keys, yaw);
	return applyRows(draft, inbetween.rows, yaw);
}
