// Projects named SVG artwork onto curved model surfaces and binds each layer to its body bone.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import { TessellateModifier } from "three/addons/modifiers/TessellateModifier.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { bindGeometry, type BenRig } from "./rig.ts";
export interface SvgLayer {
  id: string;
  colour: string;
  shapes: THREE.Shape[];
}
export function parseSkinLayers(svg: string): Map<string, SvgLayer> {
  const parsed = new SVGLoader().parse(svg),
    layers = new Map<string, SvgLayer>();
  for (const path of parsed.paths) {
    const node = path.userData?.node;
    const id =
      node && typeof node === "object" && "getAttribute" in node
        ? (node as Element).getAttribute("id")
        : null;
    if (!id) continue;
    layers.set(id, {
      id,
      colour: "#" + path.color.getHexString(),
      shapes: path.toShapes(),
    });
  }
  return layers;
}
export function projectSkinLayer(
  rig: BenRig,
  layer: SvgLayer,
  bone: string,
  surface: (u: number, v: number) => THREE.Vector3,
  material: THREE.Material,
  name: string,
  outward = new THREE.Vector3(0, 0, 1),
): THREE.SkinnedMesh {
  const original = new THREE.ShapeGeometry(layer.shapes, 16),
    geometry = new TessellateModifier(0.25, 10).modify(original),
    positions = geometry.getAttribute("position");
  original.dispose();
  for (let i = 0; i < positions.count; i++) {
    const p = surface(positions.getX(i), positions.getY(i));
    positions.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  const normal = new THREE.Vector3().fromBufferAttribute(
    geometry.getAttribute("normal"),
    0,
  );
  if (normal.dot(outward) < 0) {
    // Projecting SVG's downward Y can reverse winding. Restore outward-facing triangles.
    if (geometry.index) {
      const index = geometry.index;
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, a);
      }
    } else
      for (const attribute of Object.values(geometry.attributes))
        if (attribute instanceof THREE.BufferAttribute)
          for (let i = 0; i < attribute.count; i += 3)
            for (let c = 0; c < attribute.itemSize; c++) {
              const a = attribute.array[(i + 1) * attribute.itemSize + c];
              attribute.array[(i + 1) * attribute.itemSize + c] =
                attribute.array[(i + 2) * attribute.itemSize + c];
              attribute.array[(i + 2) * attribute.itemSize + c] = a;
            }
    geometry.computeVertexNormals();
  }
  return bindGeometry(rig, geometry, bone, material, name);
}
