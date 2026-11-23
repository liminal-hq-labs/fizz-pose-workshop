// Shared materials for the crater terrain: vertex-coloured toon shading, with a depth fade for rock and a flowing shader for chocolate.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import { toonRamp } from '../ben-g/shared.ts';

function vertexToon(emissive = 0): THREE.MeshToonMaterial {
	return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp, emissive });
}

/** Rock, crust and blocks: darkens with depth below the surface so pits and the lower ground sink into shadow. */
export const groundMaterial = vertexToon();
groundMaterial.onBeforeCompile = (shader) => {
	shader.vertexShader = shader.vertexShader
		.replace('#include <common>', '#include <common>\nvarying float vGroundY;')
		.replace(
			'#include <begin_vertex>',
			'#include <begin_vertex>\nvGroundY = (modelMatrix * vec4(position, 1.0)).y;',
		);
	shader.fragmentShader = shader.fragmentShader
		.replace('#include <common>', '#include <common>\nvarying float vGroundY;')
		.replace(
			'#include <color_fragment>',
			'#include <color_fragment>\ndiffuseColor.rgb *= mix(0.5, 1.0, clamp((vGroundY + 0.5) / 7.0, 0.0, 1.0));',
		);
};
groundMaterial.customProgramCacheKey = () => 'crater-ground';

/** Plain vertex-coloured toon shading for props: spikes, doors, crystals, ledges. */
export const propMaterial = vertexToon();

/** Props that glow a little, like the crystals. */
export const glowMaterial = vertexToon(0x3a1048);

/** Unlit vertex colours, for lettering and lamps. */
export const unlitMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

/** Backdrop bodies far beyond the haze, such as the planet and moons, which keep their colour at any distance. */
export const skyBodyMaterial = vertexToon();
skyBodyMaterial.fog = false;

/** The clock the chocolate shader reads; set it once a frame. */
export const chocolateTime = { value: 0 };

/**
 * A bubble in each of some cells of a one tile grid on the pool: it swells over a few seconds, then pops as a ring that
 * spreads and fades. Returns the bubble's lift, its rim, the popping ring and a glint. Both shaders use it, so the
 * surface rises where the bubble is painted.
 */
const bubbleFunction = `
vec4 chocBubble(vec2 p, float time) {
	vec2 cell = floor(p);
	vec2 f = fract(p);
	float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
	if (h < 0.72) return vec4(0.0);
	float period = 3.5 + fract(h * 91.7) * 3.0;
	float t = fract(time / period + h * 7.0);
	vec2 c = vec2(0.34 + 0.32 * fract(h * 13.7), 0.34 + 0.32 * fract(h * 5.3));
	float d = length(f - c);
	float r = 0.3 * (0.12 + 0.88 * smoothstep(0.0, 0.8, t));
	float popping = step(0.8, t);
	float pt = clamp((t - 0.8) / 0.2, 0.0, 1.0);
	float dome = (1.0 - popping) * step(d, r);
	float lift = dome * sqrt(max(0.0, 1.0 - (d * d) / (r * r))) * r;
	float rim = dome * smoothstep(r * 0.72, r, d);
	float ring = popping * (1.0 - pt) * (1.0 - smoothstep(0.0, 0.04, abs(d - (0.3 + pt * 0.2))));
	float glint = dome * smoothstep(0.4 * r, 0.0, length(f - c - vec2(-0.4, -0.4) * r));
	return vec4(lift, rim, ring, glint);
}
`;

/**
 * Molten chocolate: a dark, glossy, slowly flowing surface with warm light under it and a few bubbles that swell and pop.
 * The top vertices (those whose `aLocal` height is above 0.4) ride a slow swell driven by world position, so tiles side by
 * side stay joined and merged tiles behave like single ones. Slow diagonal bands drift down the body. It reads
 * `chocolateTime`.
 */
export const chocolateMaterial = vertexToon(0x0c0502);
chocolateMaterial.onBeforeCompile = (shader) => {
	shader.uniforms.uTime = chocolateTime;
	const declarations =
		'\nuniform float uTime;\nvarying vec3 vWorld;\nvarying float vTop;\nvarying float vWave;' +
		bubbleFunction;
	shader.vertexShader = shader.vertexShader
		.replace('#include <common>', '#include <common>\nattribute vec3 aLocal;' + declarations)
		.replace(
			'#include <begin_vertex>',
			`vec3 transformed = vec3(position);
vec4 chocWorld = modelMatrix * vec4(position, 1.0);
vWorld = chocWorld.xyz;
vTop = step(0.4, aLocal.y);
float wave = sin(chocWorld.x * 1.7 + uTime * 0.9) * 0.5 + sin(chocWorld.z * 2.3 - uTime * 0.7 + chocWorld.x * 0.6) * 0.5;
vWave = wave;
vec4 bub = chocBubble(chocWorld.xz, uTime);
transformed.y += vTop * (wave * 0.03 - 0.11 + bub.x * 0.7);`,
		);
	shader.fragmentShader = shader.fragmentShader
		.replace('#include <common>', '#include <common>' + declarations)
		.replace(
			'#include <color_fragment>',
			`#include <color_fragment>
float onTop = step(0.999, vTop);
float flowA = sin(vWorld.x * 1.3 + sin(vWorld.z * 1.9 + uTime * 0.35) * 1.3 - uTime * 0.3);
float flowB = sin(vWorld.x * 3.1 - vWorld.z * 1.7 + sin(vWorld.x * 0.7 + uTime * 0.2) * 2.0 - uTime * 0.22);
float lightBand = smoothstep(0.25, 0.95, flowA * 0.5 + flowB * 0.5);
vec4 bubble = chocBubble(vWorld.xz, uTime);
float streak = fract((vWorld.x - vWorld.y) * 1.6 - uTime * 0.05);
float band = smoothstep(0.5, 0.6, streak) - smoothstep(0.72, 0.84, streak);
vec3 body = mix(vec3(0.012, 0.004, 0.0015), vec3(0.03, 0.01, 0.004), band);
vec3 skin = mix(vec3(0.02, 0.008, 0.003), vec3(0.05, 0.02, 0.008), lightBand);
skin = mix(skin, vec3(0.07, 0.03, 0.012), bubble.y * 0.8);
diffuseColor.rgb = mix(body, skin, onTop);`,
		)
		.replace(
			'#include <emissivemap_fragment>',
			`#include <emissivemap_fragment>
float sheenA = pow(max(0.0, sin(vWorld.x * 2.4 + vWorld.z * 1.1 - uTime * 0.4 + sin(vWorld.z * 3.3 + uTime * 0.5) * 0.9)), 18.0);
float sheenB = pow(max(0.0, sin(vWorld.x * 1.1 - vWorld.z * 2.6 + uTime * 0.25 + sin(vWorld.x * 2.1 - uTime * 0.3) * 1.1)), 24.0);
vec3 gloss = vec3(1.0, 0.66, 0.4) * (sheenA * 0.7 + sheenB * 0.5) * (0.5 + 0.5 * vWave);
float vein = pow(1.0 - abs(flowB), 14.0) * (0.4 + 0.6 * lightBand);
vec3 heat = (vec3(0.05, 0.013, 0.003) * (0.4 + 0.6 * lightBand) + vec3(0.55, 0.16, 0.03) * vein * 0.5) * onTop;
vec3 bubbleLight = vec3(0.9, 0.6, 0.38) * (bubble.w * 0.8 + bubble.z * 0.6);
totalEmissiveRadiance += onTop * gloss + heat + bubbleLight + vec3(0.012, 0.003, 0.0) * (1.0 - onTop);`,
		);
};
chocolateMaterial.customProgramCacheKey = () => 'crater-chocolate-3';
