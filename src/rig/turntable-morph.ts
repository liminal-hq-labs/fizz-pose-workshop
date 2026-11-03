// Draws in-between turntable views by aligning each row's colour runs between two keys and sliding them.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** One horizontal stretch of a single palette code, `x0` inclusive and `x1` exclusive. */
export interface ColourRun {
	readonly code: string;
	readonly x0: number;
	readonly x1: number;
}

/** Splits a grid row into its colour runs, transparency included. */
export function colourRuns(row: string): ColourRun[] {
	const runs: { code: string; x0: number; x1: number }[] = [];
	for (let x = 0; x < row.length; x++) {
		const last = runs.at(-1);
		if (last && last.code === row[x]) last.x1 = x + 1;
		else runs.push({ code: row[x], x0: x, x1: x + 1 });
	}
	return runs;
}

// Codes in one family are the same material in light and shade, so a run may change between them.
const family: Readonly<Record<string, string>> = {
	W: 'skin',
	L: 'skin',
	g: 'shell',
	G: 'shell',
	R: 'shirt',
	r: 'shirt',
	B: 'denim',
	b: 'denim',
	c: 'denim',
	M: 'stunner',
	m: 'stunner',
};

function colourCost(a: string, b: string): number {
	if (a === b) return 0;
	if (a === '.' || b === '.') return Infinity;
	if (family[a] && family[a] === family[b]) return 1.2;
	if (a === 'k' || b === 'k') return 2.5;
	return 3;
}

const weights = { travel: 0.35, width: 0.15, skip: 1.6, skipPerPixel: 0.5 } as const;

/**
 * Morphs one row from `a` (t = 0) to `b` (t = 1). Runs are paired by a minimum-cost alignment that
 * keeps their order, so every feature slides from its place in one key to its place in the other.
 * A run found in only one key grows from or shrinks to zero width beside its neighbours, so a
 * feature fades in or out by width rather than appearing whole. Paired runs keep the first key's
 * code until halfway.
 */
export function morphRow(a: string, b: string, t: number): string {
	if (a.length !== b.length) throw new Error('Morphed rows must have the same width.');
	const runsA = colourRuns(a),
		runsB = colourRuns(b),
		n = runsA.length,
		m = runsB.length;
	const cost = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(Infinity)),
		step = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
	cost[0][0] = 0;
	const width = (run: ColourRun): number => run.x1 - run.x0,
		centre = (run: ColourRun): number => (run.x0 + run.x1) / 2;
	for (let i = 0; i <= n; i++)
		for (let j = 0; j <= m; j++) {
			const here = cost[i][j];
			if (here === Infinity) continue;
			if (i < n && j < m) {
				const pair =
					here +
					colourCost(runsA[i].code, runsB[j].code) +
					weights.travel * Math.abs(centre(runsA[i]) - centre(runsB[j])) +
					weights.width * Math.abs(width(runsA[i]) - width(runsB[j]));
				if (pair < cost[i + 1][j + 1]) {
					cost[i + 1][j + 1] = pair;
					step[i + 1][j + 1] = 1;
				}
			}
			if (i < n) {
				const drop = here + weights.skip + weights.skipPerPixel * width(runsA[i]);
				if (drop < cost[i + 1][j]) {
					cost[i + 1][j] = drop;
					step[i + 1][j] = 2;
				}
			}
			if (j < m) {
				const add = here + weights.skip + weights.skipPerPixel * width(runsB[j]);
				if (add < cost[i][j + 1]) {
					cost[i][j + 1] = add;
					step[i][j + 1] = 3;
				}
			}
		}
	const path: { a?: ColourRun; b?: ColourRun }[] = [];
	for (let i = n, j = m; i > 0 || j > 0; ) {
		const move = step[i][j];
		if (move === 1) path.unshift({ a: runsA[--i], b: runsB[--j] });
		else if (move === 2) path.unshift({ a: runsA[--i] });
		else path.unshift({ b: runsB[--j] });
	}
	const out = Array<string>(a.length).fill('.');
	let endA = 0,
		endB = 0;
	for (const pair of path) {
		const startA = endA,
			startB = endB;
		if (pair.a) endA = pair.a.x1;
		if (pair.b) endB = pair.b.x1;
		const code = pair.a && pair.b ? (t < 0.5 ? pair.a.code : pair.b.code) : (pair.a ?? pair.b)!.code;
		const from = Math.round(startA + (startB - startA) * t),
			to = Math.round(endA + (endB - endA) * t);
		for (let x = from; x < to; x++) out[x] = code;
	}
	return out.join('');
}

/** Morphs every row of two equally sized grids. */
export function morphGrid(a: readonly string[], b: readonly string[], t: number): string[] {
	if (a.length !== b.length) throw new Error('Morphed grids must have the same height.');
	return a.map((row, y) => morphRow(row, b[y], t));
}

/** Mirrors a grid about column `axis / 2`, so pixel x moves to `axis - x`. */
export function mirrorGrid(grid: readonly string[], axis: number): string[] {
	return grid.map((row) => Array.from({ length: row.length }, (_, x) => row[axis - x] ?? '.').join(''));
}
