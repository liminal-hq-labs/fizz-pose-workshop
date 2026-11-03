// Builds the per-frame prop-light data (source, intensity and influence mask) saved beside a rig's unlit sprites.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { add, type Vec2 } from '../src/rig/kinematics.ts';
import { lightMask, litVariants, type FrameLight, type LightingData } from '../src/rig/lighting.ts';
import type { RigPose, SideRig } from '../src/rig/run.ts';
import { sampleRig, sampleTime } from '../src/rig/sample.ts';
import { paintRig, type RigSkin } from './rig-skin.ts';

/** Where the light sits for a pose, and how bright: a phone light exists only while the phone is held. */
export function lightSource(rig: SideRig, pose: RigPose): { source: Vec2 | null; intensity: number } {
  const settings = rig.lighting, phone = pose.presentation?.phone;
  if (!settings || !phone) return { source: null, intensity: 0 };
  return { source: add(phone, [settings.offset[0], settings.offset[1]]), intensity: Math.max(0, Math.min(1, pose.presentation?.screen ?? 0)) };
}

/** One frame's light from the same painted sprite (and its body-part layer) that the sprite export uses. */
export function frameLight(rig: SideRig, skin: RigSkin, pose: RigPose, sprite: string): FrameLight {
  const settings = rig.lighting!, painted = paintRig(rig, skin, pose), { source, intensity } = lightSource(rig, pose);
  return { sprite, intensity: Number(intensity.toFixed(3)), source: source ? [Number(source[0].toFixed(3)), Number(source[1].toFixed(3))] : null, mask: lightMask(settings, painted.frame().grid, painted.parts, source) };
}

/** The saved `lighting.json` for every sprite sample of a lit rig. */
export function rigLighting(rig: SideRig, skin: RigSkin): LightingData {
  const settings = rig.lighting;
  if (!settings) throw new Error(`${rig.name} has no lighting setting.`);
  return {
    version: 1, rig: rig.name, note: rig.lightingNote,
    colour: settings.colour, radius: settings.radius, falloff: settings.falloff, levels: settings.levels,
    litVariants: litVariants(settings.levels),
    frames: Array.from({ length: rig.sampleCount }, (_, i) => frameLight(rig, skin, sampleRig(rig, sampleTime(rig, i)), `sprite-${String(i + 1).padStart(2, '0')}.png`)),
  };
}
