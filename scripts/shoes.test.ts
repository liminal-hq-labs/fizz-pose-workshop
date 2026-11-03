// Checks that Ben's rig shoes match the saved standing high-tops seen from the same side.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import skin from '../source/ben-side-skin.json';
import edits from '../edits.json';
import type { Frames } from '../src/types.ts';

const saved = edits as unknown as Frames;
const colourRows = (rows: readonly { pixels: string }[]): string[] =>
	rows.map((row) => row.pixels).filter((pixels) => /[^k.]/.test(pixels));

test('front-facing rigs wear the saved front stand\'s high-tops, white toe cap on each outer corner', () => {
	const stand = saved.ben_standFront.grid,
		sole = stand.findLastIndex((row) => /[^.]/.test(row)),
		shoeRows = stand.slice(sole - 3, sole + 1);
	const left = colourRows(skin.frontShoe.left.rows),
		right = colourRows(skin.frontShoe.right.rows);
	expect(left).toHaveLength(4);
	expect(right).toEqual(left.map((row) => [...row].reverse().join('')));
	// The stand's two shoes sit side by side and share their middle ink column.
	for (let y = 0; y < 4; y++) {
		const row = shoeRows[y].replace(/^\.+|\.+$/g, ''),
			middle = row.length >> 1;
		expect(left[y].replace(/^\.+/, '')).toBe(row.slice(0, middle + 1).replace(/^\.+/, ''));
		expect(right[y].replace(/\.+$/, '')).toBe(row.slice(middle).replace(/\.+$/, ''));
	}
	for (const name of ['ben_phone1', 'ben_phone2', 'ben_phone3']) {
		const grid = saved[name].grid,
			bottom = grid.findLastIndex((row) => /[^.]/.test(row));
		expect(grid[bottom - 2]).toMatch(/kWRRRk+RRRWk/);
		expect(grid[bottom - 1]).toMatch(/kWWWWk+WWWWk/);
	}
});

test('the climbing heel shoe has the rear turntable shoe\'s four colour rows and a white sole', () => {
	const back = colourRows(skin.backShoe.rows),
		rear = saved.ben_turn180.grid.slice(31, 35);
	expect(back).toHaveLength(rear.length);
	expect(back.at(-1)).toMatch(/^kW+k$/);
	expect(back.slice(0, -1).every((row) => /R/.test(row))).toBe(true);
});

test('side-view rigs share the running shoe: red upper, white toe cap and sole, yellow badge, grey far sole', () => {
	const near = colourRows(skin.shoe.rows),
		far = colourRows(skin.shoe.farRows);
	expect(near).toEqual(['kRRrrRk', 'kRRRWWk', 'kWWWWWk']);
	expect(far.at(-1)).toMatch(/^kL+k$/);
	expect(skin.shoe.badge?.colour).toBe('y');
});
