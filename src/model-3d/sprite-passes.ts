// Renders unlit colour, view-normal and depth passes of the posed model for pixel-sprite conversion.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";

/** The sprite canvas a pass covers, in model units; one unit is one sprite pixel. */
export interface SpriteFrame {
  readonly width: number;
  readonly height: number;
  /** Canvas column whose centre is the model's x = 0. */
  readonly centreX: number;
  /** Canvas row holding the lowest sole pixel; the model's ground plane is its bottom edge. */
  readonly groundY: number;
}
/** Three supersampled passes, stored top row first as base64 RGBA bytes. */
export interface SpritePasses {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  /** Unlit material and vertex colour, linear RGB; alpha is 0 where nothing was drawn. */
  readonly colour: string;
  /** View-space normal encoded as `n * 0.5 + 0.5` in RGB. */
  readonly normal: string;
  /** Orthographic depth in R (255 nearest, 0 farthest) across `depthRange` units. */
  readonly depth: string;
  readonly depthRange: number;
}
/** The model's ground plane, in model units; the soles rest on it. */
export const modelGround = -0.5;
const cameraDistance = 80,
  depthHalfRange = 16;

/** An orthographic camera looking down −z that maps one model unit onto one canvas pixel. */
export function spriteCamera(frame: SpriteFrame): THREE.OrthographicCamera {
  const left = -frame.centreX - 0.5,
    top = modelGround + frame.groundY + 1;
  const camera = new THREE.OrthographicCamera(
    left,
    left + frame.width,
    top,
    top - frame.height,
    cameraDistance - depthHalfRange,
    cameraDistance + depthHalfRange,
  );
  camera.position.set(0, 0, cameraDistance);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

function encode(bytes: Uint8Array, width: number, height: number): string {
  // WebGL reads the bottom row first; the sprite grid starts at the top.
  const flipped = new Uint8Array(bytes.length),
    stride = width * 4;
  for (let y = 0; y < height; y++)
    flipped.set(
      bytes.subarray((height - 1 - y) * stride, (height - y) * stride),
      y * stride,
    );
  let binary = "";
  for (let i = 0; i < flipped.length; i += 0x8000)
    binary += String.fromCharCode(...flipped.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Renders the scene three times through `camera` without lighting, tone mapping or antialiasing,
 * so every colour pixel is an exact material or vertex colour. Callers pose the model first and
 * hide anything that is not part of the character.
 */
export function renderSpritePasses(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  meshes: readonly THREE.Mesh[],
  frame: SpriteFrame,
  scale: number,
): SpritePasses {
  const width = frame.width * scale,
    height = frame.height * scale,
    camera = spriteCamera(frame),
    target = new THREE.WebGLRenderTarget(width, height, { samples: 0 }),
    oldTarget = renderer.getRenderTarget(),
    oldColour = renderer.getClearColor(new THREE.Color()),
    oldAlpha = renderer.getClearAlpha(),
    oldOverride = scene.overrideMaterial,
    oldMaterials = meshes.map((mesh) => mesh.material),
    unlit = new Map<THREE.Material, THREE.MeshBasicMaterial>(),
    flatten = (material: THREE.Material): THREE.MeshBasicMaterial => {
      let basic = unlit.get(material);
      if (!basic) {
        const source = material as THREE.MeshStandardMaterial;
        basic = new THREE.MeshBasicMaterial({
          color: source.color ?? new THREE.Color("#ffffff"),
          vertexColors: source.vertexColors,
          map: source.map ?? null,
          side: THREE.DoubleSide,
          toneMapped: false,
          transparent: false,
        });
        unlit.set(material, basic);
      }
      return basic;
    },
    normal = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }),
    depth = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide }),
    pixels = new Uint8Array(width * height * 4);
  const pass = (): string => {
    renderer.setRenderTarget(target);
    renderer.setClearColor("#000000", 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    return encode(pixels, width, height);
  };
  try {
    meshes.forEach(
      (mesh) =>
        (mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(flatten)
          : flatten(mesh.material)),
    );
    const colour = pass();
    meshes.forEach((mesh, i) => (mesh.material = oldMaterials[i]));
    scene.overrideMaterial = normal;
    const normals = pass();
    scene.overrideMaterial = depth;
    const depths = pass();
    return {
      width,
      height,
      scale,
      colour,
      normal: normals,
      depth: depths,
      depthRange: depthHalfRange * 2,
    };
  } finally {
    meshes.forEach((mesh, i) => (mesh.material = oldMaterials[i]));
    scene.overrideMaterial = oldOverride;
    renderer.setRenderTarget(oldTarget);
    renderer.setClearColor(oldColour, oldAlpha);
    target.dispose();
    normal.dispose();
    depth.dispose();
    unlit.forEach((material) => material.dispose());
  }
}
