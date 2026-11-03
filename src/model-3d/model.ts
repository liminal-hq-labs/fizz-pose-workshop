// Constructs a detailed, fully volumetric Ben with skinned limbs and bone-bound surface artwork.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import config from "../../source/ben-3d.json";
import {
  sculptSurface,
  capsuleDistance,
  cavityColours,
  ellipsoid,
  onSurface,
  smoothUnion,
  taperedCapsule,
  weightSurface,
  frontSurface,
  type Field,
  type Influences,
} from "./sculpt.ts";
import {
  cycleHelmet,
  helmetSurfacePoint,
  runningShoe,
  runnerTop,
  runnerProfile,
  shoeScale,
  shoeY,
  toeFlex,
} from "./equipment.ts";
import {
  defaultHeadStyle,
  facePoint,
  hairCap,
  headStyle,
  type HeadStyle,
} from "./head.ts";
import palette from "../../source/game-palette.json";
import { holsterTurn, stunnerParts, stunnerTip } from "./stunner.ts";
import { createBenRig, bindGeometry, type BenRig } from "./rig.ts";
import { parseSkinLayers, projectSkinLayer } from "./svg-skin.ts";

export interface BenModel extends BenRig {
  meshes: THREE.SkinnedMesh[];
  phoneMeshes: THREE.SkinnedMesh[];
  /** Rebuilds the head, face, hair and straps in another style; see `headStyles`. */
  setHeadStyle: (id: string) => void;
  headStyle: () => string;
  dispose: () => void;
}
type Colour = keyof typeof palette;
/** Surface finish layered over an EGA base colour; lighting supplies the in-between shades. */
interface Finish {
  readonly roughness?: number;
  readonly metalness?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly sheen?: number;
  readonly sheenRoughness?: number;
  readonly sheenColour?: Colour;
  readonly vertexColours?: boolean;
  readonly flat?: boolean;
  /** Draws just in front of a surface it lies on, so thin layers such as hair never flicker through. */
  readonly inFront?: boolean;
  /** How many layers forward an `inFront` surface draws: a decal on the shirt sits above the shirt. */
  readonly layer?: number;
}
const finishes = {
  toy: { roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 },
  skin: { roughness: 0.52, sheen: 0.2, sheenRoughness: 0.55, sheenColour: "W" },
  cotton: {
    roughness: 0.88,
    sheen: 0.45,
    sheenRoughness: 0.7,
    sheenColour: "r",
  },
  denim: {
    roughness: 0.92,
    sheen: 0.35,
    sheenRoughness: 0.8,
    sheenColour: "b",
  },
  hair: { roughness: 0.58, sheen: 0.6, sheenRoughness: 0.35, sheenColour: "y" },
  shell: { roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 },
  foam: { roughness: 0.95 },
  webbing: {
    roughness: 0.75,
    sheen: 0.3,
    sheenRoughness: 0.6,
    sheenColour: "L",
  },
  eye: { roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.05 },
  lips: { roughness: 0.42 },
  mesh: { roughness: 0.7, sheen: 0.3, sheenRoughness: 0.6, sheenColour: "r" },
  rubber: { roughness: 0.8 },
  leather: { roughness: 0.55 },
  metal: { roughness: 0.32, metalness: 0.65 },
  plastic: { roughness: 0.45, metalness: 0.15 },
} as const satisfies Record<string, Finish>;
const vector = (a: readonly number[]): THREE.Vector3 =>
  new THREE.Vector3(a[0], a[1], a[2]);
export function createBenModel(
  svg: string,
  initialStyle: HeadStyle = defaultHeadStyle,
): BenModel {
  const rig = createBenRig(),
    meshes: THREE.SkinnedMesh[] = [],
    phoneMeshes: THREE.SkinnedMesh[] = [],
    materials = new Map<string, THREE.MeshPhysicalMaterial>(),
    layers = parseSkinLayers(svg);
  const mat = (
    code: Colour,
    finish: Finish = {},
  ): THREE.MeshPhysicalMaterial => {
    const key = code + JSON.stringify(finish);
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshPhysicalMaterial({
        color: palette[code] ?? "#ffffff",
        roughness: finish.roughness ?? 0.75,
        metalness: finish.metalness ?? 0,
        clearcoat: finish.clearcoat ?? 0,
        clearcoatRoughness: finish.clearcoatRoughness ?? 0,
        sheen: finish.sheen ?? 0,
        sheenRoughness: finish.sheenRoughness ?? 1,
        sheenColor: palette[finish.sheenColour ?? "k"] ?? "#000000",
        vertexColors: finish.vertexColours ?? false,
        flatShading: finish.flat ?? false,
        polygonOffset: finish.inFront ?? false,
        polygonOffsetFactor: finish.inFront ? -2 * (finish.layer ?? 1) : 0,
        polygonOffsetUnits: finish.inFront ? -2 * (finish.layer ?? 1) : 0,
        side: THREE.DoubleSide,
      });
      materials.set(key, m);
    }
    return m;
  };
  const skin = mat("W", finishes.skin),
    shadedSkin = mat("W", { ...finishes.skin, vertexColours: true });
  const add = (
    name: string,
    g: THREE.BufferGeometry,
    bone: string,
    m: THREE.Material | THREE.Material[],
    position: THREE.Vector3 = new THREE.Vector3(),
    scale?: THREE.Vector3,
    rotation?: THREE.Euler,
    blend?: { bone: string; weight: (p: THREE.Vector3) => number },
  ): THREE.SkinnedMesh => {
    if (scale) g.scale(scale.x, scale.y, scale.z);
    if (rotation)
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    g.translate(position.x, position.y, position.z);
    const mesh = bindGeometry(rig, g, bone, m, name, blend);
    meshes.push(mesh);
    return mesh;
  };
  const orb = (
    name: string,
    p: readonly number[],
    r: readonly number[],
    bone: string,
    m: THREE.Material,
    rotation?: THREE.Euler,
  ): THREE.SkinnedMesh =>
    add(
      name,
      new THREE.SphereGeometry(1, 24, 16),
      bone,
      m,
      vector(p),
      vector(r),
      rotation,
    );
  const box = (
    name: string,
    p: readonly number[],
    size: readonly number[],
    bone: string,
    m: THREE.Material,
    radius = 0.2,
    rotation?: THREE.Euler,
  ): THREE.SkinnedMesh =>
    add(
      name,
      new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius),
      bone,
      m,
      vector(p),
      undefined,
      rotation,
    );
  const tube = (
    name: string,
    points: THREE.Vector3[],
    r: number,
    bone: string,
    m: THREE.Material,
    closed = false,
  ): THREE.SkinnedMesh =>
    add(
      name,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points, closed),
        Math.max(8, points.length * 4),
        r,
        8,
        closed,
      ),
      bone,
      m,
    );
  const decal = (
    id: string,
    bone: string,
    surface: (u: number, v: number) => THREE.Vector3,
    m: THREE.Material,
    outward?: THREE.Vector3,
  ): void => {
    const layer = layers.get(id);
    if (!layer) throw new Error("Missing skin layer " + id);
    meshes.push(
      projectSkinLayer(
        rig,
        layer,
        bone,
        surface,
        m,
        id + "_" + meshes.length,
        outward,
      ),
    );
  };
  const shade = (
    g: THREE.BufferGeometry,
    field: Field,
    base: (p: THREE.Vector3) => THREE.Color,
    toward: Colour,
    strength?: number,
    reach?: number,
  ): void =>
    cavityColours(
      g,
      field,
      base,
      new THREE.Color(palette[toward] ?? "#000000"),
      strength,
      reach,
    );
  const white = new THREE.Color(palette.W);

  // The green cycling helmet fits the skull with about one unit of shell and foam above the hair.
  add("Helmet_dome", cycleHelmet(), "head", [
    mat("W", { ...finishes.shell, vertexColours: true }),
    // The inside is lined with grey foam padding, so a low view sees a lined helmet rather than a dark hollow.
    mat("L", { ...finishes.foam, roughness: 0.9 }),
    mat("G", finishes.foam),
    mat("L", finishes.foam),
  ]);
  decal(
    "helmet-stripe",
    "head",
    (u, v) =>
      helmetSurfacePoint(
        u,
        THREE.MathUtils.lerp(-1.5, 1.18, (v + 6.1) / 12.2),
        0.05,
      ),
    mat("W", finishes.shell),
    new THREE.Vector3(0, 1, 0),
  );
  // The head, face, ears, hair and helmet straps come from the selected head style, and can be rebuilt live.
  // Every style shares the cranium, so the helmet, hair line and neck fit all of them.
  const headParts = (style: HeadStyle): THREE.SkinnedMesh[] => {
    const start = meshes.length,
      field = style.field,
      surface = style.finish === "toy" ? finishes.toy : finishes.skin,
      plain = mat("W", { ...surface, flat: style.flat }),
      grey = mat("L", { ...surface, flat: style.flat }),
      shaded = mat("W", { ...surface, vertexColours: true, flat: style.flat }),
      at = (x: number, y: number, offset = 0.04): THREE.Vector3 =>
        facePoint(field, x, y, offset);
    // Webbing straps meet at a divider below each ear, rest along the jaw and close under the chin.
    const webbing = mat("D", finishes.webbing),
      strap = config.helmet.strapRadius,
      onHead = (x: number, y: number, z: number): THREE.Vector3 =>
        onSurface(field, new THREE.Vector3(x, y, z), strap + 0.02);
    for (const sign of [-1, 1]) {
      const divider = onHead(sign * 2.55, 24.0, 0.55);
      tube(
        "Helmet_front_strap",
        [
          onHead(sign * 2.75, 26.75, 1.55),
          onHead(sign * 2.7, 25.4, 1.05),
          divider,
          onHead(sign * 2.0, 23.1, 0.95),
          onHead(sign * 1.1, 22.3, 1.3),
          onHead(sign * 0.25, 22.0, 1.5),
        ],
        strap,
        "head",
        webbing,
      );
      tube(
        "Helmet_rear_strap",
        [
          onHead(sign * 2.55, 26.25, -2.4),
          onHead(sign * 2.75, 25.1, -1.35),
          divider,
        ],
        strap,
        "head",
        webbing,
      );
      box(
        "Helmet_strap_divider",
        divider.toArray(),
        [0.22, 0.55, 0.42],
        "head",
        mat("L", finishes.plastic),
        0.08,
        new THREE.Euler(0, 0, sign * 0.25),
      );
    }
    const buckle = onHead(0, 21.95, 1.45);
    box(
      "Helmet_chin_buckle",
      buckle.toArray(),
      [0.72, 0.3, 0.42],
      "head",
      mat("D", finishes.plastic),
      0.1,
    );
    box(
      "Helmet_chin_buckle_release",
      [buckle.x, buckle.y - 0.12, buckle.z + 0.05],
      [0.34, 0.12, 0.3],
      "head",
      mat("L", finishes.plastic),
      0.04,
    );
    const head = sculptSurface(
      field,
      [-3.5, 21.4, -4.4],
      [3.5, 30.3, 4.6],
      style.resolution,
      120000,
    );
    const blushColour = new THREE.Color(palette.r ?? "#ff5555"),
      greyColour = new THREE.Color(palette.L ?? "#aaaaaa");
    shade(
      head,
      field,
      (p) => {
        const c = white.clone();
        if (style.underChin !== undefined)
          c.lerp(
            greyColour,
            0.55 *
              (1 -
                THREE.MathUtils.smoothstep(
                  p.y,
                  style.underChin - 0.2,
                  style.underChin + 0.2,
                )),
          );
        if (style.blush) {
          const b = style.blush,
            d = Math.hypot(
              Math.abs(p.x) - b.centre[0],
              p.y - b.centre[1],
              p.z - b.centre[2],
            );
          c.lerp(
            blushColour,
            b.amount *
              (1 - THREE.MathUtils.smoothstep(d, b.radius * 0.3, b.radius)),
          );
        }
        return c;
      },
      "L",
      style.cavity,
      0.3,
    );
    add("Head", head, "head", shaded);
    add(
      "Brown_blond_hair",
      hairCap(head, new THREE.Color(palette.N ?? "#aa5500"), white),
      "head",
      mat("W", {
        ...finishes.hair,
        flat: style.flat,
        vertexColours: true,
        inFront: true,
      }),
    );
    for (const sign of [-1, 1]) {
      const [ex, ey, ez] = style.ears.centre,
        [rx, ry, rz] = style.ears.radii,
        tilt = new THREE.Euler(-0.18, 0, sign * 0.12);
      if (style.ears.box) {
        box(
          "Ear",
          [sign * ex, ey, ez],
          [rx * 2, ry * 2, rz * 2],
          "head",
          plain,
          0.2,
          tilt,
        );
        box(
          "Ear_inner",
          [sign * (ex + rx * 0.7), ey, ez + 0.05],
          [0.12, ry * 1.1, rz * 1.0],
          "head",
          grey,
          0.05,
          tilt,
        );
      } else {
        orb("Ear", [sign * ex, ey, ez], [rx, ry, rz], "head", plain, tilt);
        orb(
          "Ear_inner",
          [sign * (ex + rx * 0.6), ey, ez + 0.06],
          [rx * 0.3, ry * 0.62, rz * 0.55],
          "head",
          grey,
          tilt,
        );
      }
    }
    const eyeWhite = mat("W", finishes.eye),
      iris = mat("B", { ...finishes.eye, flat: style.flat }),
      pupil = mat("k", finishes.eye),
      e = style.eyes;
    for (const sign of [-1, 1]) {
      const x = sign * e.x,
        s = e.size;
      if (e.kind === "ball") {
        // A round eyeball set into a shallow socket, with skin lids and a thin lash line.
        const radius = 0.55 * s,
          centre = at(x, e.y, -radius * 0.95),
          front = centre.z + radius;
        orb(
          "Eye_white",
          centre.toArray(),
          [radius, radius, radius],
          "head",
          eyeWhite,
        );
        orb(
          "Blue_eye",
          [x, e.y, front - 0.09],
          [0.27 * s, 0.28 * s, 0.12],
          "head",
          iris,
        );
        orb(
          "Pupil",
          [x, e.y, front - 0.02],
          [0.12 * s, 0.13 * s, 0.06],
          "head",
          pupil,
        );
        orb(
          "Eye_glint",
          [x - 0.09, e.y + 0.11, front + 0.03],
          [0.055, 0.065, 0.03],
          "head",
          eyeWhite,
        );
        const lid = radius + 0.035;
        for (const [name, edge, upper] of [
          ["Upper_eyelid", 0.36, true],
          ["Lower_eyelid", -0.56, false],
        ] as const) {
          const sweep = Math.PI / 2 - Math.abs(edge);
          add(
            name,
            new THREE.SphereGeometry(
              lid,
              28,
              10,
              0,
              Math.PI,
              upper ? 0 : Math.PI - sweep,
              sweep,
            ),
            "head",
            plain,
            centre.clone(),
          );
          if (upper)
            tube(
              "Upper_lash_line",
              [-1.2, -0.6, 0, 0.6, 1.2].map(
                (a) =>
                  new THREE.Vector3(
                    x + lid * Math.sin(a) * Math.cos(edge),
                    e.y + lid * Math.sin(edge),
                    centre.z + lid * Math.cos(a) * Math.cos(edge),
                  ),
              ),
              0.03,
              "head",
              mat("D", finishes.lips),
            );
        }
      } else if (e.kind === "cartoon") {
        // Big simple eyes on the surface: white, a large blue iris, a small pupil and a tiny highlight.
        const c = at(x, e.y, -0.1 * s),
          whiteRadii = [0.5 * s, 0.62 * s, 0.28];
        orb("Eye_white", c.toArray(), whiteRadii, "head", eyeWhite);
        orb(
          "Blue_eye",
          [x, e.y - 0.04, c.z + 0.17],
          [0.31 * s, 0.38 * s, 0.13],
          "head",
          iris,
        );
        orb(
          "Pupil",
          [x, e.y - 0.04, c.z + 0.25],
          [0.13 * s, 0.17 * s, 0.06],
          "head",
          pupil,
        );
        orb(
          "Eye_glint",
          [x - 0.1, e.y + 0.12, c.z + 0.29],
          [0.07, 0.08, 0.03],
          "head",
          eyeWhite,
        );
        // A subtle skin lid over the top quarter of the eye.
        add(
          "Upper_eyelid",
          new THREE.SphereGeometry(1, 24, 8, 0, Math.PI, 0, 0.78),
          "head",
          plain,
          c.clone(),
          new THREE.Vector3(
            whiteRadii[0] * 1.06,
            whiteRadii[1] * 1.04,
            whiteRadii[2] * 1.12,
          ),
        );
      } else if (e.kind === "pixel") {
        // Flat blue dots, as in the sprite, with no whites or pupils.
        box(
          "Blue_eye",
          at(x, e.y, 0.02).toArray(),
          [0.44 * s, 0.56 * s, 0.12],
          "head",
          iris,
          0.05,
        );
      } else {
        // Painted on: a glossy blue oval with a white glint.
        const c = at(x, e.y, -0.12);
        orb("Blue_eye", c.toArray(), [0.27 * s, 0.37 * s, 0.2], "head", iris);
        orb(
          "Eye_glint",
          [x - 0.08, e.y + 0.14, c.z + 0.21],
          [0.06, 0.07, 0.02],
          "head",
          eyeWhite,
        );
      }
    }
    if (style.nose === "block")
      // The sprite's bumpy nose: a small grey block standing off the flat face.
      box(
        "Nose_bump",
        at(0, 25.05, 0.12).toArray(),
        [0.55, 0.62, 0.42],
        "head",
        grey,
        0.12,
      );
    const m = style.mouth,
      lips = mat("R", { ...finishes.lips, flat: style.flat });
    if (m.kind === "bar")
      box(
        "Mouth",
        at(0, m.y, 0.03).toArray(),
        [m.width, m.radius * 2, 0.14],
        "head",
        lips,
        0.08,
      );
    else {
      // The smile curves up at the corners; a grin flattens its middle a little so the corners lift.
      const curve = (t: number): number =>
        m.kind === "grin" ? m.curve * Math.abs(t) ** 1.6 : m.curve * t * t;
      tube(
        "Mouth_smile",
        [-1, -0.7, -0.35, 0, 0.35, 0.7, 1].map((t) =>
          at(t * m.width, m.y + curve(t), 0.02),
        ),
        m.radius,
        "head",
        lips,
      );
      if (m.kind === "grin") {
        // A lighter upper-lip edge over the smile and a small crease at each corner.
        tube(
          "Upper_lip_edge",
          [-0.85, -0.45, 0, 0.45, 0.85].map((t) =>
            at(t * m.width, m.y + curve(t) + m.radius * 0.85, 0.03),
          ),
          m.radius * 0.42,
          "head",
          mat("r", { ...finishes.lips, flat: style.flat }),
        );
        for (const sign of [-1, 1]) {
          const corner = m.width * 1.02;
          tube(
            "Mouth_corner_crease",
            [0, 0.5, 1].map((t) =>
              at(
                sign * (corner + 0.07 * t),
                m.y + curve(1) + 0.04 + 0.12 * t,
                0.0,
              ),
            ),
            0.025,
            "head",
            mat("L", { ...finishes.skin, flat: style.flat }),
          );
        }
      }
    }
    if (style.brows) {
      const b = style.brows;
      for (const sign of [-1, 1])
        tube(
          "Eyebrow",
          [-1, -0.33, 0.33, 1].map((t) =>
            at(sign * (e.x + t * b.width), b.y + 0.08 * (1 - t * t), 0.05),
          ),
          b.radius,
          "head",
          mat(b.colour, finishes.hair),
        );
    }
    return meshes.slice(start);
  };
  let currentStyle = initialStyle,
    headMeshes = headParts(currentStyle);
  const setHeadStyle = (id: string): void => {
    const next = headStyle(id);
    if (next.id === currentStyle.id) return;
    for (const mesh of headMeshes) {
      rig.root.remove(mesh);
      mesh.geometry.dispose();
      meshes.splice(meshes.indexOf(mesh), 1);
    }
    currentStyle = next;
    headMeshes = headParts(next);
    rig.root.updateMatrixWorld(true);
    rig.skeleton.update();
  };
  // A short, sturdy neck: wide where it enters the shoulders, leaning back into the base of the skull
  // so the jaw and the back of the head both rest on it. It blends into the head bone below the jaw.
  // The neckline the collar is built around; the neck fills it so no gap shows inside the collar.
  const neckline = { z: -0.5, radius: 1.6, depth: 0.95 },
    neckRings = 26,
    neckSegments = 72,
    neckPositions: number[] = [],
    neckIndices: number[] = [];
  for (let i = 0; i <= neckRings; i++) {
    const t = i / neckRings,
      y = THREE.MathUtils.lerp(19.0, 24.2, t),
      // Upright and centred on the collar through the neckline, then leaning back into the skull.
      lean = THREE.MathUtils.smoothstep(y, 21.7, 24.2),
      // Below the collar the neck narrows inside the shoulders, so it cannot show through the shirt.
      base = THREE.MathUtils.lerp(
        1.3,
        1,
        THREE.MathUtils.smoothstep(y, 20.2, 21.0),
      ),
      cz = THREE.MathUtils.lerp(neckline.z, -0.95, lean),
      rx = THREE.MathUtils.lerp((neckline.radius + 0.08) / base, 1.42, lean),
      rz = THREE.MathUtils.lerp(
        ((neckline.radius + 0.08) * neckline.depth) / base,
        1.55,
        lean,
      );
    for (let j = 0; j <= neckSegments; j++) {
      const a = (j / neckSegments) * Math.PI * 2;
      neckPositions.push(rx * Math.sin(a), y, cz + rz * Math.cos(a));
    }
  }
  for (let i = 0; i < neckRings; i++)
    for (let j = 0; j < neckSegments; j++) {
      const a = i * (neckSegments + 1) + j,
        b = a + neckSegments + 1;
      neckIndices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const neck = new THREE.BufferGeometry();
  neck.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(neckPositions, 3),
  );
  neck.setIndex(neckIndices);
  neck.computeVertexNormals();
  // The base stays seated in the collar with the chest; above it the neck bends, then the head takes over.
  add("Neck", neck, "neck", skin);
  weightSurface(rig, neck, (p) => {
    const head = THREE.MathUtils.smoothstep(p.y, 22.0, 23.2),
      seated = 1 - THREE.MathUtils.smoothstep(p.y, 21.7, 22.4);
    return { chest: seated, neck: (1 - seated) * (1 - head), head };
  });

  // The shirt, shoulder caps, sleeves and turned collar band are one cotton surface.
  // Sleeves are tubes around each upper-arm bone, hemmed square to the arm and skinned to it, so the
  // openings sit on the arm in every pose; a small gap under the arm keeps sleeve and torso separate.
  // The collar wraps the neck base and climbs at the back, where it sits on the shoulders.
  const neckAngle = (x: number, z: number): number =>
      Math.atan2(x, z - neckline.z),
    collarTop = (a: number): number => 21.05 + 0.6 * ((1 - Math.cos(a)) / 2),
    collarBottom = (a: number): number => 20.15 + 0.6 * ((1 - Math.cos(a)) / 2),
    neckRadial = (x: number, z: number): number =>
      Math.hypot(x, (z - neckline.z) / neckline.depth),
    smax = (a: number, b: number, k: number): number => -smoothUnion(-a, -b, k);
  const collarField = (x: number, y: number, z: number): number => {
    const a = neckAngle(x, z),
      top = collarTop(a),
      bottom = collarBottom(a),
      flare = THREE.MathUtils.clamp((top - y) / (top - bottom), 0, 1),
      radius = THREE.MathUtils.lerp(neckline.radius + 0.13, 2.05, flare);
    return smax(
      smax(Math.abs(neckRadial(x, z) - radius) - 0.13, y - top, 0.08),
      // The band carries well down into the shirt, so no slit opens under it from any angle.
      bottom - 0.7 - y,
      0.08,
    );
  };
  const sleeves = (["right", "left"] as const).map((side) => {
    const shoulder = rig.rest[side + "UpperArm"],
      elbow = rig.rest[side + "Forearm"],
      axis = elbow.clone().sub(shoulder),
      length = axis.length();
    axis.normalize();
    return { side, shoulder, axis, length, hem: 0.6 * length };
  });
  const sleeveFrame = (
    sleeve: (typeof sleeves)[number],
    x: number,
    y: number,
    z: number,
  ): { along: number; radial: number } => {
    const dx = x - sleeve.shoulder.x,
      dy = y - sleeve.shoulder.y,
      dz = z - sleeve.shoulder.z,
      along = dx * sleeve.axis.x + dy * sleeve.axis.y + dz * sleeve.axis.z;
    return {
      along,
      radial: Math.sqrt(
        Math.max(0, dx * dx + dy * dy + dz * dz - along * along),
      ),
    };
  };
  const sleeveField = (
    sleeve: (typeof sleeves)[number],
    x: number,
    y: number,
    z: number,
  ): number => {
    const { along, radial } = sleeveFrame(sleeve, x, y, z),
      t = THREE.MathUtils.clamp(along / sleeve.hem, 0, 1),
      tube =
        along < 0
          ? Math.hypot(radial, along) - 1.18
          : radial - THREE.MathUtils.lerp(1.18, 1.1, t);
    return smax(tube, along - sleeve.hem, 0.08);
  };
  const torsoField = (x: number, y: number, z: number): number => {
    let d = smoothUnion(
      ellipsoid(x, y, z, [0, 16.8, 0.05], [2.45, 3.8, 1.95]),
      ellipsoid(x, y, z, [0, 13.4, 0.1], [2.25, 3.2, 1.8]),
      1.2,
    );
    d = smoothUnion(
      d,
      // The upper back stops just under the collar band, so the band sits on it rather than inside it.
      // Deep enough at the back to sit behind the neck, so the nape is covered by the back itself.
      ellipsoid(x, y, z, [0, 19.4, -0.75], [2.35, 1.45, 1.65]),
      0.8,
    );
    // The shirt fills the waist and tucks into the waistband, so the belt wraps the body.
    d = smoothUnion(
      d,
      ellipsoid(x, y, z, [0, 11.8, 0.05], [2.32, 1.35, 1.7]),
      0.9,
    );
    for (const sign of [-1, 1])
      d = smoothUnion(
        d,
        capsuleDistance(
          x,
          y,
          z,
          [sign * 0.75, 19.85, -0.2],
          [sign * 2.75, 19.25, -0.05],
          0.85,
        ),
        0.8,
      );
    return d;
  };
  const shirtField = (x: number, y: number, z: number): number => {
    let d = torsoField(x, y, z);
    // The sleeve blends into the shoulder seam but stays separate from the torso below the armpit.
    for (const sleeve of sleeves) {
      const { along } = sleeveFrame(sleeve, x, y, z);
      d = smoothUnion(
        d,
        sleeveField(sleeve, x, y, z),
        THREE.MathUtils.lerp(
          0.3,
          0.03,
          THREE.MathUtils.smoothstep(along, 0.2, 1.1),
        ),
      );
    }
    // A yoke of fabric wraps the neck base from the shoulders up under the collar band, so the shirt
    // closes round the neck at every angle instead of leaving the neck showing behind a thin back.
    d = smoothUnion(
      d,
      // It narrows as it descends into the upper back, so it never forms a shelf seen from below.
      Math.max(
        (neckRadial(x, z) -
          neckline.radius -
          0.45 +
          0.7 * Math.max(0, collarBottom(neckAngle(x, z)) - 0.2 - y)) *
          neckline.depth,
        y - collarBottom(neckAngle(x, z)) - 0.15,
      ),
      0.5,
    );
    d = Math.max(smoothUnion(d, collarField(x, y, z), 0.1), 10.95 - y);
    // The open neckline is cut after the collar joins, leaving one clean inner wall.
    // It starts just inside the collar band at each angle, so the shirt back stays whole below the collar.
    return smax(
      d,
      -Math.max(
        neckRadial(x, z) - neckline.radius,
        collarBottom(neckAngle(x, z)) - 0.25 - y,
      ),
      0.06,
    );
  };
  // How far the shoulder has handed over from the chest to the upper arm along the arm axis. The shirt
  // cap and the arm skin beneath it share this blend, so the deltoid cannot rise through the fabric.
  const shoulderCap = (along: number): number =>
    THREE.MathUtils.smoothstep(along, -0.55, 0.25);
  const shirtWeights: Influences = (p) => {
    const chest = THREE.MathUtils.smoothstep(p.y, 13.4, 18.4),
      waist = THREE.MathUtils.smoothstep(p.y, 11.2, 14.2),
      torso = torsoField(p.x, p.y, p.z),
      w: Record<string, number> = {};
    let arms = 0;
    for (const sleeve of sleeves) {
      const { along, radial } = sleeveFrame(sleeve, p.x, p.y, p.z),
        // Sleeve fabric (nearer the sleeve tube than the torso) follows the upper arm; the shoulder
        // cap blends from the chest above the joint into the arm just below it.
        nearer = THREE.MathUtils.smoothstep(
          torso - sleeveField(sleeve, p.x, p.y, p.z),
          -0.08,
          0.12,
        ),
        // Below the shoulder the whole sleeve tube follows the arm, even where it lies near the torso.
        inTube =
          THREE.MathUtils.smoothstep(along, -0.1, 0.4) *
          (1 - THREE.MathUtils.smoothstep(radial, 1.2, 1.45)) *
          (1 -
            THREE.MathUtils.smoothstep(
              along,
              sleeve.hem + 0.15,
              sleeve.hem + 0.4,
            )),
        share = shoulderCap(along) * Math.max(nearer, inTube);
      w[sleeve.side + "UpperArm"] = share;
      arms += share;
    }
    const body = Math.max(0, 1 - arms);
    w.pelvis = body * (1 - waist);
    w.spine = body * waist * (1 - chest);
    w.chest = body * waist * chest;
    return w;
  };
  const garment = sculptSurface(
      shirtField,
      [-5.6, 10.6, -3.1],
      [5.6, 22.0, 2.9],
      62,
      120000,
    ),
    darkRed = new THREE.Color(palette.R),
    lightRed = new THREE.Color(palette.r);
  // Colour follows smooth functions of position, so the white collar meets the red shirt in a clean line.
  shade(
    garment,
    shirtField,
    (p) => {
      const collar =
        THREE.MathUtils.smoothstep(
          p.y - collarBottom(neckAngle(p.x, p.z)),
          0.0,
          0.06,
        ) *
        (1 - THREE.MathUtils.smoothstep(neckRadial(p.x, p.z), 2.35, 2.45));
      const sleeve = Math.max(
        ...sleeves.map((s) =>
          THREE.MathUtils.smoothstep(
            sleeveFrame(s, p.x, p.y, p.z).along,
            -0.4,
            0.4,
          ),
        ),
      );
      return darkRed
        .clone()
        .lerp(
          lightRed,
          sleeve * 0.7 + THREE.MathUtils.smoothstep(p.y, 18.6, 20.2) * 0.25,
        )
        .lerp(white, collar);
    },
    "k",
    0.4,
  );
  add(
    "Shirt_torso",
    garment,
    "spine",
    mat("W", { ...finishes.cotton, vertexColours: true }),
  );
  weightSurface(rig, garment, shirtWeights);
  tube(
    "Collar_sewn_edge",
    Array.from({ length: 65 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2 - Math.PI,
        y = collarBottom(a) + 0.05,
        r = 2.05 + 0.08;
      return new THREE.Vector3(
        r * Math.sin(a),
        y,
        r * neckline.depth * Math.cos(a) + neckline.z,
      );
    }),
    0.1,
    "chest",
    mat("W", finishes.cotton),
    true,
  );
  // Rolled hems give the cuffs and the collar top clean, round edges instead of the sculpted cut.
  tube(
    "Collar_rolled_edge",
    Array.from({ length: 65 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2 - Math.PI,
        r = neckline.radius + 0.13;
      return new THREE.Vector3(
        r * Math.sin(a),
        collarTop(a) - 0.16,
        r * neckline.depth * Math.cos(a) + neckline.z,
      );
    }),
    0.12,
    "chest",
    mat("W", finishes.cotton),
    true,
  );
  for (const sleeve of sleeves) {
    const across = new THREE.Vector3(1, 0, 0)
        .addScaledVector(sleeve.axis, -sleeve.axis.x)
        .normalize(),
      around = new THREE.Vector3().crossVectors(sleeve.axis, across),
      centre = sleeve.shoulder
        .clone()
        .addScaledVector(sleeve.axis, sleeve.hem - 0.02);
    tube(
      "Sleeve_rolled_hem",
      Array.from({ length: 49 }, (_, i) => {
        const a = (i / 48) * Math.PI * 2;
        return centre
          .clone()
          .addScaledVector(across, 1.1 * Math.cos(a))
          .addScaledVector(around, 1.1 * Math.sin(a));
      }),
      0.13,
      sleeve.side + "UpperArm",
      mat("r", finishes.cotton),
      true,
    );
  }
  for (const [id, colour, offset] of [
    ["fizz-emblem", "y", 0.045],
    ["fizz-emblem-core", "N", 0.065],
  ] as const) {
    decal(
      id,
      "chest",
      (u, v) => {
        const y = 17.6 - v;
        return new THREE.Vector3(u, y, frontSurface(shirtField, u, y) + offset);
      },
      // Drawn further forward than the shirt, which itself sits just in front of skin.
      mat(colour, { ...finishes.cotton, inFront: true, layer: 3 }),
    );
    weightSurface(rig, meshes.at(-1)!.geometry, shirtWeights);
  }

  // One continuous pair of slim straight jeans joins the pelvis, seat, thighs, knees and cuffs.
  const hipY = rig.rest.rightThigh.y,
    kneeY = rig.rest.rightShin.y,
    ankleY = rig.rest.rightFoot.y,
    legX = Math.abs(rig.rest.rightThigh.x),
    hemY = ankleY - 0.3;
  const legRadii = (y: number): { rx: number; rz: number } => {
    const t = THREE.MathUtils.smoothstep(y, kneeY - 0.4, hipY);
    return {
      rx: THREE.MathUtils.lerp(0.95, 1.3, t),
      rz: THREE.MathUtils.lerp(1.05, 1.4, t),
    };
  };
  const pantsField = (x: number, y: number, z: number): number => {
    // A straight waistband above the hip joints and a rounded pelvis below it, without creases.
    const waist = 10.4;
    let d =
      y >= waist
        ? Math.max((Math.hypot(x / 2.42, z / 1.78) - 1) * 1.78, y - 11.75)
        : ellipsoid(x, y, z, [0, waist, 0], [2.42, 2.6, 1.78]);
    for (const sign of [-1, 1]) {
      d = smoothUnion(
        d,
        ellipsoid(x, y, z, [sign * 1.05, 9.35, -0.6], [1.3, 1.35, 1.2]),
        0.5,
      );
      const cy = THREE.MathUtils.clamp(y, hemY, hipY + 0.5),
        { rx, rz } = legRadii(cy),
        leg = Math.max(
          (Math.hypot((x - sign * legX) / rx, (z - 0.08) / rz) - 1) * rx,
          hemY - y,
          y - (hipY + 0.6),
        );
      d = smoothUnion(d, leg, 0.45);
      d = smoothUnion(
        d,
        ellipsoid(x, y, z, [sign * legX, kneeY, 0.72], [0.62, 0.52, 0.42]),
        0.35,
      );
    }
    return d;
  };
  const pantsWeights: Influences = (p) => {
    const pelvis = THREE.MathUtils.smoothstep(p.y, hipY - 1.6, hipY + 0.3),
      left = THREE.MathUtils.smoothstep(p.x, -0.8, 0.8),
      upper = THREE.MathUtils.smoothstep(p.y, kneeY, kneeY + 0.75),
      lower = 1 - THREE.MathUtils.smoothstep(p.y, kneeY - 0.75, kneeY),
      joint = 1 - upper - lower,
      foot = 1 - THREE.MathUtils.smoothstep(p.y, ankleY + 0.05, ankleY + 0.9);
    const w: Record<string, number> = { pelvis };
    for (const [side, share] of [
      ["right", 1 - left],
      ["left", left],
    ] as const) {
      w[side + "Knee"] = (1 - pelvis) * share * joint;
      w[side + "Thigh"] = (1 - pelvis) * share * upper;
      w[side + "Shin"] = (1 - pelvis) * share * lower * (1 - foot);
      w[side + "Foot"] = (1 - pelvis) * share * lower * foot;
    }
    return w;
  };
  const pants = sculptSurface(
    pantsField,
    [-3.4, hemY - 0.3, -2.2],
    [3.4, 11.9, 2.4],
    56,
    120000,
  );
  shade(pants, pantsField, () => new THREE.Color(palette.B), "k", 0.45);
  add(
    "Jeans_continuous",
    pants,
    "pelvis",
    mat("W", { ...finishes.denim, vertexColours: true }),
  );
  weightSurface(rig, pants, pantsWeights);
  // The belt is a leather band traced around the jeans waistband, so it wraps the body with no gap.
  const beltY = 11.25,
    beltHeight = 0.66,
    beltThickness = 0.16,
    waistAt = (angle: number): number => {
      let low = 0,
        high = 4;
      for (let i = 0; i < 30; i++) {
        const r = (low + high) / 2;
        if (pantsField(r * Math.sin(angle), beltY, r * Math.cos(angle)) < 0)
          low = r;
        else high = r;
      }
      return (low + high) / 2;
    };
  const beltProfile = [
      [-0.03, -0.5],
      [0.6, -0.5],
      [1, -0.32],
      [1, 0.32],
      [0.6, 0.5],
      [-0.03, 0.5],
    ],
    beltPositions: number[] = [],
    beltIndices: number[] = [],
    beltSegments = 96;
  for (let i = 0; i <= beltSegments; i++) {
    const a = (i / beltSegments) * Math.PI * 2,
      r = waistAt(a);
    for (const [out, up] of beltProfile) {
      const radius = r + out * beltThickness;
      beltPositions.push(
        radius * Math.sin(a),
        beltY + up * beltHeight,
        radius * Math.cos(a),
      );
    }
  }
  const ring = beltProfile.length;
  for (let i = 0; i < beltSegments; i++)
    for (let j = 0; j < ring - 1; j++) {
      const a = i * ring + j,
        b = a + ring;
      beltIndices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const belt = new THREE.BufferGeometry();
  belt.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(beltPositions, 3),
  );
  belt.setIndex(beltIndices);
  belt.computeVertexNormals();
  add("Belt", belt, "pelvis", mat("D", finishes.leather));
  const buckleZ = waistAt(0) + beltThickness;
  box(
    "Belt_buckle",
    [0, beltY, buckleZ + 0.08],
    [1.1, 0.78, 0.2],
    "pelvis",
    mat("y", finishes.metal),
    0.1,
  );
  box(
    "Belt_buckle_inset",
    [0, beltY, buckleZ + 0.2],
    [0.62, 0.4, 0.08],
    "pelvis",
    mat("N", finishes.leather),
    0.05,
  );

  for (const [side, sign] of [
    ["right", -1],
    ["left", 1],
  ] as const) {
    const shoulder = rig.rest[side + "UpperArm"].toArray(),
      elbow = rig.rest[side + "Forearm"].toArray(),
      wrist = rig.rest[side + "Hand"].toArray(),
      ankle = rig.rest[side + "Foot"],
      inward = -sign;
    const along = (
      a: readonly number[],
      b: readonly number[],
      t: number,
    ): number[] => a.map((v, i) => THREE.MathUtils.lerp(v, b[i], t));
    const at = (dx: number, dy: number, dz: number): number[] => [
      wrist[0] + dx,
      wrist[1] + dy,
      wrist[2] + dz,
    ];
    // Deltoid, biceps, elbow, forearm taper, wrist, palm, four fingers and an opposing thumb.
    const armField = (x: number, y: number, z: number): number => {
      let d = taperedCapsule(x, y, z, shoulder, elbow, 0.98, 0.66);
      d = smoothUnion(
        d,
        ellipsoid(
          x,
          y,
          z,
          along(shoulder, elbow, 0.45).map((v, i) => v + [0, 0, 0.18][i]),
          [0.84, 1.35, 0.82],
        ),
        0.45,
      );
      d = smoothUnion(
        d,
        Math.hypot(x - elbow[0], y - elbow[1], z - elbow[2]) - 0.64,
        0.3,
      );
      d = smoothUnion(
        d,
        taperedCapsule(x, y, z, elbow, wrist, 0.72, 0.46),
        0.3,
      );
      d = smoothUnion(
        d,
        ellipsoid(x, y, z, along(elbow, wrist, 0.28), [0.78, 1.25, 0.8]),
        0.5,
      );
      d = smoothUnion(
        d,
        ellipsoid(x, y, z, at(0, -0.82, 0.02), [0.4, 0.82, 0.8]),
        0.28,
      );
      for (let finger = 0; finger < 4; finger++) {
        const offset = [0.56, 0.2, -0.18, -0.52][finger],
          length = [1.05, 1.15, 1.08, 0.86][finger],
          r = [0.2, 0.21, 0.2, 0.17][finger],
          knuckle = at(0, -1.45, offset),
          middle = at(inward * 0.12, -1.45 - length * 0.55, offset + 0.02),
          tip = at(inward * 0.32, -1.45 - length, offset + 0.03);
        d = smoothUnion(d, capsuleDistance(x, y, z, knuckle, middle, r), 0.1);
        d = smoothUnion(
          d,
          capsuleDistance(x, y, z, middle, tip, r * 0.88),
          0.07,
        );
      }
      const thumbBase = at(inward * 0.15, -0.4, 0.55),
        thumbJoint = at(inward * 0.38, -1.02, 0.86),
        thumbTip = at(inward * 0.52, -1.55, 0.8);
      d = smoothUnion(
        d,
        capsuleDistance(x, y, z, thumbBase, thumbJoint, 0.26),
        0.18,
      );
      return smoothUnion(
        d,
        capsuleDistance(x, y, z, thumbJoint, thumbTip, 0.2),
        0.08,
      );
    };
    const arm = sculptSurface(
      armField,
      [sign < 0 ? -5.9 : 2.5, 7.6, -1.5],
      [sign < 0 ? -2.5 : 5.9, 20.0, 2.1],
      62,
      120000,
    );
    shade(arm, armField, () => white, "L", 0.35, 0.25);
    add(side + "_arm_continuous", arm, side + "UpperArm", shadedSkin);
    const sleeve = sleeves.find((s) => s.side === side)!,
      thumbBone = rig.rest[side + "Thumb"],
      thumbStart = at(inward * 0.15, -0.4, 0.55),
      thumbEnd = at(inward * 0.52, -1.55, 0.8),
      thumbAxis = new THREE.Vector3(
        thumbEnd[0] - thumbStart[0],
        thumbEnd[1] - thumbStart[1],
        thumbEnd[2] - thumbStart[2],
      ).normalize();
    weightSurface(rig, arm, (p) => {
      const upper = THREE.MathUtils.smoothstep(
          p.y,
          elbow[1] - 0.45,
          elbow[1] + 0.45,
        ),
        cap = shoulderCap(sleeveFrame(sleeve, p.x, p.y, p.z).along),
        palm =
          1 - THREE.MathUtils.smoothstep(p.y, wrist[1] - 0.45, wrist[1] + 0.15),
        // The thumb, out from its base, follows its own bone so it can swing across a held object.
        thumb =
          (1 -
            THREE.MathUtils.smoothstep(
              capsuleDistance(p.x, p.y, p.z, thumbStart, thumbEnd, 0),
              0.26,
              0.42,
            )) *
          THREE.MathUtils.smoothstep(
            p.clone().sub(thumbBone).dot(thumbAxis),
            -0.05,
            0.25,
          );
      return {
        chest: upper * (1 - cap),
        [side + "UpperArm"]: upper * cap,
        [side + "Forearm"]: (1 - upper) * (1 - palm),
        [side + "Hand"]: (1 - upper) * palm * (1 - thumb),
        [side + "Thumb"]: (1 - upper) * palm * thumb,
      };
    });
    const seamPoints = Array.from({ length: 25 }, (_, i) => {
      const y = hipY - 0.2 - (i / 24) * (hipY - 0.2 - (hemY + 0.15)),
        x = sign * (legX + legRadii(y).rx * 0.82);
      return new THREE.Vector3(x, y, frontSurface(pantsField, x, y) + 0.025);
    });
    tube(
      side + "_denim_seam",
      seamPoints,
      0.06,
      side + "Thigh",
      mat("c", finishes.denim),
    );
    weightSurface(rig, meshes.at(-1)!.geometry, pantsWeights);
    const z = ankle.z,
      foot = side + "Foot",
      toe = side + "Toe",
      blend = {
        bone: toe,
        weight: (p: THREE.Vector3) =>
          THREE.MathUtils.smoothstep(p.z, z + toeFlex.start, z + toeFlex.end),
      };
    // Red upper, white toe cap and sole, and grey underside share one connected shoe surface.
    add(
      side + "_shoe",
      runningShoe(ankle.x, z),
      foot,
      [
        mat("R", finishes.mesh),
        mat("W", finishes.rubber),
        mat("L", finishes.rubber),
      ],
      undefined,
      undefined,
      undefined,
      blend,
    );
    const sx = shoeScale.x,
      sz = shoeScale.z;
    const cuff = Array.from({ length: 49 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2,
        x = 0.74 * sx * Math.cos(a),
        depth = (-0.2 + 0.6 * Math.sin(a)) * sz;
      return new THREE.Vector3(
        ankle.x + x,
        runnerTop(x, depth) + 0.025,
        z + depth,
      );
    });
    tube(side + "_ankle_binding", cuff, 0.035, foot, mat("r", finishes.mesh));
    for (let j = 0; j < 5; j++) {
      const depth = (0.05 + j * 0.4) * sz;
      const points = [-0.44, 0, 0.44].map(
        (x) =>
          new THREE.Vector3(
            ankle.x + x * sx,
            runnerTop(x * sx, depth) + 0.05,
            z + depth,
          ),
      );
      tube(side + "_lace", points, 0.045, foot, mat("r", finishes.webbing));
    }
    const sideSeam = Array.from({ length: 16 }, (_, i) => {
      const depth = (-1.85 + (i / 15) * 3.1) * sz,
        p = runnerProfile(depth),
        y = p.seam + 0.3;
      const a = Math.asin(
        Math.min(1, ((y - p.seam) / (p.top - p.seam)) ** (1 / 0.75)),
      );
      return new THREE.Vector3(
        ankle.x + sign * (p.width * Math.cos(a) + 0.015),
        y,
        z + depth,
      );
    });
    tube(
      side + "_quarter_stitch",
      sideSeam,
      0.025,
      foot,
      mat("r", finishes.mesh),
    );
    decal(
      "shoe-badge",
      foot,
      (u, v) => {
        const depth = (0.05 + u * 0.7) * sz,
          p = runnerProfile(depth),
          y = shoeY(1.35) - v * 0.65 * shoeScale.y,
          a = Math.asin(
            Math.min(1, ((y - p.seam) / (p.top - p.seam)) ** (1 / 0.75)),
          );
        return new THREE.Vector3(
          ankle.x + sign * (p.width * Math.cos(a) + 0.025),
          y,
          z + depth,
        );
      },
      mat("y", finishes.mesh),
      new THREE.Vector3(sign, 0, 0),
    );
  }
  // The ray-gun Stunner rides on its own bone, holstered on the anatomical right hip only.
  // Its parts are authored in the gun frame and turned into the holstered pose at rest.
  const gunOrigin = rig.rest.stunner,
    glow = mat("c").clone();
  glow.emissive.set("#55ffff");
  glow.emissiveIntensity = 1.2;
  materials.set("stunnerGlow", glow);
  for (const part of stunnerParts()) {
    part.geometry.applyQuaternion(holsterTurn);
    add(
      part.name,
      part.geometry,
      "stunner",
      part.glow ? glow : mat(part.colour, finishes.plastic),
      gunOrigin.clone(),
    );
  }
  // A dark holster band hugs the barrel below the body and clips to the belt; it stays on the hip when drawn.
  const holster = new THREE.CylinderGeometry(0.5, 0.46, 0.75, 20, 1, true);
  holster.rotateX(Math.PI / 2);
  holster.translate(0, 0, 1.4);
  holster.applyQuaternion(holsterTurn);
  add(
    "Holster_band",
    holster,
    "pelvis",
    mat("D", finishes.leather),
    gunOrigin.clone(),
  );
  // The holster hangs from the belt by a short strap on the right hip.
  const strapAngle = Math.atan2(gunOrigin.x, gunOrigin.z),
    strapTop = new THREE.Vector3(
      Math.sin(strapAngle),
      0,
      Math.cos(strapAngle),
    ).multiplyScalar(waistAt(strapAngle) + beltThickness + 0.04),
    strapBottom = new THREE.Vector3(0.0, 0.5, 1.2)
      .applyQuaternion(holsterTurn)
      .add(gunOrigin);
  strapTop.y = beltY - 0.1;
  const strapLength = strapTop.distanceTo(strapBottom),
    holsterStrap = new THREE.BoxGeometry(0.36, strapLength, 0.1);
  holsterStrap.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      strapTop.clone().sub(strapBottom).normalize(),
    ),
  );
  add(
    "Holster_strap",
    holsterStrap,
    "pelvis",
    mat("D", finishes.leather),
    strapTop.clone().add(strapBottom).multiplyScalar(0.5),
  );
  const flashAt = stunnerTip
    .clone()
    .applyQuaternion(holsterTurn)
    .add(gunOrigin);
  const flash = mat("c").clone();
  flash.emissive.set("#55ffff");
  flash.emissiveIntensity = 2;
  materials.set("muzzleGlow", flash);
  const burst = new THREE.SphereGeometry(1, 14, 10);
  burst.scale(0.7, 0.7, 1.6);
  burst.translate(0, 0, 1.3);
  burst.applyQuaternion(holsterTurn);
  add("Stunner_muzzle_flash", burst, "muzzleFlash", flash, flashAt);
  rig.bones.muzzleFlash.scale.setScalar(0);
  const phoneCentre = rig.rest.phone;
  phoneMeshes.push(
    box(
      "Phone_dark_back",
      phoneCentre.toArray(),
      [2.2, 3.5, 0.35],
      "phone",
      mat("D", finishes.plastic),
      0.25,
    ),
  );
  phoneMeshes.push(
    orb(
      "Phone_camera",
      [phoneCentre.x - 0.55, phoneCentre.y + 1.15, phoneCentre.z + 0.23],
      [0.25, 0.25, 0.08],
      "phone",
      mat("k", finishes.eye),
    ),
  );
  phoneMeshes.push(
    box(
      "Phone_screen",
      [phoneCentre.x, phoneCentre.y, phoneCentre.z - 0.22],
      [1.85, 3.0, 0.08],
      "phone",
      mat("c", finishes.eye),
      0.14,
    ),
  );
  const mark = layers.get("phone-mark")!;
  const phoneMark = projectSkinLayer(
    rig,
    mark,
    "phone",
    (u, v) =>
      new THREE.Vector3(
        phoneCentre.x + u,
        phoneCentre.y - v,
        phoneCentre.z + 0.22,
      ),
    mat("y"),
    "Phone_Fizz_mark",
  );
  meshes.push(phoneMark);
  phoneMeshes.push(phoneMark);
  rig.bones.phone.scale.setScalar(0);
  rig.root.updateMatrixWorld(true);
  rig.skeleton.update();
  rig.root.userData = {
    description: config.name,
    units: config.units,
    referenceFloor: config.floorY,
    referenceCrown: config.crownY,
  };
  return {
    ...rig,
    meshes,
    phoneMeshes,
    setHeadStyle,
    headStyle: () => currentStyle.id,
    dispose: () => {
      const geometries = new Set(meshes.map((mesh) => mesh.geometry));
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      rig.skeleton.dispose();
    },
  };
}
