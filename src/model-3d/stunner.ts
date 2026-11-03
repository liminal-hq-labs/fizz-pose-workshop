// Builds the ray-gun Fizz Stunner in its own frame and the frames used to holster, hold and aim it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import type palette from "../../source/game-palette.json";

// Gun frame: the barrel points along +z, the grip hangs along −y and +x is the gun's right side.
/** Centre of the grip, where the palm closes around it. */
export const stunnerGrip = new THREE.Vector3(0, -0.85, -0.5);
/** The glowing emitter tip at the front of the barrel. */
export const stunnerTip = new THREE.Vector3(0, 0, 2.55);
/**
 * Holstered orientation: barrel down and slightly back along the right thigh, grip up and back
 * so a hanging right hand closes on it.
 */
export const holsterTurn = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  THREE.MathUtils.degToRad(105),
);
/**
 * The gun's orientation relative to the hand bone: barrel along the fingers, grip across the palm
 * from index finger to little finger.
 */
export const handGrip = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  Math.PI / 2,
);
/** Palm centre in the hand bone's frame (the bone sits at the wrist). */
export const palmCentre = new THREE.Vector3(0, -0.9, 0.05);

export interface StunnerPart {
  name: string;
  geometry: THREE.BufferGeometry;
  colour: keyof typeof palette;
  glow?: boolean;
}
const alongZ = (g: THREE.BufferGeometry, z: number): THREE.BufferGeometry => {
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, z);
  return g;
};
/** Purple and magenta body, grey barrel, coils and emitter dish, dark fins and grip panels, cyan glow. */
export function stunnerParts(): StunnerPart[] {
  const parts: StunnerPart[] = [];
  const part = (
    name: string,
    geometry: THREE.BufferGeometry,
    colour: StunnerPart["colour"],
    glow = false,
  ): void => {
    parts.push({ name, geometry, colour, glow });
  };
  // A rounded body tapering into the barrel, with a charge chamber bulb at the back.
  part(
    "Stunner_purple_body",
    new THREE.LatheGeometry(
      [
        [0, -1.35],
        [0.42, -1.25],
        [0.62, -0.85],
        [0.66, -0.2],
        [0.6, 0.45],
        [0.42, 0.85],
        [0.26, 1.0],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      24,
    ).rotateX(Math.PI / 2),
    "M",
  );
  part(
    "Stunner_charge_bulb",
    new THREE.SphereGeometry(0.48, 20, 14).translate(0, 0.05, -1.35),
    "m",
  );
  // A cyan charge window along the right side and a dark top rail with a sight.
  part(
    "Stunner_charge_window",
    new THREE.CapsuleGeometry(0.12, 0.85, 4, 10)
      .rotateX(Math.PI / 2)
      .translate(0.6, 0.1, -0.2),
    "c",
    true,
  );
  part(
    "Stunner_top_rail",
    new THREE.BoxGeometry(0.22, 0.16, 1.5).translate(0, 0.66, -0.25),
    "D",
  );
  part(
    "Stunner_sight",
    new THREE.BoxGeometry(0.12, 0.2, 0.2).translate(0, 0.82, 0.3),
    "D",
  );
  part(
    "Stunner_barrel",
    alongZ(new THREE.CylinderGeometry(0.22, 0.24, 1.35, 16), 1.6),
    "L",
  );
  for (const [i, z] of [1.15, 1.45, 1.75].entries())
    part(
      "Stunner_coil",
      new THREE.TorusGeometry(0.34 - i * 0.03, 0.065, 8, 20).translate(0, 0, z),
      "L",
    );
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.BoxGeometry(0.06, 0.5, 0.9);
    fin.translate(0, 0.42, 1.55);
    fin.rotateZ((i / 3) * Math.PI * 2);
    part("Stunner_fin", fin, "D");
  }
  // A flared emitter dish with a small glowing tip.
  part(
    "Stunner_emitter_dish",
    new THREE.LatheGeometry(
      [
        [0.22, 2.22],
        [0.36, 2.32],
        [0.52, 2.5],
        [0.5, 2.56],
        [0.3, 2.42],
        [0.16, 2.36],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      24,
    ).rotateX(Math.PI / 2),
    "L",
  );
  part(
    "Stunner_glow_tip",
    new THREE.SphereGeometry(0.15, 12, 8).translate(
      stunnerTip.x,
      stunnerTip.y,
      stunnerTip.z - 0.12,
    ),
    "c",
    true,
  );
  // A raked grip with dark panels and a trigger guard.
  const grip = new THREE.CapsuleGeometry(0.27, 0.95, 4, 12);
  grip.scale(1, 1, 1.25);
  grip.rotateX(-0.28);
  grip.translate(stunnerGrip.x, stunnerGrip.y, stunnerGrip.z);
  part("Stunner_grip", grip, "M");
  for (const sign of [-1, 1]) {
    const panel = new THREE.BoxGeometry(0.06, 0.8, 0.42);
    panel.rotateX(-0.28);
    panel.translate(sign * 0.27, stunnerGrip.y, stunnerGrip.z);
    part("Stunner_grip_panel", panel, "D");
  }
  part(
    "Stunner_trigger_guard",
    new THREE.TorusGeometry(0.24, 0.045, 6, 16, Math.PI)
      .rotateY(Math.PI / 2)
      .rotateX(Math.PI)
      .translate(0, -0.52, 0.12),
    "D",
  );
  return parts;
}
