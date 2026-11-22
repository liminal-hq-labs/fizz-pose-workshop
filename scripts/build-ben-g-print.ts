// Builds printable models of the cartoon Ben: one solid, four filament colours, and a kit of single-colour pieces.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { applyPose } from '../src/model-3d/ben-g/apply.ts';
import { applyFace } from '../src/model-3d/ben-g/faces.ts';
import { poses } from '../src/model-3d/ben-g/poses.ts';
import { buildRig } from '../src/model-3d/ben-g/rig.ts';
import { inkMaterial } from '../src/model-3d/ben-g/shared.ts';
import { benGSpec } from '../src/model-3d/ben-g/spec.ts';
import type { Fig, PoseOut } from '../src/model-3d/ben-g/types.ts';
import {
	type Body,
	type Grid,
	type Pin,
	type SolidMesh,
	type Soup,
	bodies,
	bounds,
	components,
	dropSpecks,
	drillPins,
	exposedLabels,
	gridFor,
	meshVolume,
	closing,
	occupancy,
	openEdges,
	rasterise,
	spread,
	stl,
	surface,
	threeMf,
} from './print-solid.ts';

/** The four filaments, and the base as a fifth body to print in any of them. */
export const printColours = [
	{ name: 'green', label: 'Helmet green', colour: 0x49d957 },
	{ name: 'red', label: 'Shirt red', colour: 0xd93a32 },
	{ name: 'blue', label: 'Jeans blue', colour: 0x2f45b8 },
	{ name: 'skin', label: 'Skin and white', colour: 0xf6c7a2 },
	{ name: 'base', label: 'Base', colour: 0x8a8f9c },
] as const;
const GREEN = 1,
	RED = 2,
	BLUE = 3,
	SKIN = 4,
	BASE = 5;
/** The kit's piece families: each prints in one filament and splits into its separate pieces. */
const kitFamilies = [
	{ name: 'helmet', colour: GREEN },
	{ name: 'skin', colour: SKIN },
	{ name: 'shirt', colour: RED },
	{ name: 'jeans', colour: BLUE },
	{ name: 'runner', colour: RED },
	{ name: 'base', colour: BASE },
	{ name: 'stunner', colour: RED },
	{ name: 'head', colour: SKIN },
] as const;
/** The alignment pins are offcuts of 1.75 mm filament in 2 mm holes, up to 4 mm into each piece. */
const pin = { hole: 2.0, deepest: 4, shallowest: 1.6, wall: 1.1 };

/** Which of the four filaments stands in for a model colour. Light details share the skin filament; dark ones go blue. */
export function filamentFor(hex: number, brow = false): number {
	const named: Record<number, number> = {
		0x49d957: GREEN,
		0x1c8a38: GREEN,
		0xb98a45: brow ? BLUE : SKIN, // hair shows as relief; the brows need to read on the face
		0x6f8cf0: SKIN, // the jeans' front stripe
		0xff55ff: RED, // the Stunner's fizz
		0xaa00aa: RED,
		0xff9ac4: RED,
		0xd9457f: RED,
		0x8a4a12: BLUE, // badge rims, dark against the shirt
		0xb4b8c4: GREEN, // the helmet's rim and peak stay with the shell
	};
	if (named[hex] !== undefined) return named[hex];
	const r = (hex >> 16) / 255,
		g = ((hex >> 8) & 255) / 255,
		b = (hex & 255) / 255,
		high = Math.max(r, g, b),
		low = Math.min(r, g, b);
	if (high < 0.4) return BLUE;
	if (high - low < 0.25) return SKIN;
	if (r >= g && r >= b) return g > 0.7 ? SKIN : RED;
	if (g >= b) return b > 0.8 ? SKIN : GREEN;
	return g > 0.8 ? SKIN : BLUE;
}

/** A display stance: feet apart, his left fist on his hip, right arm loose beside the holstered Stunner, chin up. */
export function printPose(f: Fig): PoseOut {
	const o = poses.stand(0, f),
		P = f.P;
	o.head = [-0.04, 0.14, 0];
	o.chest = [-0.03, 0.05, 0];
	o.chestScale = 1;
	o.hands[1] = { abs: [P.tW * 0.5 + 0.7, o.py + 1.5, 0.9], hint: [1, 0.2, -0.8], grip: 1 };
	o.hands[-1] = { rel: [-2.3, -f.d.A * 0.96, 0.9], hint: [-0.6, 0, -1], grip: 0.6 };
	o.feet[1] = { abs: [P.hipHalf * 1.7, P.ank, 0.5], yaw: 0.22 };
	o.feet[-1] = { abs: [-P.hipHalf * 1.7, P.ank, -0.2], yaw: 0.22 };
	return o;
}

const isMesh = (
	o: THREE.Object3D,
): o is THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> =>
	(o as THREE.Mesh).isMesh === true;
const isSkinned = (o: THREE.Object3D): o is THREE.SkinnedMesh =>
	(o as THREE.SkinnedMesh).isSkinnedMesh === true;

/** Poses Ben and gathers every visible surface as triangles in print space: millimetres, Z up, feet on Z = 0. */
export function benGPrintSoup(height: number): Soup {
	const f = buildRig(benGSpec({ vents: 'mesh' }));
	f.exportMode = true;
	f.turn.rotation.y = 0;
	f.shots = [];
	applyPose(f, printPose(f), 0);
	applyFace(f, 'smile', [0, 0]);
	f.root.updateMatrixWorld(true);
	const positions: number[] = [],
		colour: number[] = [],
		piece: number[] = [],
		v = new THREE.Vector3(),
		tint = new THREE.Color(),
		C = f.P.col,
		shown = (o: THREE.Object3D | null): boolean => {
			for (; o; o = o.parent) if (!o.visible) return false;
			return true;
		};
	/* Skin above the collar belongs to the head piece; skin below it is an arm. */
	const neckline = f.J.neck.getWorldPosition(new THREE.Vector3()).y - 0.03;
	f.root.traverse((o) => {
		if (!isMesh(o) || !shown(o) || o.userData.ol || o === f.marker) return;
		const material = o.material;
		if (material === inkMaterial || !material.visible || material.side === THREE.BackSide) return;
		let joint = '';
		for (let p: THREE.Object3D | null = o.parent; p && !joint; p = p.parent)
			joint = p.userData.joint ?? '';
		let gear = false;
		for (let p: THREE.Object3D | null = o; p && !gear; p = p.parent)
			gear = p === f.X.gun || p === f.X.holster;
		const g = o.geometry,
			at = g.attributes.position,
			tints = material.vertexColors ? g.attributes.color : null,
			family = (hex: number): number => {
				if (isSkinned(o))
					return hex === C.skin
						? v.y > neckline
							? 8
							: 2
						: hex === C.jeans || hex === C.jeansD || hex === C.stripe
							? 4
							: 3;
				if (joint === 'head') return tints || hex === C.rim ? 1 : 8;
				if (gear) return 7;
				return joint.startsWith('hand') || joint.startsWith('arm')
					? 2
					: joint.startsWith('foot')
						? 5
						: joint === 'pelvis'
							? 4
							: 3;
			},
			corner = (i: number): void => {
				if (isSkinned(o)) o.getVertexPosition(i, v);
				else v.fromBufferAttribute(at, i);
				v.applyMatrix4(o.matrixWorld);
				positions.push(v.x, -v.z, v.y);
				const hex = tints
					? tint.fromBufferAttribute(tints, i).getHex(THREE.SRGBColorSpace)
					: material.color.getHex();
				colour.push(filamentFor(hex, joint === 'head' && g.type === 'BoxGeometry'));
				piece.push(family(hex));
			};
		if (g.index) for (let i = 0; i < g.index.count; i++) corner(g.index.getX(i));
		else for (let i = 0; i < at.count; i++) corner(i);
	});
	let low = Infinity,
		high = -Infinity,
		left = Infinity,
		right = -Infinity,
		front = Infinity,
		back = -Infinity;
	for (let i = 0; i < positions.length; i += 3) {
		low = Math.min(low, positions[i + 2]);
		high = Math.max(high, positions[i + 2]);
	}
	const scale = height / (high - low);
	for (let i = 0; i < positions.length; i += 3) {
		positions[i] *= scale;
		positions[i + 1] *= scale;
		positions[i + 2] = (positions[i + 2] - low) * scale;
		if (positions[i + 2] < height * 0.03) {
			left = Math.min(left, positions[i]);
			right = Math.max(right, positions[i]);
			front = Math.min(front, positions[i + 1]);
			back = Math.max(back, positions[i + 1]);
		}
	}
	/* The base: a chamfered oval under both runners, set a little below the soles so the join between them is flat. */
	const margin = height * 0.045,
		thick = height * 0.022,
		gap = height * 0.004,
		disc = new THREE.CylinderGeometry(
			1 - (0.5 * thick) / ((right - left) / 2 + margin),
			1,
			thick,
			96,
			1,
		)
			.rotateX(Math.PI / 2)
			.scale((right - left) / 2 + margin, (back - front) / 2 + margin, 1)
			.translate((left + right) / 2, (front + back) / 2, -gap - thick / 2)
			.toNonIndexed(),
		d = disc.attributes.position;
	for (let i = 0; i < d.count; i++) {
		positions.push(d.getX(i), d.getY(i), d.getZ(i));
		colour.push(BASE);
		piece.push(6);
	}
	return {
		positions: Float32Array.from(positions),
		colour: Uint8Array.from(colour),
		piece: Uint8Array.from(piece),
	};
}

export interface BenGPrint {
	grid: Grid;
	solid: SolidMesh;
	colours: Body[];
	kit: Body[];
	pins: (Pin & { pieces: [string, string] })[];
}

/**
 * Builds the three print models at `height` millimetres on a grid of `voxel` millimetres.
 *
 * Gaps narrower than about two percent of his height are closed, which fuses the helmet to his head and his arms to his
 * sides where they nearly touch. The colour bodies and the kit pieces are the same solid divided along the boundaries of
 * the nearest coloured surface, so each set fits together exactly.
 */
export function buildBenGPrint(height: number, voxel: number): BenGPrint {
	const soup = benGPrintSoup(height),
		wide = (height * 0.0105) / voxel,
		narrow = (height * 0.0063) / voxel,
		grid = gridFor(soup, voxel, Math.ceil(wide) + 4),
		raster = rasterise(soup, grid),
		families = spread(raster.piece, grid),
		/* Under the helmet the gap to his head is wider than any gap worth closing elsewhere, so it is packed first. */
		packed = closing(raster.shell, grid, wide),
		shell = raster.shell.map((on, at) => (on || (packed[at] > 1.5 && families[at] === 1) ? 1 : 0)),
		occ = occupancy(raster, shell, grid, narrow),
		solid = dropSpecks(surface(occ, grid, 0.5), 200),
		colours = bodies(
			spread(exposedLabels(soup, 'colour', grid, occ), grid),
			printColours.length,
			occ,
			grid,
			60,
		).map((mesh, i) => ({
			name: printColours[i].label,
			colour: printColours[i].colour,
			mesh,
		})),
		minimum = Math.pow(height * 0.045, 3) / Math.pow(voxel, 3),
		pieces = components(
			spread(exposedLabels(soup, 'piece', grid, occ, [1, 8]), grid),
			occ,
			grid,
			minimum,
		),
		drilled = drillPins(
			pieces.labels,
			occ,
			grid,
			pin.hole / 2 / voxel,
			pin.deepest / voxel,
			pin.shallowest / voxel,
			pin.wall / voxel,
		),
		centre = (mesh: SolidMesh): number[] => {
			const b = bounds(mesh);
			return [0, 1, 2].map((a) => (b.min[a] + b.max[a]) / 2);
		},
		kit = bodies(pieces.labels, pieces.from.length - 1, drilled.occ, grid, 60)
			.map((mesh, i) => ({ mesh, family: kitFamilies[pieces.from[i + 1] - 1], at: centre(mesh) }))
			.map((part, _, all) => {
				const twins = all.filter((other) => other.family === part.family),
					side = twins.length > 1 ? (part.at[0] > 0 ? '-left' : '-right') : '',
					name = (part.family.name === 'skin' ? 'arm' : part.family.name) + side;
				return { name, colour: printColours[part.family.colour - 1].colour, mesh: part.mesh };
			}),
		pins = drilled.pins.map((p) => ({
			...p,
			pieces: [kit[p.between[0] - 1].name, kit[p.between[1] - 1].name] as [string, string],
		}));
	return { grid, solid, colours, kit, pins };
}

if (import.meta.main) {
	const option = (name: string, fallback: number): number => {
		const at = process.argv.indexOf('--' + name);
		return at > 0 ? Number(process.argv[at + 1]) : fallback;
	};
	const height = option('height', 120),
		voxel = option('voxel', 0.3),
		outAt = process.argv.indexOf('--out'),
		out = outAt > 0 ? process.argv[outAt + 1] : 'models/ben-g/print',
		separate = process.argv.includes('--stl'),
		started = Date.now(),
		print = buildBenGPrint(height, voxel),
		report = (name: string, mesh: SolidMesh): void => {
			const b = bounds(mesh);
			console.log(
				`${name.padEnd(22)} ${String(mesh.indices.length / 3).padStart(7)} triangles  open edges ${openEdges(mesh)}  ${(meshVolume(mesh) / 1000).toFixed(2)} cm3  ${b.max.map((v, a) => (v - b.min[a]).toFixed(1)).join(' x ')} mm`,
			);
		},
		slug = (i: number): string => printColours[i].name;
	await mkdir(out, { recursive: true });
	report('solid', print.solid);
	await writeFile(`${out}/ben-g-solid.stl`, stl([print.solid], 'Ben, one solid'));
	print.colours.forEach((body, i) => report('colour ' + slug(i), body.mesh));
	await writeFile(`${out}/ben-g-four-colour.3mf`, threeMf(print.colours, 'Ben, four colours'));
	print.kit.forEach((body) => report('kit ' + body.name, body.mesh));
	await writeFile(`${out}/ben-g-kit.3mf`, threeMf(print.kit, 'Ben, kit of pieces'));
	if (separate) {
		await mkdir(`${out}/stl/colours`, { recursive: true });
		await mkdir(`${out}/stl/kit`, { recursive: true });
		for (const [i, body] of print.colours.entries())
			await writeFile(`${out}/stl/colours/ben-g-${slug(i)}.stl`, stl([body.mesh], body.name));
		for (const body of print.kit)
			await writeFile(`${out}/stl/kit/ben-g-${body.name}.stl`, stl([body.mesh], body.name));
	}
	for (const p of print.pins)
		console.log(`pin ${p.pieces.join(' to ')}: ${(p.depth * 2).toFixed(1)} mm long`);
	console.log(
		`grid ${print.grid.nx} x ${print.grid.ny} x ${print.grid.nz} at ${voxel} mm, ${((Date.now() - started) / 1000).toFixed(0)} s`,
	);
}
