// Exports the cartoon Ben prototype as a rigged glTF binary with one named animation clip per pose.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { installThreeToolRuntime } from "./three-runtime.ts";

/** One exported clip: a pose of `prototypes/ben-g/tuning-bench.html` sampled over `duration` seconds. */
export interface BenGClip {
  readonly name: string;
  readonly pose: string;
  readonly duration: number;
}
/** Loop lengths match each pose's own period, so every looping clip closes on its first frame. */
export const benGClips: readonly BenGClip[] = [
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
export const benGFramesPerSecond = 24;

interface DumpMesh {
  geo: number; color: number; vertexColors: boolean; opacity: number; unlit: boolean; double: boolean; skinned: boolean; outline: boolean;
  skin?: { bones: number[]; inverses: number[][]; bind: number[] };
}
interface DumpNode { parent: number; name: string; bone: boolean; p: number[]; q: number[]; s: number[]; mesh?: DumpMesh }
interface DumpGeometry { position: string; normal: string | null; color?: string; index?: string; skinIndex?: string; skinWeight?: string }
interface DumpClip { name: string; duration: number; frames: number; tracks: { node: number; kind: "p" | "q" | "s"; values: string }[] }
interface Dump { scale: number; nodes: DumpNode[]; geometries: DumpGeometry[]; clips: DumpClip[] }

const floats = (text: string): Float32Array => { const b = Buffer.from(text, "base64"); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice(); };
const uint16 = (text: string): Uint16Array => { const b = Buffer.from(text, "base64"); return new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2).slice(); };
const uint32 = (text: string): Uint32Array => { const b = Buffer.from(text, "base64"); return new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice(); };

/** Opens the prototype with its vents cut into a dense shell mesh (the live page uses an alpha texture) and returns its dump. */
async function dumpPrototype(): Promise<Dump> {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(pathToFileURL(new URL("../prototypes/ben-g/tuning-bench.html", import.meta.url).pathname).href);
    await page.waitForFunction(() => "__rig" in window);
    const dump = (await page.evaluate(
      ({ clips, fps }) => {
        const rig = (window as unknown as { __rig: { OPT: Record<string, unknown>; rebuild: () => void; dumpModel: (clips: unknown, fps: number) => unknown } }).__rig;
        rig.OPT.vents = "mesh";
        rig.rebuild();
        return rig.dumpModel(clips, fps);
      },
      { clips: [...benGClips], fps: benGFramesPerSecond },
    )) as Dump;
    if (errors.length) throw new Error("Browser errors: " + errors.join("; "));
    return dump;
  } finally {
    await browser.close();
  }
}

/** Rebuilds the dumped node tree as a Three.js scene with skinned meshes and keyframe clips. */
export function sceneFromDump(dump: Dump): { root: THREE.Object3D; clips: THREE.AnimationClip[] } {
  const geometries = dump.geometries.map((g) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(floats(g.position), 3));
    if (g.normal) geometry.setAttribute("normal", new THREE.BufferAttribute(floats(g.normal), 3));
    if (g.color) geometry.setAttribute("color", new THREE.BufferAttribute(floats(g.color), 3));
    if (g.index) geometry.setIndex(new THREE.BufferAttribute(uint32(g.index), 1));
    if (g.skinIndex && g.skinWeight) {
      geometry.setAttribute("skinIndex", new THREE.BufferAttribute(uint16(g.skinIndex), 4));
      geometry.setAttribute("skinWeight", new THREE.BufferAttribute(floats(g.skinWeight), 4));
    }
    return geometry;
  });
  const materials = new Map<string, THREE.Material>();
  const material = (m: DumpMesh): THREE.Material => {
    const key = [m.color, m.vertexColors, m.opacity, m.unlit, m.double].join("/");
    let made = materials.get(key);
    if (!made) {
      const common = { color: m.vertexColors ? 0xffffff : m.color, vertexColors: m.vertexColors, transparent: m.opacity < 1, opacity: m.opacity, side: m.double ? THREE.DoubleSide : THREE.FrontSide };
      made = m.unlit ? new THREE.MeshBasicMaterial(common) : new THREE.MeshStandardMaterial({ ...common, roughness: 0.85, metalness: 0 });
      materials.set(key, made);
    }
    return made;
  };
  const names = dump.nodes.map((node, i) => `n${i}_${node.name.replace(/[^A-Za-z0-9_-]/g, "_")}`);
  const objects = dump.nodes.map((node, i): THREE.Object3D => {
    const object = node.bone ? new THREE.Bone() : node.mesh
      ? node.mesh.skinned ? new THREE.SkinnedMesh(geometries[node.mesh.geo], material(node.mesh)) : new THREE.Mesh(geometries[node.mesh.geo], material(node.mesh))
      : new THREE.Group();
    object.name = names[i];
    // Viewers that draw an ink line read this to know which parts carry one.
    if (node.mesh?.outline) object.userData.outline = true;
    object.position.fromArray(node.p);
    object.quaternion.fromArray(node.q);
    object.scale.fromArray(node.s);
    return object;
  });
  dump.nodes.forEach((node, i) => { if (node.parent >= 0) objects[node.parent].add(objects[i]); });
  const root = new THREE.Group();
  root.name = "BenG";
  root.scale.setScalar(dump.scale);
  root.add(objects[0]);
  root.updateMatrixWorld(true);
  dump.nodes.forEach((node, i) => {
    const skin = node.mesh?.skin;
    if (!skin) return;
    const skeleton = new THREE.Skeleton(skin.bones.map((id) => objects[id] as THREE.Bone), skin.inverses.map((m) => new THREE.Matrix4().fromArray(m)));
    (objects[i] as THREE.SkinnedMesh).bind(skeleton, new THREE.Matrix4().fromArray(skin.bind));
  });
  const clips = dump.clips.map((clip) => {
    const times = Float32Array.from({ length: clip.frames }, (_, i) => (clip.duration * i) / (clip.frames - 1));
    const tracks = clip.tracks.map((track) => {
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

if (import.meta.main) {
  installThreeToolRuntime();
  const output = new URL("../models/ben-g/", import.meta.url);
  await mkdir(output, { recursive: true });
  const dump = await dumpPrototype(), { root, clips } = sceneFromDump(dump);
  root.animations = clips;
  const glb = await new GLTFExporter().parseAsync(root, { binary: true, animations: clips });
  if (!(glb instanceof ArrayBuffer)) throw new Error("Expected a binary glTF export.");
  await writeFile(new URL("ben-g.glb", output), new Uint8Array(glb));
  const bones = dump.nodes.filter((node) => node.bone).map((node) => node.name);
  await writeFile(
    new URL("ben-g.json", output),
    JSON.stringify({
      name: "Ben Blaze · cartoon model (variation G)",
      source: "prototypes/ben-g/tuning-bench.html",
      units: "metres; one sprite pixel is " + dump.scale + " m",
      framesPerSecond: benGFramesPerSecond,
      bones,
      nodes: dump.nodes.length,
      animations: clips.map((clip) => ({ name: clip.name, duration: Number(clip.duration.toFixed(3)), tracks: clip.tracks.length })),
    }, null, 2) + "\n",
  );
  console.log(`Saved models/ben-g/ben-g.glb: ${(glb.byteLength / 1048576).toFixed(1)} MB, ${dump.nodes.length} nodes, ${bones.length} bones, ${clips.length} clips.`);
}
