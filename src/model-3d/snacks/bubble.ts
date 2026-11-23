// The fizz bubble: a glossy, wobbling cream soda bubble with a bright rim, a blue core and a short trail of tiny bubbles.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { collectibleScale } from '../cast-scale.ts';
import { candy, clamp, ease, ellipsoid, phaseOf } from './shared.ts';

/** The sprite is 8 pixels, half a tile, and the bubble's art is 6 pixels of it; the model quivers a little past that. */
const spriteWidth = 0.5,
	radius = 0.17,
	trailLength = 4;

let shellMaterial: THREE.ShaderMaterial | null = null;
const trailMaterials: THREE.MeshBasicMaterial[] = [];
let coreMaterial: THREE.MeshBasicMaterial | null = null,
	shineMaterial: THREE.MeshBasicMaterial | null = null;

/** A see-through shell that is clear in the middle and bright at its rim, like the film of a real bubble. */
function shell(): THREE.ShaderMaterial {
	shellMaterial ??= new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		vertexShader: `
			varying vec3 vNormal;
			varying vec3 vView;
			void main() {
				vec4 view = modelViewMatrix * vec4(position, 1.0);
				vNormal = normalize(normalMatrix * normal);
				vView = normalize(-view.xyz);
				gl_Position = projectionMatrix * view;
			}`,
		fragmentShader: `
			varying vec3 vNormal;
			varying vec3 vView;
			void main() {
				float edge = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
				float rim = pow(edge, 2.2);
				vec3 colour = mix(vec3(0.33, 0.9, 1.0), vec3(0.85, 1.0, 1.0), rim);
				gl_FragColor = vec4(colour, 0.28 + 0.72 * rim);
			}`,
	});
	return shellMaterial;
}

function trail(i: number): THREE.MeshBasicMaterial {
	trailMaterials[i] ??= new THREE.MeshBasicMaterial({
		color: candy.cyan,
		transparent: true,
		opacity: 0.55 - i * 0.12,
		depthWrite: false,
	});
	return trailMaterials[i];
}

export function createBubble(first: SpriteDraw): Actor {
	const seed = phaseOf(first.x, first.y),
		root = new THREE.Group(),
		body = new THREE.Group(),
		wobble = new THREE.Group(),
		trailing: THREE.Mesh[] = [];
	coreMaterial ??= new THREE.MeshBasicMaterial({ color: candy.blue });
	shineMaterial ??= new THREE.MeshBasicMaterial({ color: candy.white });
	const outer = new THREE.Mesh(ellipsoid(radius, radius, radius), shell()),
		core = new THREE.Mesh(ellipsoid(radius * 0.46, radius * 0.46, radius * 0.46), coreMaterial),
		shine = new THREE.Mesh(ellipsoid(radius * 0.3, radius * 0.17, radius * 0.1), shineMaterial),
		dot = new THREE.Mesh(ellipsoid(radius * 0.09, radius * 0.09, radius * 0.07), shineMaterial);
	outer.renderOrder = 2;
	core.position.z = -0.02;
	shine.position.set(-radius * 0.38, radius * 0.45, radius * 0.78);
	shine.rotation.z = 0.7;
	dot.position.set(radius * 0.45, -radius * 0.42, radius * 0.78);
	wobble.add(core, outer, shine, dot);
	body.add(wobble);
	for (let i = 0; i < trailLength; i++) {
		const bit = new THREE.Mesh(ellipsoid(1, 1, 1), trail(i));
		bit.scale.setScalar(radius * (0.7 - i * 0.12));
		trailing.push(bit);
	}
	root.scale.setScalar(collectibleScale);
	root.add(body, ...trailing);

	let ready = false,
		px = first.x,
		py = first.y,
		dirX = 1,
		dirY = 0,
		speed = 0;

	return {
		object: root,
		update(draw, frame) {
			const t = frame.time,
				dt = frame.dt;
			root.position.set(draw.x, draw.y, 0);
			if (!ready) {
				/* A shot starts just in front of Ben, so until it has moved it heads away from him. */
				const dx = draw.x - frame.ben.x,
					dy = draw.y - frame.ben.y;
				if (Math.abs(dy) > Math.abs(dx)) [dirX, dirY] = [0, Math.sign(dy) || 1];
				else [dirX, dirY] = [Math.sign(dx) || 1, 0];
				speed = 16;
				ready = true;
			} else if (dt > 0) {
				const vx = (draw.x - px) / dt,
					vy = (draw.y - py) / dt,
					v = Math.hypot(vx, vy);
				if (v > 0.5) {
					dirX = vx / v;
					dirY = vy / v;
				}
				speed = ease(speed, v, 20, dt);
			}
			px = draw.x;
			py = draw.y;

			/* Round and quivering, a touch long in the direction of flight. */
			const flight = clamp(speed / 16, 0, 1),
				quiver = Math.sin(t * 26 + seed * 5) * 0.07,
				along = 1.05 + flight * 0.2 + quiver,
				across = 1.05 - flight * 0.08 - quiver * 0.8,
				size = draw.w / spriteWidth;
			body.scale.setScalar(size);
			body.rotation.z = Math.atan2(dirY, dirX);
			wobble.scale.set(along, across, across);
			wobble.rotation.z = -body.rotation.z;
			shine.visible = dot.visible = true;
			for (let i = 0; i < trailing.length; i++) {
				const bit = trailing[i],
					back = (0.27 + i * 0.19) * flight * size,
					jitter = Math.sin(t * 19 + i * 2.1 + seed * 3) * 0.04 * flight;
				bit.visible = flight > 0.2;
				bit.position.set(
					-dirX * back - dirY * jitter,
					-dirY * back + dirX * jitter,
					-0.02 * (i + 1),
				);
			}
		},
		dispose: () => root.clear(),
	};
}
