// Mini-notation for the music: a parser, a cycle evaluator and note names as frequencies.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Ported from packages/engine/src/audio.ts of liminal-hq/lieutenant-fizz at commit 94f354d.

// ---------- Mini-notation subset: [ ] seq, < > alternate, , stack, *n repeat, ~ rest ----------

type Node =
	| { t: 'rest'; rep?: number }
	| { t: 'word'; v: string; rep?: number }
	| { t: 'seq'; items: Node[]; rep?: number }
	| { t: 'alt'; items: Node[]; rep?: number }
	| { t: 'stack'; parts: Node[]; rep?: number };

export function parseMini(src: string): Node {
	let i = 0;
	const ws = (): void => {
		while (src[i] === ' ') i++;
	};
	const seq = (close: string | null): Extract<Node, { t: 'seq' }> => {
		const items: Node[] = [];
		for (;;) {
			ws();
			if (i >= src.length || src[i] === close || src[i] === ',') break;
			items.push(item());
		}
		return { t: 'seq', items };
	};
	const group = (close: string, kind: 'seq' | 'alt'): Node => {
		i++;
		const parts = [seq(close)];
		while (src[i] === ',') {
			i++;
			parts.push(seq(close));
		}
		i++;
		if (parts.length > 1) return { t: 'stack', parts };
		const first = parts[0]!;
		return kind === 'alt' ? { t: 'alt', items: first.items } : first;
	};
	const atom = (): Node => {
		if (src[i] === '[') return group(']', 'seq');
		if (src[i] === '<') return group('>', 'alt');
		let w = '';
		while (i < src.length && !' []<>,*'.includes(src[i]!)) w += src[i++];
		return w === '~' ? { t: 'rest' } : { t: 'word', v: w };
	};
	const item = (): Node => {
		const a = atom();
		if (src[i] === '*') {
			i++;
			let n = '';
			while (/[0-9]/.test(src[i] ?? '')) n += src[i++];
			a.rep = +n;
		}
		return a;
	};
	return seq(null);
}

export interface MiniEvent {
	/** Start and end as a fraction of one cycle. */
	t0: number;
	t1: number;
	v: string;
}

/** Evaluates cycle `cyc` of a parsed pattern into timed events (appended to `out`). */
export function evalMini(node: Node, t0: number, t1: number, cyc: number, out: MiniEvent[]): void {
	const rep = node.rep ?? 1;
	const d = (t1 - t0) / rep;
	for (let k = 0; k < rep; k++) {
		const a = t0 + k * d;
		const b = a + d;
		const c = cyc * rep + k;
		if (node.t === 'word') out.push({ t0: a, t1: b, v: node.v });
		else if (node.t === 'seq') {
			const n = node.items.length;
			node.items.forEach((it, j) =>
				evalMini(it, a + ((b - a) * j) / n, a + ((b - a) * (j + 1)) / n, c, out),
			);
		} else if (node.t === 'alt') {
			const n = node.items.length;
			const pick = node.items[((c % n) + n) % n];
			if (pick) evalMini(pick, a, b, Math.floor(c / n), out);
		} else if (node.t === 'stack') node.parts.forEach((p) => evalMini(p, a, b, c, out));
	}
}

const NOTE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** Frequency in Hz of a note name like `c#4` (A4 = 440). */
export function noteHz(name: string): number {
	const m = /^([a-g])(#|b)?(-?\d)$/.exec(name);
	if (!m) return 440;
	const n = (NOTE[m[1]!] ?? 0) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3]! + 1) * 12;
	return 440 * Math.pow(2, (n - 69) / 12);
}
