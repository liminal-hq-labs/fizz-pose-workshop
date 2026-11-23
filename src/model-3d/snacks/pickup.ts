// The common frame of a pickup: a model that turns slowly, a soft glow behind it and an occasional twinkle.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from 'three';
import type { Actor, SpriteDraw } from '../../level-3d/types.ts';
import { collectibleScale } from '../cast-scale.ts';
import {
	candy,
	clamp,
	glowGeometry,
	glowMaterial,
	phaseOf,
	sparkleGeometry,
	sparkleMaterial,
} from './shared.ts';

/** What makes one pickup different from another. */
export interface PickupLook {
	/** Adds the solid parts to `body`, which turns about its own vertical axis. The model fills about one tile. */
	build(body: THREE.Group): void;
	/** The colour of the halo behind the pickup. */
	glow: number;
	/** The art's longest side in the model's own units, which sizes the halo so that it hugs the object. */
	size: number;
	/** How far from the centre the twinkles may land, in the model's own units. */
	reach?: number;
	/** The turning rate in radians a second. */
	spin?: number;
	/**
	 * Where the middle of the sprite's art sits above the sprite's centre, in the model's own units (the sprite's tiles divided by
	 * the collectible scale), for art that is not centred in its box.
	 */
	centre?: number;
}

/**
 * The halo is this many times the art's longest side, so it hugs the object whatever its size. At the collectible scale a
 * neighbour in a row, a tile away, is more than a halo's width off, so halos only just touch.
 */
const haloFit = 1.35,
	haloStrength = 0.45,
	twinkleEvery = 2.6,
	twinkleFor = 0.5;
/**
 * The magnet that takes a collected pickup to Ben. Ben's sprite is 1.5 tiles tall and centred on the point the stage reports,
 * so at his two tile scale his chest is about 0.35 tiles above that point. The pickup flies there over `flightFor` seconds,
 * accelerating, then a burst of sparkles plays for the rest of `leaveFor`.
 */
const chestAbove = 0.35,
	chestDepth = 0.6,
	flightFor = 0.18,
	leaveFor = 0.3,
	arrivalSize = 0.04,
	burstSparks = 6;

/**
 * Builds the actor for a pickup. The sim already bobs pickups up and down in the sprite's position, so the model only
 * turns and glows. Each pickup starts at a phase taken from its position, so a row of them ripples instead of marching.
 */
export function createPickup(look: PickupLook, first: SpriteDraw): Actor {
	const phase = phaseOf(first.x, first.y),
		root = new THREE.Group(),
		body = new THREE.Group(),
		halo = new THREE.Mesh(glowGeometry(), glowMaterial(look.glow, haloStrength)),
		twinkle = new THREE.Mesh(sparkleGeometry(), sparkleMaterial(candy.white, true)),
		reach = look.reach ?? 0.5,
		spin = look.spin ?? 1.2,
		haloSize = look.size * haloFit;
	look.build(body);
	body.position.y = look.centre ?? 0;
	let sparks: THREE.Mesh[] = [],
		fromX = 0,
		fromY = 0,
		fromZ = 0;
	halo.position.z = -0.25;
	halo.renderOrder = -1;
	twinkle.position.z = 0.35;
	twinkle.visible = false;
	root.add(halo, body, twinkle);

	return {
		object: root,
		update(draw, frame) {
			const t = frame.time;
			root.position.set(draw.x, draw.y, 0);
			root.scale.setScalar(draw.w * collectibleScale);
			body.rotation.y = t * spin + phase;
			body.rotation.z = Math.sin(t * 1.7 + phase) * 0.07;
			body.rotation.x = Math.sin(t * 1.3 + phase * 2) * 0.05;
			halo.scale.setScalar(haloSize * (1 + Math.sin(t * 2.6 + phase) * 0.08));
			const clock = (t + phase * 0.6) / twinkleEvery,
				cycle = Math.floor(clock),
				local = (clock - cycle) * (twinkleEvery / twinkleFor);
			if (local < 1) {
				const a = phase + cycle * 2.4;
				twinkle.visible = true;
				twinkle.position.x = Math.cos(a) * reach;
				twinkle.position.y = Math.sin(a) * reach * 0.9 + 0.1;
				twinkle.scale.setScalar(0.45 * Math.sin(local * Math.PI));
				twinkle.rotation.z = local * 1.5;
			} else twinkle.visible = false;
		},
		/*
		 * Collected: the pickup flies to Ben's chest, shrinking, and a burst of sparkles plays where it lands. Nothing is
		 * cloned: the shared materials stay as they are and only the scales and positions move.
		 */
		leave() {
			fromX = root.position.x;
			fromY = root.position.y;
			fromZ = root.position.z;
			twinkle.visible = false;
			for (let i = 0; i < burstSparks; i++) {
				const spark = new THREE.Mesh(
					sparkleGeometry(),
					sparkleMaterial(i % 2 ? candy.white : look.glow, true),
				);
				spark.position.z = 0.4;
				spark.visible = false;
				spark.userData.angle = (i / burstSparks) * Math.PI * 2 + phase;
				sparks.push(spark);
				root.add(spark);
			}
			return leaveFor;
		},
		leaving(elapsed, _duration, frame) {
			const flight = clamp(elapsed / flightFor, 0, 1),
				pull = flight * flight,
				ben = frame.ben,
				size = 1 - (1 - arrivalSize) * pull;
			root.position.set(
				fromX + (ben.x - fromX) * pull,
				fromY + (ben.y + chestAbove - fromY) * pull,
				fromZ + (chestDepth - fromZ) * pull,
			);
			body.rotation.y = frame.time * spin * 6 + phase;
			body.scale.setScalar(size);
			halo.scale.setScalar(haloSize * size);
			const landed = flight >= 1,
				burst = clamp((elapsed - flightFor) / (leaveFor - flightFor), 0, 1);
			body.visible = halo.visible = !landed;
			for (let i = 0; i < sparks.length; i++) {
				const spark = sparks[i],
					a: number = spark.userData.angle,
					out = 0.15 + 0.5 * (1 - (1 - burst) * (1 - burst)) * (i % 2 ? 0.8 : 1);
				spark.visible = landed && burst < 1;
				spark.position.x = Math.cos(a) * out;
				spark.position.y = Math.sin(a) * out;
				spark.scale.setScalar((i % 2 ? 0.3 : 0.4) * Math.sin(burst * Math.PI));
				spark.rotation.z = a + burst * 2;
			}
		},
		dispose() {
			sparks = [];
			root.clear();
		},
	};
}
