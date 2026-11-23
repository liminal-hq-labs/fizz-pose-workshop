// The chocolate river: one shared material that flows and glosses from a time uniform, and the meshes of its tiles and of the sea beyond the map.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { toonRamp } from '../ben-g/shared.ts';
import { waterZ } from './terrain.ts';

/** The clock the river's shader reads; the set writes it once a frame. */
export const riverTime = { value: 0 };

/**
 * Molten chocolate seen from above: a dark body with slow warm bands that drift, a swell that moves the surface a little,
 * and long glossy streaks that catch the light. It reads world X and Y, so tiles side by side flow as one river.
 */
export const riverMaterial = new THREE.MeshToonMaterial({
	vertexColors: true,
	gradientMap: toonRamp,
	emissive: 0x040100,
});
riverMaterial.onBeforeCompile = (shader) => {
	shader.uniforms.uTime = riverTime;
	const header = '\nuniform float uTime;\nvarying vec2 vWorld;\nvarying float vSwell;\n';
	shader.vertexShader = shader.vertexShader
		.replace('#include <common>', '#include <common>' + header)
		.replace(
			'#include <begin_vertex>',
			`vec3 transformed = vec3(position);
vec4 riverWorld = modelMatrix * vec4(position, 1.0);
vWorld = riverWorld.xy;
float swell = sin(riverWorld.x * 1.3 + uTime * 0.8) * 0.5 + sin(riverWorld.y * 1.9 - uTime * 0.6 + riverWorld.x * 0.5) * 0.5;
vSwell = swell;
transformed.z += swell * 0.025;`,
		);
	shader.fragmentShader = shader.fragmentShader
		.replace('#include <common>', '#include <common>' + header)
		.replace(
			'#include <color_fragment>',
			`#include <color_fragment>
float flowA = sin(vWorld.x * 0.55 + sin(vWorld.y * 0.9 + uTime * 0.3) * 1.2 - uTime * 0.3);
float flowB = sin(vWorld.y * 1.3 - vWorld.x * 0.8 + sin(vWorld.x * 0.5 + uTime * 0.2) * 1.6 - uTime * 0.22);
float lightBand = smoothstep(0.2, 0.95, flowA * 0.5 + flowB * 0.5);
vec3 body = mix(vec3(0.075, 0.03, 0.012), vec3(0.17, 0.072, 0.028), lightBand);
diffuseColor.rgb *= body;`,
		)
		.replace(
			'#include <emissivemap_fragment>',
			`#include <emissivemap_fragment>
float sheenA = pow(max(0.0, sin(vWorld.x * 1.3 + vWorld.y * 0.7 - uTime * 0.45 + sin(vWorld.y * 1.8 + uTime * 0.5) * 0.9)), 28.0);
float sheenB = pow(max(0.0, sin(vWorld.x * 0.7 - vWorld.y * 1.5 + uTime * 0.3 + sin(vWorld.x * 1.4 - uTime * 0.35) * 1.1)), 36.0);
vec3 gloss = vec3(1.0, 0.72, 0.46) * (sheenA * 0.34 + sheenB * 0.3) * (0.6 + 0.4 * vSwell);
totalEmissiveRadiance += gloss + vec3(0.02, 0.006, 0.0015) * lightBand;`,
		);
};
riverMaterial.customProgramCacheKey = () => 'overworld-river-3';

/** How many cells a river tile is cut into along each side, so the swell has vertices to move. */
const cells = 2;

/** Appends one river tile, tinted, to the arrays of a mesh. */
export function addRiverTile(
	out: { positions: number[]; colours: number[]; indices: number[] },
	x: number,
	y: number,
	tint: THREE.Color,
): void {
	const base = out.positions.length / 3;
	for (let j = 0; j <= cells; j++)
		for (let i = 0; i <= cells; i++) {
			out.positions.push(x + i / cells, y + j / cells, waterZ);
			out.colours.push(tint.r, tint.g, tint.b);
		}
	const row = cells + 1;
	for (let j = 0; j < cells; j++)
		for (let i = 0; i < cells; i++) {
			const a = base + j * row + i,
				b = a + 1,
				c = a + row + 1,
				d = a + row;
			out.indices.push(a, b, c, a, c, d);
		}
}

/** The geometry of a set of river tiles, built from the arrays `addRiverTile` filled. */
export function riverGeometry(out: {
	positions: number[];
	colours: number[];
	indices: number[];
}): THREE.BufferGeometry {
	const geometry = new THREE.BufferGeometry(),
		count = out.positions.length / 3,
		normals = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) normals[i * 3 + 2] = 1;
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.positions, 3));
	geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(out.colours, 3));
	geometry.setIndex(out.indices);
	geometry.computeBoundingSphere();
	return geometry;
}

/** The sea of chocolate round the map, in four slabs, so the rivers at the edge carry on to the horizon. */
export function seaMesh(
	bounds: { x0: number; y0: number; x1: number; y1: number },
	reach: number,
): THREE.Mesh {
	const out = { positions: [] as number[], colours: [] as number[], indices: [] as number[] },
		white = new THREE.Color(0xffffff),
		slabs = [
			[bounds.x0 - reach, bounds.y0 - reach, bounds.x1 + reach, bounds.y0],
			[bounds.x0 - reach, bounds.y1, bounds.x1 + reach, bounds.y1 + reach],
			[bounds.x0 - reach, bounds.y0, bounds.x0, bounds.y1],
			[bounds.x1, bounds.y0, bounds.x1 + reach, bounds.y1],
		];
	for (const [x0, y0, x1, y1] of slabs) {
		const base = out.positions.length / 3;
		for (const [x, y] of [
			[x0, y0],
			[x1, y0],
			[x1, y1],
			[x0, y1],
		]) {
			out.positions.push(x, y, waterZ);
			out.colours.push(white.r, white.g, white.b);
		}
		out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
	}
	const mesh = new THREE.Mesh(riverGeometry(out), riverMaterial);
	mesh.name = 'overworld sea';
	mesh.receiveShadow = false;
	mesh.castShadow = false;
	mesh.frustumCulled = false;
	return mesh;
}
