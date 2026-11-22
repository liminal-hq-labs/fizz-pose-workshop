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

/** The clock the chocolate shader reads; set it once a frame. */
export const chocolateTime = { value: 0 };

/**
 * Molten chocolate: the surface vertices (local y above 0.4) ride a travelling wave driven by world position, so tiles
 * side by side stay joined, and diagonal red streaks drift across the body. It reads `chocolateTime`.
 */
export const chocolateMaterial = vertexToon(0x2a0c00);
chocolateMaterial.onBeforeCompile = (shader) => {
	shader.uniforms.uTime = chocolateTime;
	const declarations =
		'\nuniform float uTime;\nvarying vec3 vWorld;\nvarying float vTop;\nvarying float vWave;';
	shader.vertexShader = shader.vertexShader
		.replace('#include <common>', '#include <common>' + declarations)
		.replace(
			'#include <begin_vertex>',
			`vec3 transformed = vec3(position);
vec4 chocWorld = modelMatrix * vec4(position, 1.0);
vWorld = chocWorld.xyz;
vTop = step(0.4, position.y);
float wave = sin(chocWorld.x * 2.3 + uTime * 1.5) * 0.5 + sin(chocWorld.z * 3.1 - uTime * 1.1 + chocWorld.x * 0.9) * 0.5;
vWave = wave;
transformed.y += vTop * (wave * 0.035 - 0.05);`,
		);
	shader.fragmentShader = shader.fragmentShader
		.replace('#include <common>', '#include <common>' + declarations)
		.replace(
			'#include <color_fragment>',
			`#include <color_fragment>
float streak = fract((vWorld.x - vWorld.y) * 2.0 - uTime * 0.07);
float band = smoothstep(0.5, 0.58, streak) - smoothstep(0.76, 0.84, streak);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.01, 0.005), band * 0.8 * (1.0 - vTop));
float marble = sin(vWorld.x * 4.0 + sin(vWorld.z * 2.5 + uTime * 0.6) * 1.6) * 0.5 + 0.5;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.03, 0.01), vTop * marble * 0.55);
diffuseColor.rgb += vTop * vec3(0.55, 0.36, 0.1) * smoothstep(0.35, 1.0, vWave * 0.5 + 0.5) * 0.7;`,
		);
};
chocolateMaterial.customProgramCacheKey = () => 'crater-chocolate';
