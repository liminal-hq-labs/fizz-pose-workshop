// Exports the cartoon Ben as rigged glTF binaries, lit and baked-cartoon, with one named animation clip per pose.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { mkdir, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { benGClips, dumpModel } from "../src/model-3d/ben-g/dump.ts";
import { benGSpec, buildRig, type DumpMesh, type ModelDump } from "../src/model-3d/ben-g/model.ts";
import { installThreeToolRuntime } from "./three-runtime.ts";

export const benGFramesPerSecond = 24;
type Dump = ModelDump;

const floats = (text: string): Float32Array => { const b = Buffer.from(text, "base64"); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice(); };
const uint16 = (text: string): Uint16Array => { const b = Buffer.from(text, "base64"); return new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2).slice(); };
const uint32 = (text: string): Uint32Array => { const b = Buffer.from(text, "base64"); return new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice(); };

/**
 * Builds Ben with his vents cut into a dense shell mesh (the live page uses an alpha texture, which a headless build
 * cannot paint) and dumps the model with every clip sampled.
 */
export function dumpBenG(): Dump {
  return dumpModel(buildRig(benGSpec({ vents: "mesh" })), benGClips, benGFramesPerSecond);
}

/** How a scene is dressed for export. */
export type BenGLook = "lit" | "toon";
/** The fixed light the toon look bakes its shadow tone from: above, in front and to Ben's right. */
const toonLight = new THREE.Vector3(-0.4, 0.8, 0.5).normalize();
/** Linear multipliers for the baked shadow tone: darker and slightly cool. */
const toonShadow = [0.56, 0.56, 0.68] as const;
const inkColour = 0x0a0a12;

/**
 * Rebuilds the dumped node tree as a Three.js scene with skinned meshes and keyframe clips.
 *
 * `lit` keeps physically shaded materials and leaves the ink shells out, for engines that apply their own cartoon shader.
 * `toon` bakes the cartoon into the file so it reads the same in any viewer: every surface is unlit, its colour carries a
 * two-step shadow tone lit from `toonLight` in the rest pose, and each inked part gains a black shell with reversed winding
 * that back-face culling turns into an outline.
 */
export function sceneFromDump(dump: Dump, look: BenGLook = "lit"): { root: THREE.Object3D; clips: THREE.AnimationClip[] } {
  const toon = look === "toon";
  const sources = dump.geometries.map((g) => ({
    position: floats(g.position),
    normal: g.normal ? floats(g.normal) : null,
    color: g.color ? floats(g.color) : null,
    index: g.index ? uint32(g.index) : null,
    skinIndex: g.skinIndex ? uint16(g.skinIndex) : null,
    skinWeight: g.skinWeight ? floats(g.skinWeight) : null,
  }));
  type Source = (typeof sources)[number];
  const base = (source: Source, withNormals: boolean): THREE.BufferGeometry => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(source.position, 3));
    if (withNormals && source.normal) geometry.setAttribute("normal", new THREE.BufferAttribute(source.normal, 3));
    if (source.index) geometry.setIndex(new THREE.BufferAttribute(source.index, 1));
    if (source.skinIndex && source.skinWeight) {
      geometry.setAttribute("skinIndex", new THREE.BufferAttribute(source.skinIndex, 4));
      geometry.setAttribute("skinWeight", new THREE.BufferAttribute(source.skinWeight, 4));
    }
    return geometry;
  };
  const litGeometries = new Map<number, THREE.BufferGeometry>(), shellGeometries = new Map<number, THREE.BufferGeometry>();
  const litGeometry = (id: number): THREE.BufferGeometry => {
    let geometry = litGeometries.get(id);
    if (!geometry) {
      geometry = base(sources[id], true);
      if (sources[id].color) geometry.setAttribute("color", new THREE.BufferAttribute(sources[id].color!, 3));
      litGeometries.set(id, geometry);
    }
    return geometry;
  };
  /** The same surface with every triangle turned inside out, so only its far side survives back-face culling. */
  const shellGeometry = (id: number): THREE.BufferGeometry => {
    let geometry = shellGeometries.get(id);
    if (!geometry) {
      const source = sources[id], count = source.position.length / 3,
        index = source.index ? Uint32Array.from(source.index) : Uint32Array.from({ length: count }, (_, i) => i);
      for (let i = 0; i + 2 < index.length; i += 3) { const swap = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = swap; }
      geometry = base({ ...source, index }, false);
      shellGeometries.set(id, geometry);
    }
    return geometry;
  };
  // World rotation of each node in the rest pose, for baking the toon shadow tone.
  const restRotation = dump.nodes.map(() => new THREE.Quaternion());
  dump.nodes.forEach((node, i) => {
    restRotation[i].fromArray(node.q);
    if (node.parent >= 0) restRotation[i].premultiply(restRotation[node.parent]);
  });
  const bakedGeometry = (i: number): THREE.BufferGeometry => {
    const node = dump.nodes[i], mesh = node.mesh!, source = sources[mesh.geo], geometry = base(source, false),
      count = source.position.length / 3, colours = new Uint8Array(count * 3),
      flat = new THREE.Color(mesh.color).toArray(), normal = new THREE.Vector3(),
      scale = node.s.map((value) => (Math.abs(value) > 1e-6 ? value : 1));
    for (let v = 0; v < count; v++) {
      let tone = 1;
      if (source.normal && !mesh.unlit) {
        // A non-uniformly scaled part turns its normals by the inverse scale before the node's rotation.
        normal.set(source.normal[v * 3] / scale[0], source.normal[v * 3 + 1] / scale[1], source.normal[v * 3 + 2] / scale[2]).normalize();
        if (!mesh.skinned) normal.applyQuaternion(restRotation[i]);
        tone = normal.dot(toonLight) < -0.3 ? 0 : 1;
      }
      for (let c = 0; c < 3; c++) {
        const value = (mesh.vertexColors && source.color ? source.color[v * 3 + c] : flat[c]) * (tone ? 1 : toonShadow[c]);
        colours[v * 3 + c] = Math.round(Math.min(1, Math.max(0, value)) * 255);
      }
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3, true));
    return geometry;
  };
  const materials = new Map<string, THREE.Material>();
  const material = (m: DumpMesh): THREE.Material => {
    const key = toon ? ["toon", m.ink, m.opacity, m.double].join("/") : [m.color, m.vertexColors, m.opacity, m.unlit, m.double].join("/");
    let made = materials.get(key);
    if (!made) {
      const side = m.double ? THREE.DoubleSide : THREE.FrontSide, transparent = m.opacity < 1, opacity = m.opacity;
      if (toon) made = m.ink ? new THREE.MeshBasicMaterial({ color: inkColour }) : new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent, opacity, side });
      else {
        const common = { color: m.vertexColors ? 0xffffff : m.color, vertexColors: m.vertexColors, transparent, opacity, side };
        made = m.unlit ? new THREE.MeshBasicMaterial(common) : new THREE.MeshStandardMaterial({ ...common, roughness: 0.85, metalness: 0 });
      }
      made.name = toon ? (m.ink ? "Ink" : transparent ? "ToonGlass" : "Toon") : "";
      materials.set(key, made);
    }
    return made;
  };
  const names = dump.nodes.map((node, i) => `n${i}_${node.name.replace(/[^A-Za-z0-9_-]/g, "_")}`);
  const objects = dump.nodes.map((node, i): THREE.Object3D | null => {
    const mesh = node.mesh;
    if (mesh?.ink && !toon) return null;
    let object: THREE.Object3D;
    if (node.bone) object = new THREE.Bone();
    else if (mesh) {
      const geometry = mesh.ink ? shellGeometry(mesh.geo) : toon ? bakedGeometry(i) : litGeometry(mesh.geo);
      object = mesh.skinned ? new THREE.SkinnedMesh(geometry, material(mesh)) : new THREE.Mesh(geometry, material(mesh));
    } else object = new THREE.Group();
    object.name = names[i];
    // Viewers that draw their own ink line read this to know which parts carry one.
    if (mesh?.outline && !toon) object.userData.outline = true;
    object.position.fromArray(node.p);
    object.quaternion.fromArray(node.q);
    object.scale.fromArray(node.s);
    return object;
  });
  dump.nodes.forEach((node, i) => { const object = objects[i]; if (object && node.parent >= 0) objects[node.parent]!.add(object); });
  const root = new THREE.Group();
  root.name = "BenG";
  root.scale.setScalar(dump.scale);
  root.add(objects[0]!);
  root.updateMatrixWorld(true);
  dump.nodes.forEach((node, i) => {
    const skin = node.mesh?.skin, object = objects[i];
    if (!skin || !object) return;
    const skeleton = new THREE.Skeleton(skin.bones.map((id) => objects[id] as THREE.Bone), skin.inverses.map((m) => new THREE.Matrix4().fromArray(m)));
    (object as THREE.SkinnedMesh).bind(skeleton, new THREE.Matrix4().fromArray(skin.bind));
  });
  const clips = dump.clips.map((clip) => {
    const times = Float32Array.from({ length: clip.frames }, (_, i) => (clip.duration * i) / (clip.frames - 1));
    const tracks = clip.tracks.filter((track) => objects[track.node]).map((track) => {
      const values = floats(track.values), name = names[track.node];
      if (track.kind === "q") {
        // Keep neighbouring keys on the same side of the quaternion sphere so interpolation takes the short way.
        for (let i = 4; i < values.length; i += 4) {
          const dot = values[i] * values[i - 4] + values[i + 1] * values[i - 3] + values[i + 2] * values[i - 2] + values[i + 3] * values[i - 1];
          if (dot < 0) for (let j = 0; j < 4; j++) values[i + j] = -values[i + j];
        }
        return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values);
      }
      if (track.kind === "p") return new THREE.VectorKeyframeTrack(`${name}.position`, times, values);
      // A hidden part has zero scale; stepping keeps props from shrinking in and out between frames.
      const scale = new THREE.VectorKeyframeTrack(`${name}.scale`, times, values);
      scale.setInterpolation(THREE.InterpolateDiscrete);
      return scale;
    });
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  });
  return { root, clips };
}

/** The exported files: the lit model for engines with their own cartoon shader, and the baked cartoon for everything else. */
export const benGFiles: readonly { readonly file: string; readonly look: BenGLook }[] = [
  { file: "ben-g.glb", look: "lit" },
  { file: "ben-g-toon.glb", look: "toon" },
];

if (import.meta.main) {
  installThreeToolRuntime();
  const output = new URL("../models/ben-g/", import.meta.url);
  await mkdir(output, { recursive: true });
  const dump = dumpBenG(), sizes: string[] = [];
  let clipList: THREE.AnimationClip[] = [];
  for (const { file, look } of benGFiles) {
    const { root, clips } = sceneFromDump(dump, look);
    root.animations = clips;
    const glb = await new GLTFExporter().parseAsync(root, { binary: true, animations: clips });
    if (!(glb instanceof ArrayBuffer)) throw new Error("Expected a binary glTF export.");
    await writeFile(new URL(file, output), new Uint8Array(glb));
    sizes.push(`${file} ${(glb.byteLength / 1048576).toFixed(1)} MB`);
    clipList = clips;
  }
  const bones = dump.nodes.filter((node) => node.bone).map((node) => node.name);
  await writeFile(
    new URL("ben-g.json", output),
    JSON.stringify({
      name: "Ben Blaze · cartoon model (variation G)",
      source: "src/model-3d/ben-g/model.ts",
      units: "metres; one sprite pixel is " + dump.scale + " m",
      files: benGFiles,
      framesPerSecond: benGFramesPerSecond,
      bones,
      nodes: dump.nodes.length,
      animations: clipList.map((clip) => ({ name: clip.name, duration: Number(clip.duration.toFixed(3)), tracks: clip.tracks.length })),
    }, null, 2) + "\n",
  );
  console.log(`Saved ${sizes.join(" and ")}: ${bones.length} bones, ${clipList.length} clips.`);
}
