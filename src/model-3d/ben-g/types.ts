// Types for the cartoon Ben: his measurements, figure, pose frames and export dump.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as T from "three";
import { benGSpec } from "./spec.ts";

/** Every measurement and switch that shapes one build of Ben. Lengths are in sprite pixels. */
export interface Spec {
  id: string;
  hs: number;
  eye: number;
  legU: number;
  legL: number;
  ank: number;
  seg: number[];
  neck: number;
  sw: number;
  shUp: number;
  aU: number;
  aL: number;
  hand: number;
  hipHalf: number;
  tW: number;
  tD: number;
  armR: number;
  legR: number;
  shoeL: number;
  shoeW: number;
  col: Record<string, number>;
  line: number;
  fizz: string;
  stunner: string;
  shoe: string;
  jeans: string;
  cheeks: string;
  vents: string;
  helmet: boolean;
  backpack: boolean;
  wrist: boolean;
}
/** The switches a caller may change; `benGSpec` merges them over the fixed measurements. */
export type Options = Pick<
  Spec,
  | "line"
  | "fizz"
  | "stunner"
  | "shoe"
  | "jeans"
  | "cheeks"
  | "vents"
  | "helmet"
  | "backpack"
  | "wrist"
>;
export interface AddOptions {
  p?: number[];
  r?: number[];
  s?: number[] | number;
  shadow?: boolean;
  pick?: boolean;
  line?: boolean;
  lw?: number;
  lm?: T.Material;
  x?: number;
  z?: number;
}
export interface Ring {
  c: number[];
  rx: number;
  rz: number;
  col?: number;
  colAt?: (j: number) => number;
  w: number[][];
  flip?: boolean;
}
/** The seventeen bones, the toe and crown markers, by name. */
export type Joints = Record<string, T.Object3D>;
/** Parts that poses and faces reach directly. Sides are keyed 1 (his left) and -1 (his right). */
export interface Parts {
  eyes: T.Object3D;
  brows: Record<number, T.Object3D>;
  lids: Record<number, T.Object3D>;
  iris: Record<number, T.Object3D>;
  mouths: Record<string, T.Object3D>;
  fingers: Record<number, T.Object3D[]>;
  thumbs: Record<number, T.Object3D>;
  hd: T.Object3D;
  hairTop: T.Object3D;
  helmet?: T.Object3D;
  gun: T.Object3D;
  holster: T.Object3D;
  spark: T.Object3D;
  gunCan: T.Object3D | null;
  packPogo?: T.Object3D;
  aerial?: T.Object3D;
  aerialTip?: T.Object3D;
}
export interface Props {
  pogo: T.Object3D;
  plunger: T.Object3D;
  spring: T.Object3D;
  ride: T.Object3D;
  shaft: T.Object3D;
  band: T.Object3D;
  bar: T.Object3D;
  ladder: T.Object3D;
  rungs: T.Object3D;
  ledge: T.Object3D;
  phone: T.Object3D;
  glow: T.PointLight;
  freeCan: T.Object3D;
  notes: T.Object3D[];
  bubbles: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>[];
}
export interface HandGoal {
  abs?: number[];
  rel?: number[];
  hint: number[];
  grip?: number;
  wrap?: number;
  fing?: number[];
}
export interface FootGoal {
  abs?: number[];
  rel?: number[];
  hint?: number[];
  pitch?: number;
  yaw?: number;
  roll?: number;
}
/** One frame of a pose: where the pelvis sits, how the spine turns, where the hands and feet reach and which props show. */
export interface PoseOut {
  px: number;
  py: number;
  pz: number;
  prot: number[];
  spine: number[];
  chest: number[];
  neck: number[];
  head: number[];
  hands: Record<number, HandGoal>;
  feet: Record<number, FootGoal>;
  mouth: string;
  lift: number;
  chestScale: number;
  face?: string;
  gun?: boolean;
  flash?: boolean;
  shotId?: number;
  notes?: boolean;
  rootDrop?: number;
  aerial?: number;
  canZ?: number | null;
  fk?: Record<string, number[]>;
  helmetIn?: { hand: number; mode: string; spin?: number };
  pogo?: { tip: number[]; lean: number; c: number; pegH: number; len: number };
  pogoFree?: { top: number[]; scale: number; len: number; lean?: number };
  ladder?: { z: number; off: number };
  ledge?: { y: number };
  phone?: { p: number[] };
  freeCan?: { along?: boolean; drop?: number; at?: number[] };
}
export interface Shot {
  t0: number;
  p: T.Vector3;
  d: T.Vector3;
}
/** A built Ben and the state poses keep on him between frames. */
export interface Fig {
  P: Spec;
  root: T.Group;
  J: Joints;
  X: Parts;
  props: Props;
  pickables: T.Object3D[];
  bones: T.LineSegments;
  bonePairs: string[][];
  marker: T.Mesh;
  jointList: T.Object3D[];
  d: { A: number; Lg: number; standY: number; shOff: number; torso: number };
  loc: (o: T.Object3D) => T.Vector3;
  locQ: (o: T.Object3D) => T.Quaternion;
  turn: T.Object3D;
  lift?: number;
  face?: string | null;
  shots?: Shot[];
  lastShot?: number;
  gunAxis?: T.Vector3;
  canIn?: T.Vector3;
  dropAt?: number[];
  held?: Record<number, T.Object3D> | null;
  exportMode?: boolean;
}
/** A pose sampled into a clip of `duration` seconds. */
export interface ClipSpec {
  readonly name: string;
  readonly pose: string;
  readonly duration: number;
}
export interface DumpMesh {
  geo: number;
  color: number;
  vertexColors: boolean;
  opacity: number;
  unlit: boolean;
  double: boolean;
  skinned: boolean;
  ink: boolean;
  outline: boolean;
  skin?: { bones: number[]; inverses: number[][]; bind: number[] };
}
export interface DumpNode {
  parent: number;
  name: string;
  bone: boolean;
  p: number[];
  q: number[];
  s: number[];
  mesh?: DumpMesh;
}
export interface DumpGeometry {
  position: string;
  normal: string | null;
  color?: string;
  index?: string;
  skinIndex?: string;
  skinWeight?: string;
}
export interface DumpClip {
  name: string;
  duration: number;
  frames: number;
  tracks: { node: number; kind: "p" | "q" | "s"; values: string }[];
}
/** The node tree, geometry, skins and sampled clips of one build, with binary data as base64. */
export interface ModelDump {
  scale: number;
  nodes: DumpNode[];
  geometries: DumpGeometry[];
  clips: DumpClip[];
}
