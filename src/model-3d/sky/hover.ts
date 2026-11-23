// The hover platform: a silver anti-gravity pad whose top is the platform's standing surface, with lamps along its front and a cyan glow under it that pulses between the sprite's two frames.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { propMaterial, unlitMaterial } from '../crater/materials.ts';
import { Mesher, mix, shade, type V3 } from '../crater/mesher.ts';
import { glowGeometry, glowMaterial as haloMaterial, ease } from '../snacks/shared.ts';
import { depth } from '../toon.ts';
import { palette } from './palette.ts';

/** Half the pad's depth: a shelf, like the ledges. */
const reach = depth.shelf / 2;
/** How the sprite's 8 rows of art divide the pad's height: the slab is 6 of them and the nozzles the last 2. */
const slabShare = 0.75;
/** The width of the bevel round the top of the slab, and how far the hull tucks in under it. */
const bevel = 0.05;
const tuck = 0.1;
const nozzleRadius = 0.1;

interface PadGeometry {
	body: THREE.BufferGeometry;
	lamps: THREE.BufferGeometry;
	nozzles: THREE.BufferGeometry;
	/** Where the nozzles are along the pad. */
	nozzleX: readonly number[];
	/** Where the nozzles end, below the pad's centre. */
	foot: number;
}

const cache = new Map<string, PadGeometry>();

/** A ring of four flat sides joining a lower rectangle to an upper one, with colour running from `lo` to `hi`. */
function band(
	m: Mesher,
	lo: { y: number; ax: number; az: number },
	hi: { y: number; ax: number; az: number },
	lowColour: number,
	highColour: number,
	sideShade: { front: number; back: number; side: number },
): void {
	const { ax, az, y: ylo } = lo,
		{ ax: bx, az: bz, y: yhi } = hi,
		face = (a: V3, b: V3, c: V3, d: V3, k: number): void => {
			m.quadC(
				a,
				b,
				c,
				d,
				shade(lowColour, k),
				shade(lowColour, k),
				shade(highColour, k),
				shade(highColour, k),
			);
		};
	face([-ax, ylo, az], [ax, ylo, az], [bx, yhi, bz], [-bx, yhi, bz], sideShade.front);
	face([ax, ylo, -az], [-ax, ylo, -az], [-bx, yhi, -bz], [bx, yhi, -bz], sideShade.back);
	face([ax, ylo, az], [ax, ylo, -az], [bx, yhi, -bz], [bx, yhi, bz], sideShade.side);
	face([-ax, ylo, -az], [-ax, ylo, az], [-bx, yhi, bz], [-bx, yhi, -bz], sideShade.side * 0.92);
}

/**
 * The pad for a sprite `w` by `h` tiles, around its centre. The slab's top is at `h / 2`, flat over the whole pad apart from
 * a narrow bevel at its rim, which is where the simulation's platform top is; its ends are at `+/- w / 2`.
 */
function padGeometry(w: number, h: number): PadGeometry {
	const key = `${w}|${h}`;
	let hit = cache.get(key);
	if (hit) return hit;
	const hw = w / 2,
		yt = h / 2,
		yb = yt - h * slabShare,
		ym = yt - 0.14,
		foot = -h / 2,
		m = new Mesher();
	/* The top plate: panels about half a tile long with dark seams between them, a hair above a dark floor. */
	const panels = Math.max(2, Math.round(w / 0.5)),
		seam = 0.012,
		topLeft = hw - bevel,
		topFront = reach - bevel;
	m.quad(
		[-topLeft, yt - 0.01, topFront],
		[topLeft, yt - 0.01, topFront],
		[topLeft, yt - 0.01, -topFront],
		[-topLeft, yt - 0.01, -topFront],
		shade(palette.metalDark, 0.8),
	);
	for (let i = 0; i < panels; i++)
		for (let j = 0; j < 2; j++) {
			const x0 = -topLeft + (i * 2 * topLeft) / panels + (i === 0 ? 0 : seam / 2),
				x1 = -topLeft + ((i + 1) * 2 * topLeft) / panels - (i === panels - 1 ? 0 : seam / 2),
				z0 = -topFront + (j * 2 * topFront) / 2 + (j === 0 ? 0 : seam / 2),
				z1 = -topFront + ((j + 1) * 2 * topFront) / 2 - (j === 1 ? 0 : seam / 2),
				tone = 0.97 + 0.05 * (((i * 3 + j * 5) % 4) / 3),
				c = shade(palette.metalLight, tone);
			m.quadC(
				[x0, yt, z1],
				[x1, yt, z1],
				[x1, yt, z0],
				[x0, yt, z0],
				shade(c, 0.94),
				shade(c, 0.94),
				c,
				c,
			);
		}
	/* The bevel round the top, the slab's wall, and the hull tucking in under it to a dark underside. */
	band(
		m,
		{ y: yt - bevel, ax: hw, az: reach },
		{ y: yt, ax: hw - bevel, az: reach - bevel },
		palette.metal,
		palette.metalLight,
		{ front: 1.02, back: 0.8, side: 0.92 },
	);
	band(
		m,
		{ y: ym, ax: hw, az: reach },
		{ y: yt - bevel, ax: hw, az: reach },
		shade(palette.metal, 0.9),
		palette.metal,
		{ front: 1, back: 0.78, side: 0.88 },
	);
	band(
		m,
		{ y: yb, ax: hw - tuck, az: reach - tuck },
		{ y: ym, ax: hw, az: reach },
		palette.metalDark,
		shade(palette.metal, 0.82),
		{ front: 0.95, back: 0.7, side: 0.85 },
	);
	m.quad(
		[-(hw - tuck), yb, -(reach - tuck)],
		[hw - tuck, yb, -(reach - tuck)],
		[hw - tuck, yb, reach - tuck],
		[-(hw - tuck), yb, reach - tuck],
		shade(palette.metalDark, 0.6),
	);
	/* A dark strip along the front wall, for the lamps to sit in. */
	const stripLow = ym + 0.03,
		stripHigh = yt - bevel - 0.04,
		stripZ = reach + 0.004;
	m.quad(
		[-hw + 0.1, stripLow, stripZ],
		[hw - 0.1, stripLow, stripZ],
		[hw - 0.1, stripHigh, stripZ],
		[-hw + 0.1, stripHigh, stripZ],
		shade(palette.metalDark, 0.75),
	);
	/* Lamps: domes along the strip. One mesh, whose material is the red or the yellow lamp. */
	const lamps = new Mesher(),
		count = Math.max(3, Math.round(w / 0.4)),
		ly = (stripLow + stripHigh) / 2,
		lr = 0.045;
	for (let i = 0; i < count; i++) {
		const x = -hw + 0.3 + (i * (w - 0.6)) / (count - 1),
			z = stripZ + 0.002;
		lamps.pyramid(
			[
				[x - lr, ly - lr, z],
				[x + lr, ly - lr, z],
				[x + lr, ly + lr, z],
				[x - lr, ly + lr, z],
			],
			[x, ly, z + 0.04],
			[0xffffff, 0xe0e0e0, 0xffffff, 0xf0f0f0],
		);
	}
	/* Nozzles: short cyan cones under the hull, at the sprite's three thrusters. */
	const nozzles = new Mesher(),
		nozzleX = [-w * 0.33, 0, w * 0.33],
		sides = 8;
	for (const x of nozzleX) {
		const rim = (r: number, y: number): V3[] =>
			Array.from({ length: sides }, (_, k) => {
				const a = (k / sides) * Math.PI * 2;
				return [x + Math.cos(a) * r, y, Math.sin(a) * r] as const;
			});
		const top = rim(nozzleRadius, yb),
			end = rim(nozzleRadius * 0.7, foot);
		for (let k = 0; k < sides; k++) {
			const l = (k + 1) % sides;
			nozzles.quadC(
				top[l],
				top[k],
				end[k],
				end[l],
				palette.metalDark,
				palette.metalDark,
				palette.glow,
				palette.glow,
			);
		}
		for (let k = 1; k + 1 < sides; k++)
			nozzles.tri(end[0], end[k + 1], end[k], mix(palette.glow, 0xffffff, 0.6));
	}
	hit = { body: m.build(), lamps: lamps.build(), nozzles: nozzles.build(), nozzleX, foot };
	cache.set(key, hit);
	return hit;
}

const redLamp = new THREE.MeshBasicMaterial({ color: palette.lampRed }),
	yellowLamp = new THREE.MeshBasicMaterial({ color: palette.lampYellow });

/** How fast the glow follows the sprite's frame, per second: quick enough to read as a pulse, slow enough not to flicker. */
const glowRate = 16;

/** An actor for a hover platform. The sprite's two frames, `hover0` and `hover1`, drive the lamps' colour and the glow's swell. */
export function hoverActor(first: SpriteDraw): Actor {
	/* `first` is a pooled record that is refilled every frame: keep what the pad needs from it now. */
	const w = first.w > 0 ? first.w : 2,
		h = first.h > 0 ? first.h : 0.5,
		start = first.name === 'hover1' ? 1 : 0,
		pad = padGeometry(w, h),
		group = new THREE.Group(),
		body = new THREE.Mesh(pad.body, propMaterial),
		lamps = new THREE.Mesh(pad.lamps, redLamp),
		nozzles = new THREE.Mesh(pad.nozzles, unlitMaterial),
		halos: THREE.Mesh[] = [];
	body.castShadow = true;
	body.receiveShadow = true;
	nozzles.castShadow = false;
	group.add(body, lamps, nozzles);
	for (const x of pad.nozzleX) {
		const halo = new THREE.Mesh(glowGeometry(), haloMaterial(palette.glow, 0.7));
		halo.position.set(x, pad.foot - 0.08, 0.1);
		halo.renderOrder = -1;
		halos.push(halo);
		group.add(halo);
	}
	const wide = new THREE.Mesh(glowGeometry(), haloMaterial(palette.glow, 0.32));
	wide.position.set(0, pad.foot - 0.22, 0.05);
	wide.renderOrder = -1;
	group.add(wide);
	let swell = start;
	const place = (): void => {
		const s = 0.5 + 0.22 * swell;
		for (const halo of halos) halo.scale.set(s, s, 1);
		wide.scale.set(w * (1.05 + 0.1 * swell), 0.5 + 0.12 * swell, 1);
	};
	place();
	lamps.material = start ? yellowLamp : redLamp;
	return {
		object: group,
		update(draw, frame) {
			const second = draw.name === 'hover1';
			lamps.material = second ? yellowLamp : redLamp;
			swell = ease(swell, second ? 1 : 0, glowRate, frame.dt);
			place();
			group.position.set(draw.x, draw.y, 0);
		},
	};
}
