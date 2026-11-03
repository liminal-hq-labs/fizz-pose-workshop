// Checks the hybrid Ben: kept equipment, the artboard head under the fitted helmet, the Codex body and a
// watertight neck, collar and shirt from every direction in moving poses.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { installThreeToolRuntime } from "../../scripts/three-runtime.ts";
import { createHybridBenModel, hybrid, hybridHeadField, shirtPrints } from "./hybrid.ts";
import { createBenModel } from "./model.ts";
import { applyBenPose, firing, poseNames, type BenPose } from "./poses.ts";
import { helmetInner, helmetOuter, helmetRim } from "./equipment.ts";
import config from "../../source/ben-3d.json";

installThreeToolRuntime();
const svg = readFileSync(new URL("../../source/ben-3d-skins.svg", import.meta.url), "utf8"),
  model = createHybridBenModel(svg);
afterAll(() => model.dispose());
const named = (name: string): THREE.SkinnedMesh[] => model.meshes.filter((m) => m.name === name);
const restBox = (name: string): THREE.Box3 => {
  const box = new THREE.Box3();
  for (const mesh of named(name)) {
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!);
  }
  return box;
};
const drop = hybrid.headDrop;
const collarTop = (a: number): number =>
  hybrid.collarTop + hybrid.collarRise * ((1 - Math.cos(a)) / 2);

/**
 * A posed, unskinned copy of the triangles of `mesh` near `centre`, for plain triangle ray tests. `front[t]`
 * is +1 when kept triangle `t` winds outward, agreeing with the surface's vertex normal, and -1 otherwise.
 */
function snapshot(
  mesh: THREE.SkinnedMesh,
  centre?: THREE.Vector3,
  reach = Infinity,
): { mesh: THREE.Mesh; front: number[] } {
  const source = mesh.geometry,
    index = source.index,
    positions = source.getAttribute("position"),
    normals = source.getAttribute("normal"),
    posed: THREE.Vector3[] = [],
    out: number[] = [];
  for (let i = 0; i < positions.count; i++) posed.push(mesh.getVertexPosition(i, new THREE.Vector3()));
  const front: number[] = [];
  const count = index ? index.count : positions.count,
    at = (k: number): number => (index ? index.getX(k) : k),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    n = new THREE.Vector3(),
    v = new THREE.Vector3();
  for (let k = 0; k < count; k += 3) {
    const i = at(k),
      j = at(k + 1),
      l = at(k + 2);
    if (
      centre &&
      Math.min(...[i, j, l].map((q) => posed[q].distanceTo(centre))) > reach
    )
      continue;
    if (normals) {
      a.fromBufferAttribute(positions, j).sub(v.fromBufferAttribute(positions, i));
      b.fromBufferAttribute(positions, l).sub(v.fromBufferAttribute(positions, i));
      n.crossVectors(a, b);
      front.push(n.dot(v.fromBufferAttribute(normals, i)) >= 0 ? 1 : -1);
    } else front.push(1);
    for (const q of [i, j, l]) out.push(posed[q].x, posed[q].y, posed[q].z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    mesh: new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })),
    front,
  };
}
const release = (meshes: THREE.Mesh[]): void =>
  meshes.forEach((m) => {
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  });

describe("hybrid Ben", () => {
  test("keeps the current helmet, shoes, Stunner and phone and replaces the head and body once", () => {
    for (const name of ["Helmet_dome", "right_shoe", "left_shoe", "Stunner_purple_body", "Holster_band", "Phone_dark_back"])
      expect(named(name)).toHaveLength(1);
    for (const name of ["Head", "Neck", "Shirt_torso", "Jeans_continuous", "Belt", "right_arm_continuous", "left_arm_continuous", "Holster_strap"])
      expect(named(name)).toHaveLength(1);
    expect(named("Helmet_front_strap")).toHaveLength(2);
    expect(named("Blue_eye")).toHaveLength(2);
    expect(model.meshes.some((m) => /^fizz-emblem/.test(m.name))).toBe(false);
    expect(model.headStyle()).toBe("artifact");
    expect(model.print()).toBe("bubbles");
  });
  test("every vertex has finite normalised weights on the shared 26-bone rig", () => {
    expect(model.skeleton.bones).toHaveLength(config.bones.length);
    for (const mesh of model.meshes) {
      expect(mesh.skeleton).toBe(model.skeleton);
      const weights = mesh.geometry.getAttribute("skinWeight");
      for (let i = 0; i < weights.count; i++)
        expect(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)).toBeCloseTo(1, 5);
    }
    for (const pose of poseNames) {
      applyBenPose(model, pose, 0.3);
      for (const bone of model.skeleton.bones)
        expect(bone.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    }
  });
  test("disposing releases every geometry and material, and print swaps do not leak", () => {
    const spare = createHybridBenModel(svg),
      count = spare.meshes.length;
    for (const print of [...shirtPrints.slice(1), shirtPrints[0]]) {
      const old = spare.meshes.filter((m) => m.name.startsWith("Shirt_print_")),
        released = new Set<object>();
      for (const mesh of old) mesh.geometry.addEventListener("dispose", () => released.add(mesh));
      spare.setPrint(print.id);
      expect(spare.print()).toBe(print.id);
      expect(released.size).toBe(old.length);
      expect(spare.meshes.filter((m) => m.name.startsWith("Shirt_print_")).length).toBeGreaterThan(1);
    }
    expect(spare.meshes.length).toBe(count);
    const disposed = new Set<object>(),
      geometries = new Set(spare.meshes.map((m) => m.geometry)),
      materials = new Set(spare.meshes.flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material])));
    for (const item of [...geometries, ...materials]) item.addEventListener("dispose", () => disposed.add(item));
    spare.dispose();
    expect(disposed.size).toBe(geometries.size + materials.size);
  }, 60_000);
  test("the artboard head sits close on a short neck, on a skinny Codex body", () => {
    applyBenPose(model, "Standing");
    const head = restBox("Head"),
      helmet = restBox("Helmet_dome"),
      shirt = restBox("Shirt_torso"),
      floor = config.floorY,
      heads = (helmet.max.y - floor) / (helmet.max.y - head.min.y);
    expect(heads).toBeGreaterThan(3.5);
    expect(heads).toBeLessThan(3.9);
    // Shirt shoulders wider than the helmet, the helmet wider than the face.
    expect(shirt.max.x - shirt.min.x).toBeGreaterThan(helmet.max.x - helmet.min.x);
    expect(helmet.max.x - helmet.min.x).toBeGreaterThan(head.max.x - head.min.x);
    // A shorter neck than the current model's: under a unit of skin between collar and jaw at the front.
    const front = head.min.y - collarTop(0);
    expect(front).toBeGreaterThan(0.2);
    expect(front).toBeLessThan(0.8);
    const current = createBenModel(svg);
    try {
      const currentHead = current.meshes.find((m) => m.name === "Head")!;
      currentHead.geometry.computeBoundingBox();
      expect(front).toBeLessThan(currentHead.geometry.boundingBox!.min.y - 21.05);
    } finally {
      current.dispose();
    }
    // Skinny: the barrel torso is at most about five units wide at the belly and the belt sits on hips
    // that are wider than the waist above them.
    const torsoWidth = (y: number): number => {
      const positions = named("Shirt_torso")[0].geometry.getAttribute("position");
      let w = 0;
      for (let i = 0; i < positions.count; i++)
        if (Math.abs(positions.getY(i) - y) < 0.15 && Math.abs(positions.getX(i)) < 2.9)
          w = Math.max(w, 2 * Math.abs(positions.getX(i)));
      return w;
    };
    expect(torsoWidth(14.8)).toBeGreaterThan(4.6);
    expect(torsoWidth(14.8)).toBeLessThan(5.2);
    const jeans = restBox("Jeans_continuous");
    expect(jeans.max.x - jeans.min.x).toBeGreaterThan(torsoWidth(12));
  });
  test("the back runs smoothly from the collar to the waist, with no hump", () => {
    // The back silhouette seen from the side: the rearmost shirt surface at each height, found by rays
    // from behind. It must swell once, at the shoulder blades, and come forward steadily from there to
    // the waist and to the collar; and below the shoulders' rounding into the collar, no stretch may
    // stand out behind the chord between its neighbours by more than a gentle curve would.
    const shirt = named("Shirt_torso")[0],
      span = 0.8,
      problems: string[] = [];
    for (const [pose, phase] of [
      ["Standing", 0],
      ["Whistle", 0.5],
      ["Run", 0.25],
      ["Fall", 0.5],
    ] as const) {
      applyBenPose(model, pose, phase);
      const posed = snapshot(shirt).mesh,
        pelvis = model.bones.pelvis.matrixWorld,
        restPelvis = new THREE.Matrix4().makeTranslation(model.rest.pelvis).invert();
      for (const x of [-0.8, 0, 0.8]) {
        const back = (y: number): number => {
          // In the pelvis frame, so a run's lean does not tilt the measuring rays.
          const from = new THREE.Vector3(x, y, -10).applyMatrix4(restPelvis).applyMatrix4(pelvis),
            dir = new THREE.Vector3(0, 0, 1).transformDirection(pelvis),
            hit = new THREE.Raycaster(from, dir).intersectObject(posed)[0];
          return hit.distance - 10;
        };
        const heights = Array.from({ length: 83 }, (_, i) => 12 + i * 0.1),
          profile = heights.map(back),
          rearmost = profile.indexOf(Math.min(...profile)),
          where = `${pose} ${phase} x ${x}`,
          // Standing still the back is nearly straight; a run or a brace bends it at the spine joint.
          limit = pose === "Standing" || pose === "Whistle" ? 0.04 : 0.08;
        profile.forEach((z, i) => {
          const step = i > rearmost ? z - profile[i - 1] : i < rearmost ? z - profile[i + 1] : 0;
          if (step < -0.005) problems.push(`${where}: back swells again at y ${heights[i].toFixed(1)}`);
        });
        for (let y = 12.8; y <= 18.8; y += 0.2) {
          const bulge = back(y) - (back(y - span) + back(y + span)) / 2;
          if (bulge < -limit) problems.push(`${where}: lump of ${(-bulge).toFixed(3)} at y ${y.toFixed(1)}`);
        }
      }
      release([posed]);
    }
    expect(problems.slice(0, 6)).toEqual([]);
  }, 60_000);
  test("the Stunner and its holster ride on the right hip only", () => {
    applyBenPose(model, "Standing");
    for (const mesh of model.meshes.filter((m) => /^Stunner|^Holster/.test(m.name))) {
      mesh.geometry.computeBoundingBox();
      expect(mesh.geometry.boundingBox!.max.x).toBeLessThan(0);
    }
  });
  test("the helmet is fitted all round: the shell crowns about a unit above the skull, which never reaches the liner", () => {
    const helmet = restBox("Helmet_dome"),
      head = restBox("Head");
    expect(helmet.max.y - head.max.y).toBeGreaterThan(0.9);
    expect(helmet.max.y - head.max.y).toBeLessThan(1.25);
    const positions = named("Head")[0].geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      // Back in the head frame, where the helmet functions are defined.
      const x = positions.getX(i),
        y = positions.getY(i) + drop,
        z = positions.getZ(i);
      if (y > helmetRim(x, z)) expect(helmetInner(x, y, z)).toBeLessThan(-0.05);
    }
    // No floating: all round under the shell the skull lies within half a unit of the liner.
    for (let i = 0; i < 24; i++)
      for (const elevation of [0.25, 0.6, 1.0, 1.3]) {
        const a = (i / 24) * Math.PI * 2,
          dir = new THREE.Vector3(Math.sin(a) * Math.cos(elevation), Math.sin(elevation), Math.cos(a) * Math.cos(elevation)),
          c = new THREE.Vector3(...config.head.centre);
        let low = 0,
          high = 8;
        for (let k = 0; k < 30; k++) {
          const t = (low + high) / 2,
            p = c.clone().addScaledVector(dir, t);
          if (helmetInner(p.x, p.y, p.z) < 0) low = t;
          else high = t;
        }
        const liner = c.clone().addScaledVector(dir, low);
        if (liner.y < helmetRim(liner.x, liner.z) + 0.3) continue;
        expect(helmetOuter(liner.x, liner.y, liner.z)).toBeLessThan(0);
        const gap = hybridHeadField(liner.x, liner.y, liner.z);
        expect(gap).toBeGreaterThan(0.05);
        expect(gap).toBeLessThan(0.5);
      }
  });
  test("the belt wraps the shirt and jeans with no daylight above, below or around it", () => {
    applyBenPose(model, "Standing");
    const belt = named("Belt")[0],
      body = [named("Shirt_torso")[0], named("Jeans_continuous")[0]];
    for (let i = 0; i < 24; i++)
      for (const dy of [-0.3, 0, 0.3]) {
        const a = (i / 24) * Math.PI * 2,
          inward = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)),
          ray = new THREE.Raycaster(inward.clone().multiplyScalar(-10).setY(hybrid.beltY + dy), inward),
          beltHit = ray.intersectObject(belt)[0],
          bodyHit = ray.intersectObjects(body)[0];
        expect(beltHit).toBeDefined();
        const standOff = bodyHit.distance - beltHit.distance;
        expect(standOff).toBeGreaterThan(0.05);
        expect(standOff).toBeLessThan(0.3);
      }
  });
  test("neck, collar and shirt are watertight from every direction, including below, in moving poses", () => {
    const poses: [BenPose, number][] = [
      ["Standing", 0],
      ["Whistle", 0],
      ["Whistle", 0.25],
      ["Whistle", 0.5],
      ["Whistle", 0.75],
      ["Run", 0.25],
      ["Run", 0.75],
      ["Climb", 0.3],
      ["Fall", 0.5],
      ["Jump", 0.3],
      ["Firing", firing.fire],
      ["Phone", 0],
      ["Look up", 0.5],
      ["Look down", 0.5],
    ];
    const occluderNames = /^(Head|Helmet_|right_arm|left_arm|Sleeve_rolled_hem|Phone_|Stunner_|Mouth|Nose|Ear|Blue_eye|Eye_glint)/;
    for (const [pose, phase] of poses) {
      applyBenPose(model, pose, phase);
      const base = model.bones.neck.getWorldPosition(new THREE.Vector3()),
        up = new THREE.Vector3(0, 1, 0).applyQuaternion(model.bones.chest.getWorldQuaternion(new THREE.Quaternion())),
        centre = base.clone().addScaledVector(up, 0.4),
        shirt = snapshot(named("Shirt_torso")[0], centre, 9),
        neck = snapshot(named("Neck")[0], centre, 9),
        head = snapshot(named("Head")[0], centre, 9),
        occluders = model.meshes
          .filter((m) => occluderNames.test(m.name) && m.name !== "Head")
          .map((m) => snapshot(m, centre, 9).mesh),
        watched = [shirt, neck, head],
        all = [...watched.map((w) => w.mesh), ...occluders],
        problems: string[] = [];
      // Points inside the junction: on the neck axis and part-way out, from inside the shirt up to the jaw.
      const targets: THREE.Vector3[] = [];
      const toHead = model.bones.head.matrixWorld.clone().invert();
      const chest = model.bones.chest.matrixWorld,
        restChest = new THREE.Matrix4().makeTranslation(model.rest.chest).invert(),
        toChest = chest.clone().invert();
      for (const y of [20.0, 20.8, 21.4])
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2,
            r = 0.75;
          targets.push(
            new THREE.Vector3(r * Math.sin(a), y, hybrid.neck.z + r * Math.cos(a))
              .applyMatrix4(restChest)
              .applyMatrix4(chest),
          );
        }
      // And points just under the neck skin, a little below the collar's top edge all round.
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 - Math.PI,
          r = hybrid.neck.radius - 0.05;
        targets.push(
          new THREE.Vector3(r * Math.sin(a), collarTop(a) - 0.25, hybrid.neck.z + r * hybrid.neck.depth * Math.cos(a))
            .applyMatrix4(restChest)
            .applyMatrix4(chest),
        );
      }
      for (const target of targets)
        for (let i = 0; i < 12; i++)
          for (const elevation of [-55, -30, -10, 10, 30, 50]) {
            const a = (i / 12) * Math.PI * 2,
              e = THREE.MathUtils.degToRad(elevation),
              from = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)),
              origin = target.clone().addScaledVector(from, 6),
              direction = from.clone().negate(),
              local = origin
                .clone()
                .applyMatrix4(toHead)
                .add(model.rest.head)
                .add(new THREE.Vector3(0, drop, 0)),
              hit = new THREE.Raycaster(origin, direction, 0, 6).intersectObjects(all)[0];
            // A camera inside the head sees nothing of the neck; such origins are not views.
            if (hybridHeadField(local.x, local.y, local.z) < 0.05) continue;
            // Nor does one inside an arm or the shirt: a ray leaving such an origin crosses that solid's
            // surface an odd number of times.
            const leaving = new THREE.Raycaster(origin, from).intersectObjects(all),
              crossings = new Map<object, number>();
            for (const h of leaving) crossings.set(h.object, (crossings.get(h.object) ?? 0) + 1);
            if ([...crossings.values()].some((n) => n % 2 === 1)) continue;
            const where = `${pose} ${phase} az ${Math.round((a * 180) / Math.PI)} el ${elevation}`;
            // The point lies inside the neck, so the way in must cross a surface first.
            if (!hit) {
              problems.push("see-through " + where);
              continue;
            }
            const owner = watched.find((w) => w.mesh === hit.object);
            // Meeting the inside of a shell means looking through a gap into it.
            // Only the neckline counts: folds in a raised arm's armpit lie further out and are checked by
            // the sleeve coverage test instead.
            const offAxis = hit.point.clone().sub(base);
            offAxis.addScaledVector(up, -offAxis.dot(up));
            if (
              owner &&
              offAxis.length() < 2.4 &&
              owner.front[hit.faceIndex!] * hit.face!.normal.dot(direction) > 0
            )
              problems.push(`inside ${hit.object === shirt.mesh ? "shirt" : hit.object === neck.mesh ? "neck" : "head"} ` + where + " at " + hit.point.toArray().map((v) => v.toFixed(2)).join(","));
            // Bare neck skin may only show above the collar's top edge: below it the band hides it.
            if (hit.object === neck.mesh) {
              const rest = hit.point.clone().applyMatrix4(toChest).add(model.rest.chest),
                a = Math.atan2(rest.x, rest.z - hybrid.neck.z);
              if (rest.y < collarTop(a) - 0.1)
                problems.push("bare neck below the collar " + where + " at " + rest.toArray().map((v) => v.toFixed(2)).join(","));
            }
          }
      release(all);
      expect({ pose, phase, problems: problems.slice(0, 8), count: problems.length }).toEqual({
        pose,
        phase,
        problems: [],
        count: 0,
      });
    }
  }, 240_000);
  test("the neck below the collar stays inside the shirt, and the collar sinks into it all round", () => {
    applyBenPose(model, "Standing");
    const neck = named("Neck")[0].geometry.getAttribute("position"),
      shirt = named("Shirt_torso")[0],
      p = new THREE.Vector3();
    let below = 0;
    for (let i = 0; i < neck.count; i++) {
      p.fromBufferAttribute(neck, i);
      if (p.y > 20.0) continue;
      below++;
      // A ray straight out from the neck axis meets shirt fabric before open air.
      const out = new THREE.Vector3(p.x, 0, p.z - hybrid.neck.z).normalize(),
        hits = new THREE.Raycaster(p, out, 0, 6).intersectObject(shirt);
      expect(hits.length).toBeGreaterThan(0);
    }
    expect(below).toBeGreaterThan(500);
    // The hand-built neck tube winds outward, as the sculpted surfaces do, so the watertight sweep can
    // tell an outside face from a view into a gap.
    const normals = named("Neck")[0].geometry.getAttribute("normal"),
      n = new THREE.Vector3();
    for (let i = 0; i < neck.count; i += 7) {
      p.fromBufferAttribute(neck, i);
      n.fromBufferAttribute(normals, i);
      expect(n.x * p.x + n.z * (p.z - hybrid.neck.z)).toBeGreaterThan(0);
    }
    // So does the collar roll, part of the shirt mesh: its top lip faces up and its skirt outwards.
    const shirtPositions = shirt.geometry.getAttribute("position"),
      shirtNormals = shirt.geometry.getAttribute("normal");
    let lips = 0;
    for (let i = 0; i < shirtPositions.count; i++) {
      p.fromBufferAttribute(shirtPositions, i);
      const r = Math.hypot(p.x, (p.z - hybrid.neck.z) / hybrid.neck.depth),
        a = Math.atan2(p.x, p.z - hybrid.neck.z);
      if (Math.abs(r - (hybrid.neck.radius + 0.08)) < 0.06 && Math.abs(p.y - collarTop(a)) < 0.06) {
        lips++;
        expect(n.fromBufferAttribute(shirtNormals, i).y).toBeGreaterThan(0.5);
      }
    }
    expect(lips).toBeGreaterThan(20);
  }, 60_000);
  test("sleeves keep the upper-arm skin covered as the arms move", () => {
    const arms = (["right", "left"] as const).map((side) => {
      const shoulder = model.rest[side + "UpperArm"],
        elbow = model.rest[side + "Forearm"],
        axis = elbow.clone().sub(shoulder),
        length = axis.length(),
        sign = side === "right" ? -1 : 1,
        positions = named(side + "_arm_continuous")[0].geometry.getAttribute("position"),
        chosen: number[] = [],
        p = new THREE.Vector3();
      axis.normalize();
      for (let i = 0; i < positions.count; i++) {
        p.fromBufferAttribute(positions, i);
        const along = p.clone().sub(shoulder).dot(axis),
          radial = p.clone().sub(shoulder).addScaledVector(axis, -along);
        if (along > 0.9 && along < 0.6 * length - 0.7 && radial.x * sign > -0.2 * radial.length()) chosen.push(i);
      }
      const step = Math.max(1, Math.floor(chosen.length / 40));
      return { side, samples: chosen.filter((_, i) => i % step === 0) };
    });
    for (const [pose, phase] of [
      ["Standing", 0],
      ["Run", 0.25],
      ["Run", 0.75],
      ["Climb", 0.3],
      ["Fall", 0.5],
      ["Jump", 0.3],
      ["Firing", firing.fire],
      ["Phone", 0],
    ] as const) {
      applyBenPose(model, pose, phase);
      const fabric = [snapshot(named("Shirt_torso")[0]).mesh, ...named("Sleeve_rolled_hem").map((m) => snapshot(m).mesh)],
        exposed: string[] = [];
      for (const arm of arms) {
        const skin = snapshot(named(arm.side + "_arm_continuous")[0]).mesh,
          s = model.bones[arm.side + "UpperArm"].getWorldPosition(new THREE.Vector3()),
          e = model.bones[arm.side + "Forearm"].getWorldPosition(new THREE.Vector3()),
          line = new THREE.Line3(s, e),
          closest = new THREE.Vector3(),
          p = new THREE.Vector3();
        for (const i of arm.samples) {
          named(arm.side + "_arm_continuous")[0].getVertexPosition(i, p);
          line.closestPointToPoint(p, true, closest);
          const out = p.clone().sub(closest).normalize();
          for (const direction of [out, out.clone().add(new THREE.Vector3(0, -0.7, 0)).normalize()]) {
            const hit = new THREE.Raycaster(p.clone().addScaledVector(direction, 6), direction.clone().negate()).intersectObjects([...fabric, skin])[0];
            if (hit && hit.object === skin && hit.point.distanceTo(p) < 0.08) exposed.push(arm.side + " " + p.toArray().map((v) => v.toFixed(2)));
          }
        }
        release([skin]);
      }
      release(fabric);
      expect({ pose, exposed }).toEqual({ pose, exposed: [] });
    }
  }, 180_000);
});
