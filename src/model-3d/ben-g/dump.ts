// Dumps a built cartoon Ben as a node tree, geometry, skins and sampled clips for the glTF build.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as T from "three";
import { applyPose } from "./apply.ts";
import { applyFace, poseFaces, poseGazes } from "./faces.ts";
import { poses } from "./poses.ts";
import { inkMaterial, benGScale } from "./shared.ts";
import type { ClipSpec, DumpGeometry, DumpNode, Fig, ModelDump } from "./types.ts";

/** Every pose as a clip. Loop lengths match each pose's own period, so a looping clip closes on its first frame. */
export const benGClips: readonly ClipSpec[] = [
  { name: "Stand", pose: "stand", duration: 3 },
  { name: "Run", pose: "run", duration: 1 / 1.4 },
  { name: "Pogo", pose: "pogo", duration: 0.8 },
  { name: "Fire", pose: "fire", duration: 1 / 0.9 },
  { name: "Jump", pose: "jump", duration: 1.9 },
  { name: "Fall", pose: "fall", duration: 2 },
  { name: "Climb", pose: "climb", duration: 1.92 },
  { name: "LedgePull", pose: "ledge", duration: 6.5 },
  { name: "Whistle", pose: "whistle", duration: (2 * Math.PI) / 2.6 },
  { name: "Phone", pose: "phone", duration: 3 },
  { name: "Wipeout", pose: "wipeout", duration: 4.8 },
  { name: "WristCheck", pose: "wrist", duration: 3 },
  { name: "HelmetTip", pose: "tip", duration: (2 * Math.PI) / 2.2 },
  { name: "HeadScratch", pose: "scratch", duration: 2 },
  { name: "Rock", pose: "rock", duration: (2 * Math.PI) / 2.1 },
  { name: "HelmetSpin", pose: "spin", duration: 2.1 },
  { name: "WristAerial", pose: "aerial", duration: (2 * Math.PI) / 1.7 },
  { name: "PogoDraw", pose: "draw", duration: 3.8 },
  { name: "Reload", pose: "reload", duration: 4.6 },
];

type Packed = Float32Array | Uint16Array | Uint32Array;
function base64(values: Packed): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
const isMesh = (object: T.Object3D): object is T.Mesh<T.BufferGeometry, T.Material> =>
  (object as T.Mesh).isMesh === true;
const isSkinned = (object: T.Object3D): object is T.SkinnedMesh<T.BufferGeometry, T.Material> =>
  (object as T.SkinnedMesh).isSkinnedMesh === true;
const component = { p: [0, 3], q: [3, 7], s: [7, 10] } as const;

/** Poses `f` for one frame of a clip: body, expression, gaze and blink. */
export function poseForClip(f: Fig, pose: string, time: number): void {
  applyPose(f, poses[pose](time, f), time);
  applyFace(f, f.face || poseFaces[pose], poseGazes[pose]);
  const blink = (time + 2) % 3.7 < 0.12;
  f.X.eyes.scale.y = blink ? 0.12 : 1;
  f.X.eyes.position.y = blink ? 3.55 * 0.88 : 0;
}

/**
 * Walks the figure's node tree and samples each clip at `fps`. The tree must stay fixed for a clip to drive it, so the
 * helmet he carries in some poses is a hidden copy in each hand instead of the worn one moved there. A hidden node is
 * recorded with zero scale, because glTF cannot animate visibility. Tracks are kept only where a clip leaves the rest pose.
 */
export function dumpModel(f: Fig, clips: readonly ClipSpec[], fps: number): ModelDump {
  const nodes: DumpNode[] = [],
    objects: T.Object3D[] = [],
    geometries: DumpGeometry[] = [],
    geometryIds = new Map<string, number>(),
    idOf = new Map<T.Object3D, number>();
  f.exportMode = true;
  f.turn.rotation.y = 0;
  f.shots = [];
  poseForClip(f, "stand", 0);
  if (f.X.helmet) {
    f.held = {};
    for (const side of [1, -1]) {
      const copy = f.X.helmet.clone(true);
      copy.visible = false;
      f.J["hand" + side].add(copy);
      f.held[side] = copy;
    }
  }
  const keep = (object: T.Object3D): boolean => {
    if ((object as T.Light).isLight || (object as T.Line).isLine || object === f.marker)
      return false;
    if (!isMesh(object) || object.userData.ol) return true;
    const material = object.material;
    return material !== inkMaterial && material.visible && material.side !== T.BackSide;
  };
  const walk = (object: T.Object3D, parent: number): void => {
    if (!keep(object)) return;
    const id = nodes.length,
      node: DumpNode = {
        parent,
        name: object.userData.joint ?? (isMesh(object) ? "mesh" : "node") + id,
        bone: (object as T.Bone).isBone === true,
        p: [],
        q: [],
        s: [],
      };
    nodes.push(node);
    objects.push(object);
    idOf.set(object, id);
    if (isMesh(object)) {
      const geometry = object.geometry,
        material = object.material as T.MeshBasicMaterial,
        ink = Boolean(object.userData.ol);
      let geo = geometryIds.get(geometry.uuid);
      if (geo === undefined) {
        geo = geometries.length;
        geometryIds.set(geometry.uuid, geo);
        const a = geometry.attributes,
          entry: DumpGeometry = {
            position: base64(Float32Array.from(a.position.array)),
            normal: a.normal ? base64(Float32Array.from(a.normal.array)) : null,
          };
        if (material.vertexColors && a.color && !ink)
          entry.color = base64(Float32Array.from(a.color.array));
        if (geometry.index) entry.index = base64(Uint32Array.from(geometry.index.array));
        if (a.skinIndex && a.skinWeight) {
          entry.skinIndex = base64(Uint16Array.from(a.skinIndex.array));
          entry.skinWeight = base64(Float32Array.from(a.skinWeight.array));
        }
        geometries.push(entry);
      }
      node.mesh = {
        geo,
        color: material.color ? material.color.getHex() : 0xffffff,
        vertexColors: Boolean(material.vertexColors),
        opacity: material.transparent ? material.opacity : 1,
        unlit: material.isMeshBasicMaterial === true,
        double: material.side === T.DoubleSide,
        skinned: isSkinned(object),
        ink,
        outline: isSkinned(object) || object.children.some((child) => child.userData.ol),
      };
    }
    for (const child of object.children) walk(child, id);
  };
  walk(f.root, -1);
  nodes.forEach((node, i) => {
    const object = objects[i];
    if (node.mesh && isSkinned(object))
      node.mesh.skin = {
        bones: object.skeleton.bones.map((bone) => idOf.get(bone)!),
        inverses: object.skeleton.boneInverses.map((matrix) => [...matrix.elements]),
        bind: [...object.bindMatrix.elements],
      };
  });
  const snapshot = (): number[][] =>
    objects.map((o) => {
      const shown = o.visible ? 1 : 0;
      return [
        o.position.x,
        o.position.y,
        o.position.z,
        o.quaternion.x,
        o.quaternion.y,
        o.quaternion.z,
        o.quaternion.w,
        o.scale.x * shown,
        o.scale.y * shown,
        o.scale.z * shown,
      ];
    });
  poseForClip(f, "stand", 0);
  const rest = snapshot();
  nodes.forEach((node, i) => {
    node.p = rest[i].slice(0, 3);
    node.q = rest[i].slice(3, 7);
    node.s = rest[i].slice(7, 10);
  });
  const sampled = clips.map((clip) => {
    const steps = Math.round(clip.duration * fps),
      frames: number[][][] = [],
      tracks: ModelDump["clips"][number]["tracks"] = [];
    f.shots = [];
    f.lastShot = undefined;
    poseForClip(f, clip.pose, 0);
    for (let i = 0; i <= steps; i++) {
      poseForClip(f, clip.pose, (clip.duration * i) / steps);
      frames.push(snapshot());
    }
    nodes.forEach((_, n) => {
      for (const kind of ["p", "q", "s"] as const) {
        const [from, to] = component[kind],
          width = to - from;
        if (
          !frames.some((frame) =>
            frame[n].slice(from, to).some((value, j) => Math.abs(value - rest[n][from + j]) > 1e-4),
          )
        )
          continue;
        const values = new Float32Array((steps + 1) * width);
        frames.forEach((frame, i) => values.set(frame[n].slice(from, to), i * width));
        tracks.push({ node: n, kind, values: base64(values) });
      }
    });
    return { name: clip.name, duration: clip.duration, frames: steps + 1, tracks };
  });
  f.exportMode = false;
  f.shots = [];
  if (f.held) {
    for (const side of [1, -1]) f.held[side].removeFromParent();
    f.held = null;
  }
  return { scale: benGScale, nodes, geometries, clips: sampled };
}
