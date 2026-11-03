// Derives deterministic secondary motion for Ben's shirt (hem flare and sleeve ride) from body velocity and airflow.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/**
 * Optional cloth parts a rig opts into with `clothing` in its JSON. All values are in source pixels and rig cycles, so a
 * whole loop samples the same way every time; there is no randomness.
 */
export interface ClothingSettings {
  /** Constant world velocity in pixels per cycle that the in-place rig stands for (a fall moves down: `[0, 40]`). */
  airflow?: readonly number[];
  /** How far behind the body the cloth responds, in cycles: the follow-through lag. */
  lag: number;
  hem?: {
    /** Torso-patch row of the shirt hem, directly above the belt. */
    row: number;
    /** Speed in pixels per cycle at which the hem flares by its one pixel. */
    threshold: number;
    /** Flutter waves per cycle while the hem is lifted; a whole number keeps a loop seamless. */
    flutter: number;
  };
  sleeves?: {
    /** Pixels the cuff may ride up or down the upper arm. */
    slide: number;
    /** Upper-arm swing speed, in degrees per cycle, at which the cuff lags by its full slide. */
    threshold: number;
  };
}

/** The cloth state for one pose: one-pixel hem flares at the back and front, and each cuff's slide along its upper arm. */
export interface ClothPose { hemBack: boolean; hemFront: boolean; nearSleeve: number; farSleeve: number; }

/**
 * Relative wind from the body's lagged velocity plus the rig's airflow decides the hem: moving forwards or backwards drags
 * the hem out behind the motion; falling or rising lifts it so it flares, with a whole-number flutter alternating back and
 * front. Sleeves lag the upper arm's swing and ride up their arm when lifted by the same flutter.
 */
export function clothPose(settings: ClothingSettings, t: number, velocity: readonly [number, number], armSwing: readonly [number, number]): ClothPose {
  const flow: [number, number] = [velocity[0] + (settings.airflow?.[0] ?? 0), velocity[1] + (settings.airflow?.[1] ?? 0)];
  let hemBack = false, hemFront = false, wave = 0;
  if (settings.hem) {
    const { threshold, flutter } = settings.hem;
    // Forward motion (positive x for a right-facing rig) drags the hem out behind; backward motion drags it in front.
    if (flow[0] >= threshold) hemBack = true;
    if (flow[0] <= -threshold) hemFront = true;
    if (Math.abs(flow[1]) >= threshold) {
      wave = Math.sin(2 * Math.PI * flutter * t);
      if (wave >= -.5) hemBack = true;
      if (wave <= .5) hemFront = true;
    }
  }
  const sleeve = (swing: number, side: 1 | -1): number => {
    if (!settings.sleeves) return 0;
    const { slide, threshold } = settings.sleeves;
    // A fast swing leaves the cuff behind the arm; airflow lifts the cuffs in turn with the hem flutter.
    const lagged = Math.max(-1, Math.min(1, swing / threshold)), lifted = wave * side > .5 ? -1 : 0;
    return Math.max(-slide, Math.min(slide, Math.round(-lagged * slide) + lifted));
  };
  return { hemBack, hemFront, nearSleeve: sleeve(armSwing[0], 1), farSleeve: sleeve(armSwing[1], -1) };
}
