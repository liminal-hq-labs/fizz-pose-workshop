// Builds the cartoon Ben figure: skeleton, skinned body, head, hands, runners, gear and props.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as T from "three";
import type { Spec, AddOptions, Ring, Joints, Parts, Props, Fig } from "./types.ts";
import { PI, sin, cos, toonRamp, inkMaterial, benGScale, V } from "./shared.ts";
import { fizzColours, joints, jointIndex, paletteColour } from "./spec.ts";

export function buildRig(P: Spec): Fig {
  const C = P.col;
  const mats: Record<number, T.Material> = {};
  const FZ = fizzColours[P.fizz];
  const pickables: T.Object3D[] = [];
  function M(c: number | T.Material): T.Material {
    if (typeof c !== "number") return c;
    let made = mats[c];
    if (!made) made = mats[c] = new T.MeshToonMaterial({ color: c, gradientMap: toonRamp });
    return made;
  }
  const hidden = new T.MeshBasicMaterial({ visible: false });
  function add(
    parent: T.Object3D,
    geo: T.BufferGeometry,
    col: number | T.Material,
    o?: AddOptions,
  ): T.Mesh {
    o = o || {};
    const m = new T.Mesh(geo, M(col));
    if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
    if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
    if (o.s !== undefined) {
      if (typeof o.s === "number") m.scale.setScalar(o.s);
      else m.scale.set(o.s[0], o.s[1], o.s[2]);
    }
    m.castShadow = o.shadow !== false && col !== hidden;
    parent.add(m);
    if (o.pick !== false) pickables.push(m);
    if (o.line !== false && P.line > 0 && col !== hidden) {
      geo.computeBoundingBox();
      const sz = new T.Vector3();
      geo.boundingBox!.getSize(sz);
      const ol = new T.Mesh(geo, o.lm || inkMaterial);
      const w = 2 * P.line * (o.lw || 1);
      ol.userData.ol = true;
      ol.scale.set(
        1 + w / Math.max(sz.x * m.scale.x, 0.3),
        1 + w / Math.max(sz.y * m.scale.y, 0.3),
        1 + w / Math.max(sz.z * m.scale.z, 0.3),
      );
      m.add(ol);
    }
    return m;
  }
  function grp(parent: T.Object3D, p?: number[] | null, jname?: string): T.Object3D {
    const g = jname ? new T.Bone() : new T.Group();
    if (p) g.position.set(p[0], p[1], p[2]);
    parent.add(g);
    if (jname) {
      g.userData.joint = jname;
      J[jname] = g;
    }
    return g;
  }
  const sph = function (r: number) {
    return new T.SphereGeometry(r, 24, 18);
  };
  const unit = sph(1);
  const cyl = function (rt: number, rb: number, h: number, n?: number) {
    return new T.CylinderGeometry(rt, rb, h, n || 18);
  };
  const box = function (x: number, y: number, z: number) {
    return new T.BoxGeometry(x, y, z);
  };
  const capG = function (r: number, len: number) {
    return new T.CapsuleGeometry(r, len, 4, 12);
  };
  function ell(
    parent: T.Object3D,
    col: number | T.Material,
    p: number[],
    radii: number[],
    o?: AddOptions,
  ): T.Mesh {
    o = o || {};
    o.p = p;
    o.s = radii;
    return add(parent, unit, col, o);
  }
  function rod(
    parent: T.Object3D,
    a: number[],
    b: number[],
    r: number,
    col: number | T.Material,
    o?: AddOptions,
  ): T.Mesh {
    const va = V(a[0], a[1], a[2]);
    const vb = V(b[0], b[1], b[2]);
    const d = vb.clone().sub(va);
    const m = add(parent, cyl(r, r, d.length(), 8), col, o);
    m.position.copy(va).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    return m;
  }

  const J: Joints = {};
  const X = {} as Parts;
  const root = new T.Group();
  const W = P.tW;
  const D = P.tD;
  const hs = P.hs;
  const s0 = P.seg[0];
  const s1 = P.seg[1];
  const s2 = P.seg[2];
  const Tt = s0 + s1 + s2;
  const yS = s0 + s1 + P.shUp;
  const A = P.aU + P.aL;
  const Lg = P.legU + P.legL;
  const restY = P.ank + Lg * 0.992 + 0.3;

  const pelvis = grp(root, [0, restY, 0], "pelvis");
  const spine = grp(pelvis, [0, s0, 0], "spine");
  const chest = grp(spine, [0, s1, 0], "chest");
  const neck = grp(chest, [0, s2, 0], "neck");
  const head = grp(neck, [0, P.neck, 0], "head");
  [1, -1].forEach((s) => {
    const up = grp(chest, [s * P.sw, P.shUp, 0], "armU" + s);
    const lo = grp(up, [0, -P.aU, 0], "armL" + s);
    grp(lo, [0, -P.aL, 0], "hand" + s);
    const lu = grp(pelvis, [s * P.hipHalf, -0.3, 0], "legU" + s);
    const ll = grp(lu, [0, -P.legU, 0], "legL" + s);
    grp(ll, [0, -P.legL, 0], "foot" + s);
  });
  const bones = joints.map((j) => {
    return J[j[0]];
  });
  root.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(bones as T.Bone[]);

  /* skinned body */
  const N = 24;
  const sstep = function (x: number) {
    x = Math.min(1, Math.max(0, x));
    return x * x * (3 - 2 * x);
  };
  const skinMat = new T.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp });
  function skinned(rings: Ring[]): void {
    const pos: number[] = [];
    const col: number[] = [];
    const colE: number[] = [];
    const si: number[] = [];
    const sw: number[] = [];
    const idx: number[] = [];
    const c = new T.Color();
    const n = rings.length;
    rings.forEach((r) => {
      for (let j = 0; j < N; j++) {
        const th = (2 * PI * j) / N;
        pos.push(r.c[0] + r.rx * cos(th), r.c[1], r.c[2] + r.rz * sin(th));
        const hx = r.colAt ? r.colAt(j) : r.col!;
        c.setHex(hx);
        col.push(c.r, c.g, c.b);
        c.setHex(paletteColour(hx, C));
        colE.push(c.r, c.g, c.b);
        si.push(r.w[0][0], r.w[1][0], 0, 0);
        sw.push(r.w[0][1], r.w[1][1], 0, 0);
      }
    });
    let i = 0;
    let j = 0;
    for (i = 0; i < n - 1; i++)
      for (j = 0; j < N; j++) {
        const a = i * N + j;
        const b = i * N + ((j + 1) % N);
        const d = a + N;
        const e = b + N;
        if (!rings[i].flip) idx.push(a, d, b, b, d, e);
        else idx.push(a, b, d, b, e, d);
      }
    const nor = new Float32Array(pos.length);
    const P3 = function (i: number, j: number) {
      const k = (i * N + ((j + N) % N)) * 3;
      return V(pos[k], pos[k + 1], pos[k + 2]);
    };
    for (i = 0; i < n; i++)
      for (j = 0; j < N; j++) {
        let lo = i;
        let hi = i;
        while (lo > 0 && (lo === i || P3(lo, j).distanceToSquared(P3(i, j)) < 1e-6)) lo--;
        while (hi < n - 1 && (hi === i || P3(hi, j).distanceToSquared(P3(i, j)) < 1e-6)) hi++;
        const du = P3(hi, j).sub(P3(lo, j));
        const dv = P3(i, j + 1).sub(P3(i, j - 1));
        const nn = new T.Vector3().crossVectors(dv, du);
        const rad = P3(i, j).sub(V(rings[i].c[0], rings[i].c[1], rings[i].c[2]));
        if (nn.lengthSq() < 1e-8) nn.copy(du).multiplyScalar(i < n / 2 ? -1 : 1);
        nn.normalize();
        if (rad.lengthSq() > 1e-4 && nn.dot(rad) < 0) nn.multiplyScalar(-1);
        const k = (i * N + j) * 3;
        nor[k] = nn.x;
        nor[k + 1] = nn.y;
        nor[k + 2] = nn.z;
      }
    function make(positions: number[], mat: T.Material): T.SkinnedMesh {
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      g.setAttribute("normal", new T.BufferAttribute(nor, 3));
      g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
      g.setAttribute("colorEga", new T.Float32BufferAttribute(colE, 3));
      g.setAttribute("skinIndex", new T.Uint16BufferAttribute(si, 4));
      g.setAttribute("skinWeight", new T.Float32BufferAttribute(sw, 4));
      g.setIndex(idx);
      const m = new T.SkinnedMesh(g, mat);
      m.frustumCulled = false;
      root.add(m);
      m.updateMatrixWorld(true);
      m.bind(skeleton, m.matrixWorld);
      return m;
    }
    make(pos, skinMat).castShadow = true;
    if (P.line > 0)
      make(
        pos.map((v, k) => {
          return v + nor[k] * P.line * 1.6;
        }),
        inkMaterial,
      ).userData.ol = true;
  }
  const chain: [number, string, string, number][] = [
    [s0, "pelvis", "spine", 1.3],
    [s0 + s1, "spine", "chest", 1.3],
    [Tt, "chest", "neck", 0.6],
    [Tt + P.neck, "neck", "head", 0.5],
  ];
  function tw(y: number): number[][] {
    let best = chain[0];
    chain.forEach((b) => {
      if (Math.abs(y - b[0]) < Math.abs(y - best[0])) best = b;
    });
    const t = sstep((y - (best[0] - best[3])) / (2 * best[3]));
    return [
      [jointIndex[best[1]], 1 - t],
      [jointIndex[best[2]], t],
    ];
  }
  const nk = Math.max(hs, 0.9);
  const SH = C.shirt;
  const SD = C.shirtD;
  /* shirt runs unbroken from hem to collar; the white band at the neck is part of it */
  const TR = [
    [-2.0, 0.05, 0.05, 0, C.jeans],
    [-1.7, W * 0.3, D * 0.33, 0, C.jeans],
    [-1.0, W * 0.45, D * 0.45, 0, C.jeans],
    [0, W * 0.47, D * 0.47, 0, C.jeans],
    [1.0, W * 0.455, D * 0.45, 0, C.jeans],
    [1.0, W * 0.48, D * 0.475, 0, SD],
    [1.28, W * 0.48, D * 0.475, 0, SD],
    [1.28, W * 0.475, D * 0.47, 0, SH],
    [1.8, W * 0.465, D * 0.465, 0.02, SH],
    [Tt * 0.36, W * 0.42, D * 0.43, 0.03, SH],
    [Tt * 0.52, W * 0.445, D * 0.47, 0.08, SH],
    [yS - 1.9, W * 0.5, D * 0.5, 0.12, SH],
    [yS - 1.0, W * 0.56, D * 0.49, 0.1, SH],
    [yS - 0.35, P.sw * 1.0, D * 0.46, 0.05, SH],
    [yS + 0.25, P.sw * 0.88, D * 0.43, 0, SH],
    [yS + 0.8, 2.2, 1.8, -0.05, SH],
    [Tt - 0.3, 1.5 * nk, 1.45 * nk, 0, SH],
    [Tt - 0.3, 1.56 * nk, 1.5 * nk, 0, 0xffffff],
    [Tt + 0.22, 1.4 * nk, 1.36 * nk, 0, 0xffffff],
    [Tt + 0.22, 1.1 * nk, 1.07 * nk, 0, C.skin],
    [Tt + P.neck + 0.7, 1.0 * nk, 1.0 * nk, 0, C.skin],
    [Tt + P.neck + 1.0, 0.05, 0.05, 0, C.skin],
  ];
  skinned(
    TR.map((r) => {
      return { c: [0, restY + r[0], r[3]], rx: r[1], rz: r[2], col: r[4], w: tw(r[0]) };
    }),
  );
  [1, -1].forEach((s) => {
    const r = P.armR;
    const hem = P.aU * 0.56;
    const top = [s * P.sw, restY + yS, 0];
    const pj = jointIndex.chest;
    const uj = jointIndex["armU" + s];
    const lj = jointIndex["armL" + s];
    const hj = jointIndex["hand" + s];
    const prof = [
      [-0.85, 0.05, SH],
      [-0.6, 0.62, SH],
      [-0.2, 0.95, SH],
      [0.4, 1.04, SH],
      [hem * 0.6, 1.02, SH],
      [hem - 0.32, 1.02, SH],
      [hem - 0.32, 1.05, SD],
      [hem, 1.05, SD],
      [hem, r * 0.97, C.skin],
    ];
    [-1.2, -0.75, -0.35, 0, 0.35, 0.75, 1.2].forEach((o) => {
      prof.push([P.aU + o, r * (0.93 - 0.02 * o), C.skin]);
    });
    prof.push(
      [P.aU + P.aL * 0.6, r * 0.8, C.skin],
      [A - 0.5, r * 0.7, C.skin],
      [A + 0.15, r * 0.66, C.skin],
      [A + 0.4, 0.05, C.skin],
    );
    skinned(
      prof.map((q) => {
        const d = q[0];
        let w;
        if (d < P.aU * 0.5) {
          const t0 = sstep((d + 0.85) / 1.9);
          w = [
            [pj, (1 - t0) * 0.75],
            [uj, 1 - (1 - t0) * 0.75],
          ];
        } else if (d < A - 1.2) {
          const t = sstep((d - (P.aU - 1.1)) / 2.2);
          w = [
            [uj, 1 - t],
            [lj, t],
          ];
        } else {
          const t2 = sstep((d - (A - 0.6)) / 1.0);
          w = [
            [lj, 1 - t2],
            [hj, t2],
          ];
        }
        return {
          c: [top[0] - (d < 0 ? s * 0.45 * (-d / 0.85) : 0), top[1] - d, 0],
          rx: q[1],
          rz: q[1],
          col: q[2],
          w,
          flip: true,
        };
      }),
    );
  });
  [1, -1].forEach((s) => {
    const r = P.legR;
    const top = [s * P.hipHalf, restY - 0.3, 0];
    const pj = jointIndex.pelvis;
    const uj = jointIndex["legU" + s];
    const lj = jointIndex["legL" + s];
    const fj = jointIndex["foot" + s];
    const sj = (N / 4 + (s > 0 ? 1.5 : -0.5)) | 0;
    const oj = s > 0 ? 0 : N / 2;
    const prof = [
      [-1.0, 0.05],
      [-0.6, r * 0.78],
      [0.2, r * 1.04],
      [P.legU * 0.5, r * 0.96],
    ];
    [-1.3, -0.8, -0.4, 0, 0.4, 0.8, 1.3].forEach((o) => {
      prof.push([P.legU + o, r * (0.87 - 0.015 * o)]);
    });
    prof.push(
      [P.legU + P.legL * 0.55, r * 0.8],
      [Lg - 1.15, r * 0.77],
      [Lg - 1.15, r * 0.79],
      [Lg - 0.6, r * 0.76],
      [Lg - 0.4, r * 0.3],
    );
    skinned(
      prof.map((q, qi) => {
        const d = q[0];
        let w;
        if (d < P.legU * 0.5) {
          const t0 = sstep((d + 1.0) / 2.4);
          w = [
            [pj, (1 - t0) * 0.8],
            [uj, 1 - (1 - t0) * 0.8],
          ];
        } else if (d < Lg - 1.5) {
          const t = sstep((d - (P.legU - 1.2)) / 2.4);
          w = [
            [uj, 1 - t],
            [lj, t],
          ];
        } else {
          const t2 = sstep((d - (Lg - 1.0)) / 1.2) * 0.6;
          w = [
            [lj, 1 - t2],
            [fj, t2],
          ];
        }
        const hemBand = qi >= prof.length - 3;
        const mid = d > 0.3 && d < Lg - 1.2;
        return {
          c: [top[0], top[1] - d, 0],
          rx: q[1],
          rz: q[1],
          w,
          flip: true,
          colAt(j) {
            const st = (P.jeans === "stripe" || P.jeans === "both") && j === sj && mid;
            const se = P.jeans === "seam" || P.jeans === "both";
            if (st) return C.stripe;
            if (se) return hemBand ? C.jeansD : j === oj && d > -0.2 ? C.jeansD : C.jeans;
            return C.jeans;
          },
        };
      }),
    );
  });
  add(pelvis, box(W, 3.4, D), hidden, { p: [0, -0.3, 0] });
  add(spine, box(W * 0.9, s1, D * 0.9), hidden, { p: [0, s1 * 0.5, 0] });
  add(chest, box(W, 3.6, D), hidden, { p: [0, 1.5, 0] });
  [1, -1].forEach((s) => {
    add(J["armU" + s], cyl(1.05, 1.05, P.aU, 8), hidden, { p: [0, -P.aU / 2, 0] });
    add(J["armL" + s], cyl(0.9, 0.9, P.aL, 8), hidden, { p: [0, -P.aL / 2, 0] });
    add(J["legU" + s], cyl(1.15, 1.15, P.legU, 8), hidden, { p: [0, -P.legU / 2, 0] });
    add(J["legL" + s], cyl(1.0, 1.0, P.legL, 8), hidden, { p: [0, -P.legL / 2, 0] });
  });

  /* belt, pockets, chest print */
  add(pelvis, new T.TorusGeometry(W * 0.455, 0.3, 8, 24), C.belt, {
    p: [0, 1.0, 0],
    r: [Math.PI / 2, 0, 0],
    s: [1, D / W, 1],
    line: false,
  });
  add(pelvis, box(0.9, 0.75, 0.3), 0xffff55, { p: [0, 1.0, D * 0.455 + 0.22], line: false });
  if (P.jeans !== "plain")
    [1, -1].forEach((s) => {
      add(pelvis, box(1.5, 1.45, 0.14), C.jeansD, {
        p: [s * 1.22, -0.35, -(D * 0.43)],
        r: [0.12, 0, 0],
        line: false,
      });
      add(pelvis, box(1.26, 1.2, 0.16), C.jeans, {
        p: [s * 1.22, -0.3, -(D * 0.43) - 0.02],
        r: [0.12, 0, 0],
        line: false,
      });
      add(pelvis, new T.TorusGeometry(0.8, 0.07, 5, 10, PI / 2), C.jeansD, {
        p: [s * 2.05, 0.75, D * 0.36],
        r: [0, s * 0.5, s > 0 ? PI : -PI / 2],
        line: false,
      });
    });
  const ez = D * 0.5 + 0.1;
  const ey = P.shUp - 1.75;
  [
    [-0.55, -0.3, 0.75],
    [0.6, 0.15, 0.55],
    [-0.1, 0.85, 0.4],
  ].forEach((b) => {
    add(chest, cyl(b[2], b[2], 0.14, 20), 0x8a4a12, {
      p: [b[0], ey + b[1], ez - 0.05],
      r: [Math.PI / 2, 0, 0],
      line: false,
    });
    add(chest, cyl(b[2] * 0.78, b[2] * 0.78, 0.18, 20), 0xffe34d, {
      p: [b[0], ey + b[1], ez - 0.03],
      r: [Math.PI / 2, 0, 0],
      line: false,
    });
    add(chest, sph(b[2] * 0.2), 0xffffff, {
      p: [b[0] - b[2] * 0.3, ey + b[1] + b[2] * 0.3, ez + 0.07],
      line: false,
    });
  });

  /* head */
  const hd = grp(head);
  hd.scale.setScalar(hs);
  ell(hd, C.skin, [0, 3.7, -0.05], [3.0, 3.45, 3.7], { lw: 0.6 });
  ell(hd, C.skin, [0, 2.0, 0.75], [2.45, 2.65, 2.75], { lw: 0.6 });
  [1, -1].forEach((s) => {
    ell(hd, C.skin, [s * 2.95, 3.2, -0.1], [0.35, 0.75, 0.55], { lw: 0.5 });
  });
  add(
    hd,
    new T.SphereGeometry(1, 24, 16, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.7),
    C.hair,
    { p: [0, 3.75, -0.1], s: [3.12, 3.58, 3.85], line: false },
  );
  add(hd, new T.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.38), C.hair, {
    p: [0, 3.75, -0.1],
    s: [3.13, 3.6, 3.86],
    line: false,
  });
  [-1, 0, 1].forEach((i) => {
    add(hd, new T.ConeGeometry(0.55, 1.5, 6), C.hair, {
      p: [i * 0.95 + 0.3, 4.75, 3.25],
      r: [Math.PI - 0.25, 0, 0.35 + i * 0.1],
      line: false,
    });
  });
  [1, -1].forEach((s) => {
    [
      [5.0, 0.93],
      [4.25, 0.99],
      [3.5, 0.99],
      [2.8, 0.96],
      [2.2, 0.9],
    ].forEach((q, i) => {
      ell(hd, C.hair, [s * 2.52 * q[1], q[0], 1.95 * q[1] + (i % 2) * 0.22], [0.16, 0.5, 0.42], {
        line: false,
      });
    });
  });
  const hairTop = (X.hairTop = grp(hd));
  hairTop.visible = !P.helmet;
  X.hd = hd;
  [
    [0.4, 7.2, 0.6, 0.5, -0.5],
    [-0.5, 7.25, -0.2, -0.3, 0.4],
    [0.1, 7.0, 1.6, 0.9, -0.2],
    [1.3, 6.7, 0.9, 0.6, -0.9],
    [-1.4, 6.6, 0.7, 0.6, 0.9],
    [0, 6.6, -2.2, -0.9, 0],
  ].forEach((c) => {
    add(hairTop, new T.ConeGeometry(0.7, 1.5, 6), C.hair, {
      p: [c[0], c[1], c[2]],
      r: [c[3], 0, c[4]],
      line: false,
    });
  });
  [-1.6, -0.5, 0.7, 1.7].forEach((x, i) => {
    add(hairTop, new T.ConeGeometry(0.62, 1.5, 6), C.hair, {
      p: [x, 5.3, 3.0 - Math.abs(x) * 0.3],
      r: [Math.PI - 0.5, 0, 0.3 + (i - 1.5) * 0.12],
      line: false,
    });
  });
  const eyes = grp(hd);
  X.eyes = eyes;
  const ek = P.eye;
  X.brows = {};
  X.lids = {};
  X.iris = {};
  [1, -1].forEach((s) => {
    const x = s * 1.15;
    const y = 3.55;
    const z = 3.32;
    ell(eyes, 0xffffff, [x, y, z - 0.05], [0.6 * ek, 0.72 * ek, 0.22], { line: false });
    const ir = (X.iris[s] = grp(eyes));
    ell(ir, C.eye, [x + 0.05, y - 0.02, z + 0.1], [0.36 * ek, 0.44 * ek, 0.14], { line: false });
    ell(ir, 0x15152a, [x + 0.07, y - 0.02, z + 0.19], [0.18 * ek, 0.22 * ek, 0.08], {
      line: false,
    });
    ell(ir, 0xffffff, [x + 0.2 * ek, y + 0.2 * ek, z + 0.24], [0.1, 0.1, 0.05], { line: false });
    const br = (X.brows[s] = grp(hd, [x, y + 1.0, z + 0.05]));
    br.userData.y = y + 1.0;
    add(br, box(0.95, 0.2, 0.2), C.hair, { r: [-0.25, 0, 0], line: false });
    X.lids[s] = ell(hd, C.skin, [x, y + 0.62, z + 0.0], [0.7 * ek, 0.42 * ek, 0.34], {
      line: false,
    });
    X.lids[s].visible = false;
    if (P.cheeks === "soft")
      ell(hd, 0xf3ae96, [s * 1.8, 2.3, 2.72], [0.5, 0.3, 0.1], { line: false });
    if (P.cheeks === "line")
      add(hd, new T.TorusGeometry(0.42, 0.045, 5, 10, PI * 0.6), 0xd9966f, {
        p: [s * 1.75, 2.55, 2.86],
        r: [0, s * 0.45, s > 0 ? -PI * 0.75 : -PI * 0.85],
        line: false,
      });
  });
  ell(hd, C.skin, [0, 2.7, 3.62], [0.34, 0.34, 0.34], { line: false });
  const mouths: Record<string, T.Object3D> = (X.mouths = {});
  mouths.smile = add(hd, new T.TorusGeometry(0.72, 0.14, 6, 14, Math.PI), C.mouth, {
    p: [0, 1.75, 3.33],
    r: [0.18, 0, Math.PI],
    line: false,
  });
  mouths.o = grp(hd, [0, 1.5, 3.42]);
  add(mouths.o, new T.TorusGeometry(0.3, 0.12, 6, 14), C.mouth, { line: false });
  ell(mouths.o, 0x3a0f14, [0, 0, -0.02], [0.28, 0.28, 0.08], { line: false });
  mouths.open = grp(hd, [0, 1.45, 3.36]);
  ell(mouths.open, 0x4a1016, [0, 0, 0], [0.62, 0.48, 0.14], { line: false });
  add(mouths.open, box(0.8, 0.16, 0.1), 0xffffff, { p: [0, 0.27, 0.08], line: false });
  ell(mouths.open, C.mouth, [0, -0.2, 0.06], [0.36, 0.18, 0.08], { line: false });
  mouths.grit = add(hd, new T.TorusGeometry(1.9, 0.12, 6, 12, 0.52), C.mouth, {
    p: [0.08, 3.42, 3.36],
    r: [0.05, 0, -PI / 2 - 0.2],
    line: false,
  });
  mouths.frown = add(hd, new T.TorusGeometry(0.5, 0.13, 6, 14, Math.PI * 0.8), C.mouth, {
    p: [0, 1.12, 3.5],
    r: [-0.25, 0, PI * 0.1],
    line: false,
  });

  /* helmet: a foam shell with thickness, a teardrop tail, a centre stripe and vents that are painted or cut through */
  if (P.helmet) {
    const hg = (X.helmet = grp(hd));
    const helm = grp(hg, [0, 3.95, -0.1]);
    helm.rotation.x = -0.16;
    const VENTS: number[][] = [];
    [-0.95, -0.5, 0.5, 0.95].forEach((a) => {
      [0.6, -0.45].forEach((b) => {
        const o = Math.abs(a) > 0.7;
        VENTS.push([a, b * (o ? 0.8 : 1), 0.1, o ? 0.2 : 0.27]);
      });
    });
    const TAIL = 1.17;
    const cut = P.vents === "holes";
    let ventTex = null;
    if (cut) {
      /* the vents are an alpha mask, so their edges are as smooth as the texture */
      const vc = document.createElement("canvas");
      vc.width = 1024;
      vc.height = 256;
      const vx = vc.getContext("2d")!;
      const im = vx.createImageData(1024, 256);
      for (let ty = 0; ty < 256; ty++)
        for (let tx = 0; tx < 1024; tx++) {
          const th0 = (((ty + 0.5) / 256) * PI) / 2;
          const ph0 = ((tx + 0.5) / 1024) * 2 * PI;
          const xx0 = sin(th0) * cos(ph0);
          const yy0 = cos(th0);
          const zz0 = sin(th0) * sin(ph0);
          const aa = Math.asin(xx0);
          const bb = Math.atan2(zz0, yy0);
          let dm = 9;
          for (let vi = 0; vi < VENTS.length; vi++) {
            const q = VENTS[vi];
            const da = (aa - q[0]) / q[2];
            const db = (bb - q[1]) / q[3];
            dm = Math.min(dm, Math.sqrt(da * da + db * db));
          }
          const val = 255 * Math.min(1, Math.max(0, (dm - 0.94) / 0.12));
          const oi = (ty * 1024 + tx) * 4;
          im.data[oi] = im.data[oi + 1] = im.data[oi + 2] = val;
          im.data[oi + 3] = 255;
        }
      vx.putImageData(im, 0, 0);
      ventTex = new T.CanvasTexture(vc);
      ventTex.flipY = false;
      ventTex.wrapS = T.RepeatWrapping;
    }
    const shellGeo = function (striped: boolean) {
      const holes = P.vents === "mesh";
      const nu = holes ? 220 : 72;
      const nv = holes ? 70 : 26;
      const pos = [];
      const col = [];
      const colE = [];
      const uv = [];
      const idx = [];
      const cg = new T.Color(C.helmet);
      const cw = new T.Color(0xffffff);
      const cd = new T.Color(C.helmetD);
      const eg = new T.Color(0x00aa00);
      let v = 0;
      let u = 0;
      for (v = 0; v <= nv; v++)
        for (u = 0; u <= nu; u++) {
          const th = ((v / nv) * PI) / 2;
          const ph = (u / nu) * 2 * PI;
          const x = sin(th) * cos(ph);
          const y = cos(th);
          const z = sin(th) * sin(ph);
          const wh = striped && Math.abs(Math.asin(x)) < 0.105;
          pos.push(x, y, z < 0 ? z * TAIL : z);
          uv.push(u / nu, v / nv);
          const c = striped ? (wh ? cw : cg) : cd;
          const e = wh ? cw : eg;
          col.push(c.r, c.g, c.b);
          colE.push(e.r, e.g, e.b);
        }
      for (v = 0; v < nv; v++)
        for (u = 0; u < nu; u++) {
          const a = v * (nu + 1) + u;
          const b2 = a + 1;
          const d = a + nu + 1;
          const e2 = d + 1;
          if (holes) {
            const tc = (((v + 0.5) / nv) * PI) / 2;
            const pc = ((u + 0.5) / nu) * 2 * PI;
            const xa = Math.asin(sin(tc) * cos(pc));
            const xb = Math.atan2(sin(tc) * sin(pc), cos(tc));
            let ins = false;
            for (let hi = 0; hi < VENTS.length; hi++) {
              const q0 = VENTS[hi];
              const da0 = (xa - q0[0]) / q0[2];
              const db0 = (xb - q0[1]) / q0[3];
              if (da0 * da0 + db0 * db0 < 1) {
                ins = true;
                break;
              }
            }
            if (ins) continue;
          }
          idx.push(a, b2, d, b2, e2, d);
        }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new T.Float32BufferAttribute(col, 3));
      g.setAttribute("colorEga", new T.Float32BufferAttribute(colE, 3));
      g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const shellMat = new T.MeshToonMaterial({
      vertexColors: true,
      gradientMap: toonRamp,
      side: T.DoubleSide,
      alphaMap: ventTex,
      alphaTest: cut ? 0.5 : 0,
    });
    const shellLine = cut
      ? new T.MeshBasicMaterial({
          color: 0x0a0a12,
          side: T.BackSide,
          alphaMap: ventTex,
          alphaTest: 0.5,
        })
      : inkMaterial;
    add(helm, shellGeo(true), shellMat, { s: [4.0, 4.3, 4.7], lw: 0.5, lm: shellLine });
    add(helm, shellGeo(false), shellMat, { s: [3.6, 3.9, 4.25], line: false });
    if (P.vents === "painted")
      VENTS.forEach((q) => {
        const n = V(sin(q[0]), cos(q[0]) * cos(q[1]), cos(q[0]) * sin(q[1])).normalize();
        const t2 = V(0, 0, 1);
        t2.addScaledVector(n, -t2.dot(n)).normalize();
        const xx = new T.Vector3().crossVectors(n, t2);
        const v2 = add(helm, unit, C.helmetD, { s: [0.3, 0.16, q[3] * 4.3], line: false });
        v2.position
          .set(n.x * 4.0, n.y * 4.3, n.z * 4.7 * (n.z < 0 ? TAIL : 1))
          .multiplyScalar(0.985);
        v2.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(xx, n, t2));
      });
    const rimPts = [];
    for (let ri = 0; ri < 40; ri++) {
      const ra = (ri / 40) * 2 * PI;
      const rz = sin(ra);
      rimPts.push(V(4.0 * cos(ra), 0, 4.7 * (rz < 0 ? rz * TAIL : rz)));
    }
    const rimCurve = new T.CatmullRomCurve3(rimPts, true);
    add(helm, new T.TubeGeometry(rimCurve, 80, 0.22, 8, true), C.rim, {
      p: [0, 0.12, 0],
      line: false,
    });
    add(helm, new T.TubeGeometry(rimCurve, 80, 0.26, 8, true), C.rim, {
      p: [0, -0.02, 0],
      s: [0.93, 1, 0.93],
      line: false,
    });
    ell(helm, C.rim, [0, 0.05, 4.6], [1.9, 0.3, 0.5], { line: false });
    [1, -1].forEach((s) => {
      const dv = [s * 2.82, 1.75, 0.55];
      rod(hg, [s * 3.75, 4.15, 1.55], dv, 0.12, 0x444450, { line: false });
      rod(hg, [s * 3.75, 3.95, -1.5], dv, 0.12, 0x444450, { line: false });
      add(hg, box(0.3, 0.42, 0.5), 0xaaaaaa, { p: dv, line: false });
    });
    add(hg, new T.TorusGeometry(2.82, 0.12, 6, 28, Math.PI), 0x444450, {
      p: [0, 1.75, 0.55],
      r: [0, 0, Math.PI],
      s: [1, 0.82, 1],
      line: false,
    });
    add(hg, box(0.5, 0.36, 0.26), 0xaaaaaa, { p: [0.9, -0.5, 0.6], r: [0, 0, 0.25], line: false });
  }

  /* hands: bare, a flat slab of a palm, a jointed thumb and three jointed fingers */
  X.fingers = {};
  X.thumbs = {};
  [1, -1].forEach((s) => {
    const hk = P.hand / 2.4;
    const hand = J["hand" + s];
    const list: T.Object3D[] = (X.fingers[s] = []);
    const w = 0.66 * hk;
    const h = 0.56 * hk;
    const rr = 0.26 * hk;
    const ps = new T.Shape();
    ps.moveTo(-w + rr, -h);
    ps.lineTo(w - rr, -h);
    ps.quadraticCurveTo(w, -h, w, -h + rr);
    ps.lineTo(w * 0.86, h - rr);
    ps.quadraticCurveTo(w * 0.86, h, w * 0.86 - rr, h);
    ps.lineTo(-w * 0.86 + rr, h);
    ps.quadraticCurveTo(-w * 0.86, h, -w * 0.86, h - rr);
    ps.lineTo(-w, -h + rr);
    ps.quadraticCurveTo(-w, -h, -w + rr, -h);
    const pg = new T.ExtrudeGeometry(ps, {
      depth: 0.22 * hk,
      bevelEnabled: true,
      bevelSize: 0.12 * hk,
      bevelThickness: 0.13 * hk,
      bevelSegments: 3,
      curveSegments: 6,
    });
    pg.translate(0, 0, -0.11 * hk);
    add(hand, pg, C.skin, { p: [0, -0.82 * hk, 0], r: [0, PI / 2, 0] });
    ell(hand, C.skin, [0, -0.15 * hk, 0], [0.3 * hk, 0.36 * hk, 0.46 * hk], { line: false });
    ell(hand, C.skin, [-s * 0.14 * hk, -0.62 * hk, 0.36 * hk], [0.24 * hk, 0.4 * hk, 0.34 * hk], {
      line: false,
    });
    const th = (X.thumbs[s] = grp(hand, [-s * 0.1 * hk, -0.58 * hk, 0.66 * hk]));
    th.rotation.set(0.9, 0, 0);
    add(th, capG(0.2 * hk, 0.34 * hk), C.skin, { p: [0, -0.32 * hk, 0] });
    const th2 = grp(th, [0, -0.64 * hk, 0]);
    th2.rotation.x = -0.4;
    add(th2, capG(0.18 * hk, 0.24 * hk), C.skin, { p: [0, -0.22 * hk, 0] });
    [-0.46, 0, 0.46].forEach((z, i) => {
      const len = i === 1 ? 1.0 : 0.9;
      const f1 = grp(hand, [0, -1.42 * hk, z * hk]);
      f1.rotation.x = -z * 0.12;
      add(f1, capG(0.2 * hk, 0.4 * hk * len), C.skin, { p: [0, -0.3 * hk * len, 0] });
      const f2 = grp(f1, [0, -0.64 * hk * len, 0]);
      add(f2, capG(0.185 * hk, 0.32 * hk * len), C.skin, { p: [0, -0.26 * hk * len, 0] });
      list.push(f1, f2);
    });
  });

  /* runners: red upper, white rubber sole and a rubber toe cap that wraps over the front */
  const SHOES: Record<
    string,
    { cuff: number; wk: number; up: number; sole: number; toe: number; len: number }
  > = {
    high: { cuff: 1, wk: 1, up: 0.5, sole: 0.5, toe: 1, len: 1 },
    low: { cuff: 0, wk: 0.92, up: 0.42, sole: 0.42, toe: 0.85, len: 1.04 },
    chunky: { cuff: 1, wk: 1.16, up: 0.56, sole: 0.78, toe: 1.25, len: 0.98 },
  };
  const SHOE = SHOES[P.shoe] ?? SHOES.high;
  [1, -1].forEach((s) => {
    const r = P.legR;
    const ah = P.ank;
    const foot = J["foot" + s];
    const L = P.shoeL * SHOE.len;
    const w = (P.shoeW / 2) * SHOE.wk;
    const st = SHOE.sole;
    if (SHOE.cuff) {
      add(foot, cyl(r * 1.0, r * 1.0, 1.9), C.shoe, { p: [0, 0.3, 0] });
      add(foot, new T.TorusGeometry(r * 0.98, 0.13, 6, 18), 0xffffff, {
        p: [0, 1.2, 0],
        r: [PI / 2, 0, 0],
        line: false,
      });
    } else
      add(foot, new T.TorusGeometry(r * 0.82, 0.2, 6, 16), C.shoe, {
        p: [0, -0.45, 0.1],
        r: [PI / 2 + 0.25, 0, 0],
      });
    ell(foot, C.shoe, [0, -ah * 0.44 + (st - 0.5) * 0.3, L * 0.2], [w, ah * SHOE.up, L * 0.5]);
    add(foot, cyl(1, 1, 1, 24), 0xffffff, {
      p: [0, -ah + 0.12 + st / 2, L * 0.2],
      s: [w * 1.05, st, L * 0.515],
    });
    add(foot, cyl(1, 1, 1, 24), 0xaaaaaa, {
      p: [0, -ah + 0.08, L * 0.2],
      s: [w * 0.97, 0.16, L * 0.485],
      line: false,
    });
    ell(
      foot,
      0xffffff,
      [0, -ah * 0.56 + (st - 0.5) * 0.4, L * 0.6],
      [w * 0.86 * SHOE.toe, ah * 0.36 * SHOE.toe, L * 0.14 * SHOE.toe],
    );
    ell(foot, 0xffff55, [s * w * 0.93, -ah * 0.3, L * 0.02], [0.12, 0.3, 0.3], { line: false });
    [0, 1, 2].forEach((i) => {
      add(foot, box(w * 0.9, 0.12, 0.16), 0xffffff, {
        p: [0, -ah * 0.02 - i * 0.3 + (st - 0.5) * 0.3, L * 0.22 + i * 0.5],
        r: [0.5, 0, 0],
        line: false,
      });
    });
    if (P.shoe === "low") {
      add(foot, box(0.1, 0.22, L * 0.42), 0xffffff, {
        p: [s * w * 0.98, -ah * 0.5, L * 0.2],
        r: [0.25, 0, 0],
        line: false,
      });
      ell(foot, C.shoe, [0, -ah * 0.2, -L * 0.3], [w * 0.5, 0.5, 0.3], { line: false });
    }
    if (P.shoe === "chunky")
      add(foot, box(w * 1.1, 1.0, 0.5), C.shoe, { p: [0, 0.35, r * 0.95], r: [-0.3, 0, 0] });
  });

  /* Fizz Stunner: a cartoon soda shooter, barrel along +Z. Three designs. */
  function can(parent: T.Object3D, p: number[], r: number, len: number): T.Object3D {
    const g = grp(parent, p);
    add(g, cyl(r, r, len, 16), 0xf4f4f8);
    add(g, cyl(r * 1.02, r * 1.02, len * 0.45, 16), FZ.l, { line: false });
    add(g, cyl(r * 0.82, r, len * 0.1, 16), 0xc8ccd8, { p: [0, len * 0.55, 0], line: false });
    add(g, cyl(r, r * 0.82, len * 0.1, 16), 0xc8ccd8, { p: [0, -len * 0.55, 0], line: false });
    return g;
  }
  function grip(g: T.Object3D): void {
    const z0 = P.stunner === "can" ? 0.75 : 0;
    add(g, capG(0.34, 0.95), FZ.d, { p: [0, -1.1, z0 - 0.15], r: [0.3, 0, 0] });
    add(g, new T.TorusGeometry(0.42, 0.09, 5, 12, PI), 0x444450, {
      p: [0, -0.55, z0 + 0.55],
      r: [0, PI / 2, PI],
      line: false,
    });
    g.userData.gz = z0;
  }
  function makeStunner(parent: T.Object3D): T.Object3D {
    const g = grp(parent);
    let mz = 3.4;
    if (P.stunner === "can") {
      add(g, cyl(0.74, 0.74, 2.5, 22), FZ.l, { p: [0, 0.2, 1.15], r: [PI / 2, 0, 0] });
      add(g, sph(0.74), FZ.l, { p: [0, 0.2, 2.35], s: [1, 1, 0.55], line: false });
      [0.35, 1.9].forEach((z) => {
        add(g, new T.TorusGeometry(0.76, 0.1, 6, 20), FZ.d, { p: [0, 0.2, z], line: false });
      });
      add(g, new T.TorusGeometry(0.66, 0.14, 6, 20), 0xc8ccd8, { p: [0, 0.2, -0.1], line: false });
      const gc = can(g, [0, 0.2, -0.75], 0.52, 1.5);
      gc.rotation.x = PI / 2;
      g.userData.can = gc;
      add(g, box(0.5, 0.2, 1.3), 0xf4f4f8, { p: [0, 0.9, 1.15], line: false });
      add(g, sph(0.16), 0xff3030, { p: [0, 1.02, 0.7], line: false });
      [0.75, 1.15, 1.55].forEach((z) => {
        add(g, sph(0.13), 0xffffff, { p: [0.72, 0.3, z], line: false });
        add(g, sph(0.13), 0xffffff, { p: [-0.72, 0.3, z], line: false });
      });
      add(g, cyl(0.78, 0.36, 0.95, 20), 0xffe34d, { p: [0, 0.2, 3.0], r: [PI / 2, 0, 0] });
      add(g, cyl(0.58, 0.58, 0.06, 20), 0x3a0f3a, {
        p: [0, 0.2, 3.48],
        r: [PI / 2, 0, 0],
        line: false,
      });
      mz = 3.6;
    } else if (P.stunner === "dome") {
      ell(g, FZ.l, [0, 0.15, 0.8], [0.66, 0.72, 1.25]);
      add(
        g,
        new T.Mesh(
          sph(0.7),
          new T.MeshBasicMaterial({ color: FZ.l, transparent: true, opacity: 0.45 }),
        ).geometry,
        new T.MeshBasicMaterial({ color: FZ.l, transparent: true, opacity: 0.45 }),
        { p: [0, 0.95, 0.35], line: false, shadow: false },
      );
      add(g, new T.TorusGeometry(0.62, 0.1, 6, 18), 0xc8ccd8, {
        p: [0, 0.62, 0.35],
        r: [PI / 2, 0, 0],
        line: false,
      });
      [
        [0.2, 1.1, 0.5, 0.17],
        [-0.22, 0.9, 0.2, 0.13],
        [0.05, 1.3, 0.2, 0.1],
        [-0.1, 1.0, 0.65, 0.09],
      ].forEach((b) => {
        add(g, sph(b[3]), 0xffffff, { p: [b[0], b[1], b[2]], line: false, shadow: false });
      });
      add(g, cyl(0.26, 0.3, 1.5, 14), FZ.d, { p: [0, 0.15, 2.5], r: [PI / 2, 0, 0] });
      [
        [2.0, 0.52],
        [2.45, 0.44],
        [2.9, 0.36],
      ].forEach((q) => {
        add(g, new T.TorusGeometry(q[1], 0.1, 6, 16), 0xffe34d, {
          p: [0, 0.15, q[0]],
          line: false,
        });
      });
      add(g, sph(0.36), 0xffe34d, { p: [0, 0.15, 3.4] });
      add(g, box(0.14, 0.9, 1.0), FZ.d, { p: [0, 0.75, -0.55], r: [0.5, 0, 0], line: false });
      mz = 3.9;
    } else {
      const pts = [
        [0, 0],
        [0.6, 0],
        [0.66, 0.25],
        [0.66, 1.7],
        [0.56, 2.1],
        [0.3, 2.6],
        [0.27, 3.1],
        [0.34, 3.15],
        [0.34, 3.35],
        [0, 3.35],
      ].map((q) => {
        return new T.Vector2(q[0], q[1]);
      });
      add(g, new T.LatheGeometry(pts, 20), FZ.l, { p: [0, 0.15, -0.2], r: [PI / 2, 0, 0] });
      add(g, cyl(0.68, 0.68, 0.85, 20), 0xf4f4f8, {
        p: [0, 0.15, 0.75],
        r: [PI / 2, 0, 0],
        line: false,
      });
      [
        [0.18, 0.5, 0.14],
        [-0.2, 0.2, 0.1],
        [0.05, -0.05, 0.08],
      ].forEach((b) => {
        add(g, sph(b[2]), FZ.l, { p: [0.69, 0.15 + b[1], 0.75 + b[0]], line: false });
        add(g, sph(b[2]), FZ.l, { p: [-0.69, 0.15 + b[1], 0.75 - b[0]], line: false });
      });
      add(g, cyl(0.42, 0.42, 0.24, 12), 0xffe34d, { p: [0, 0.15, 3.2], r: [PI / 2, 0, 0] });
      add(g, capG(0.2, 1.2), 0x444450, { p: [0, -0.72, 1.5], r: [PI / 2, 0, 0] });
      add(g, box(0.16, 0.5, 0.16), 0x444450, { p: [0, -0.45, 1.0], line: false });
      add(g, box(0.16, 0.5, 0.16), 0x444450, { p: [0, -0.45, 2.0], line: false });
      add(g, sph(0.3), 0xc8ccd8, { p: [0, 0.15, -0.35], line: false });
      mz = 3.6;
    }
    grip(g);
    g.userData.mz = mz;
    return g;
  }
  const gun = (X.gun = makeStunner(J["hand-1"]));
  gun.rotation.x = Math.PI / 2;
  gun.position.set((0.5 * P.hand) / 2.4, (-1.0 * P.hand) / 2.4 + gun.userData.gz, 1.15);
  X.gunCan = gun.userData.can || null;
  const spark = (X.spark = grp(gun, [0, 0.2, gun.userData.mz + 0.6]));
  add(spark, new T.OctahedronGeometry(0.75), new T.MeshBasicMaterial({ color: 0xffffff }), {
    line: false,
    shadow: false,
    pick: false,
    s: [1, 1, 1.5],
  });
  add(
    spark,
    new T.OctahedronGeometry(1.1),
    new T.MeshBasicMaterial({ color: FZ.l, transparent: true, opacity: 0.6 }),
    { line: false, shadow: false, pick: false },
  );
  const hol = (X.holster = makeStunner(pelvis));
  hol.rotation.set(Math.PI / 2 + 0.2, 0, 0);
  hol.scale.setScalar(0.8);
  hol.position.set(-(W * 0.47 + 0.75), 0.5, -0.2);
  add(pelvis, box(0.3, 1.6, 1.4), C.belt, { p: [-(W * 0.47 + 0.12), 0.3, 0], line: false });

  /* optional gear */
  if (P.backpack) {
    const bz = -(D / 2 + 0.85);
    add(chest, box(W * 0.8, 4.4, 1.9), 0xaa5500, { p: [0, 0.6, bz] });
    add(chest, box(W * 0.82, 1.5, 2.0), 0xc9742a, { p: [0, 2.2, bz], line: false });
    add(chest, box(0.7, 0.5, 0.2), 0xffe34d, { p: [0, 1.5, bz - 1.05], line: false });
    [1, -1].forEach((s) => {
      add(chest, new T.TorusGeometry(1.9, 0.2, 6, 26), 0x8a4400, {
        p: [s * 2.25, 1.25, -0.2],
        r: [0, PI / 2, 0],
        s: [1.28, 1.3, 1],
        line: false,
      });
    });
    can(chest, [W * 0.4 + 0.65, 0.15, bz], 0.56, 1.6);
    add(chest, box(1.3, 1.0, 0.8), 0x8a4400, { p: [W * 0.4 + 0.65, -0.9, bz] });
    const pk = (X.packPogo = grp(chest, [-0.9, 2.9, bz]));
    pk.rotation.z = 0.12;
    add(pk, cyl(0.3, 0.3, 2.4, 10), 0xffff55, { p: [0, 1.0, 0] });
    add(pk, cyl(0.26, 0.26, 3.6, 10), 0xffff55, { p: [0, 2.2, 0], r: [0, 0, PI / 2] });
    [1, -1].forEach((s) => {
      add(pk, cyl(0.36, 0.36, 1.0, 10), 0x222228, {
        p: [s * 1.3, 2.2, 0],
        r: [0, 0, PI / 2],
        line: false,
      });
    });
  }
  if (P.wrist) {
    const wc = grp(J.armL1, [0, -(P.aL - 1.0), 0]);
    add(wc, cyl(0.7, 0.66, 0.75, 16), 0x333340, {});
    add(wc, box(0.34, 1.05, 1.15), 0x444450, { p: [0.72, 0, 0] });
    add(wc, box(0.06, 0.8, 0.9), new T.MeshBasicMaterial({ color: 0x7df2ff }), {
      p: [0.9, 0, 0],
      line: false,
      shadow: false,
    });
    add(wc, box(0.08, 0.14, 0.5), new T.MeshBasicMaterial({ color: 0x0a7f8c }), {
      p: [0.94, 0.12, 0],
      line: false,
      shadow: false,
    });
    add(wc, sph(0.13), 0xffe34d, { p: [0.75, 0.62, 0.35], line: false });
    add(wc, sph(0.13), 0xff3030, { p: [0.75, 0.62, -0.05], line: false });
    const ae = (X.aerial = grp(wc, [0.72, 0.45, -0.42]));
    ae.visible = false;
    ae.rotation.z = -0.25;
    add(ae, cyl(0.06, 0.06, 1, 6), 0xc8ccd8, { p: [0, 0.5, 0], line: false });
    X.aerialTip = add(ae, sph(0.15), 0xff3030, { p: [0, 1.0, 0], line: false });
  }

  /* props */
  const props = {} as Props;
  let k: number;
  props.freeCan = can(root, [0, 0, 0], 0.52, 1.5);
  props.freeCan.visible = false;
  const pogo = (props.pogo = grp(root));
  pogo.visible = false;
  add(pogo, sph(0.75), 0x333340, { p: [0, 0.55, 0], s: [1, 0.8, 1] });
  props.plunger = add(pogo, cyl(0.2, 0.2, 1, 8), 0xdfe3ee, { line: false });
  props.spring = grp(pogo, [0, 0.9, 0]);
  for (k = 0; k < 6; k++)
    add(props.spring, new T.TorusGeometry(0.62, 0.15, 6, 14), 0xaaaaaa, {
      p: [0, (k + 0.5) / 6, 0],
      r: [Math.PI / 2 + 0.1, 0, 0],
      line: false,
    });
  const ride = (props.ride = grp(pogo));
  add(ride, cyl(0.55, 0.55, 0.9, 12), 0x333340, {});
  add(ride, box(5.2, 0.5, 1.5), 0x333340, { p: [0, 0.1, 0] });
  [1, -1].forEach((s) => {
    add(ride, box(0.4, 0.6, 1.6), 0xffff55, { p: [s * 2.75, 0.1, 0], line: false });
  });
  props.shaft = add(ride, cyl(0.36, 0.36, 1, 12), 0xffff55, {});
  props.band = add(ride, cyl(0.4, 0.4, 0.7, 12), 0xaa0000, { line: false });
  props.bar = grp(ride);
  add(props.bar, cyl(0.3, 0.3, 6.6, 10), 0xffff55, { r: [0, 0, Math.PI / 2] });
  [1, -1].forEach((s) => {
    add(props.bar, cyl(0.42, 0.42, 1.7, 10), 0x222228, {
      p: [s * 2.5, 0, 0],
      r: [0, 0, Math.PI / 2],
      line: false,
    });
    add(props.bar, sph(0.46), 0xaa0000, { p: [s * 3.45, 0, 0], line: false });
  });
  const ladder = (props.ladder = grp(root));
  ladder.visible = false;
  [1, -1].forEach((s) => {
    add(ladder, box(0.7, 44, 0.7), 0xaa5500, { p: [s * 3.6, 20, 0], pick: false });
  });
  props.rungs = grp(ladder);
  for (k = 0; k < 18; k++)
    add(props.rungs, cyl(0.28, 0.28, 7.2, 8), 0xaaaaaa, {
      p: [0, k * 2.4, 0],
      r: [0, 0, Math.PI / 2],
      line: false,
      pick: false,
    });
  const ledge = (props.ledge = grp(root));
  ledge.visible = false;
  add(ledge, box(13, 1.3, 5.5), 0xaa5500, { p: [0, 0.65, 2.75], pick: false });
  [-4.3, 0, 4.3].forEach((x) => {
    add(ledge, box(0.16, 1.34, 5.54), 0x6a3500, { p: [x, 0.65, 2.75], line: false, pick: false });
  });
  add(ledge, box(13, 6, 0.9), 0x555c8a, { p: [0, -3, 5.0], pick: false });
  const phone = (props.phone = grp(root));
  phone.visible = false;
  add(phone, box(1.8, 3.1, 0.3), 0x222228, {});
  add(phone, box(1.5, 2.7, 0.06), new T.MeshBasicMaterial({ color: 0xbfe6ff }), {
    p: [0, 0, -0.17],
    line: false,
    shadow: false,
  });
  props.glow = new T.PointLight(0x9fd8ff, 0, 0.9);
  props.glow.position.set(0, 0.3, -1.2);
  phone.add(props.glow);
  props.notes = [0, 1].map(() => {
    const n = grp(root);
    n.visible = false;
    const nm = new T.MeshBasicMaterial({ color: 0x55ffff, transparent: true });
    add(n, sph(0.42), nm, { s: [1, 0.8, 0.6], line: false, shadow: false, pick: false });
    add(n, box(0.14, 1.5, 0.14), nm, {
      p: [0.36, 0.75, 0],
      line: false,
      shadow: false,
      pick: false,
    });
    add(n, box(0.7, 0.3, 0.14), nm, {
      p: [0.68, 1.4, 0],
      r: [0, 0, -0.35],
      line: false,
      shadow: false,
      pick: false,
    });
    n.userData.m = nm;
    return n;
  });
  props.bubbles = [0, 1, 2].map(() => {
    const m = new T.Mesh(
      new T.SphereGeometry(0.9, 16, 12),
      new T.MeshBasicMaterial({ color: FZ.l, transparent: true, opacity: 0.85 }),
    );
    m.visible = false;
    root.add(m);
    const gl = new T.Mesh(
      new T.SphereGeometry(0.28, 8, 6),
      new T.MeshBasicMaterial({ color: 0xffffff }),
    );
    gl.position.set(-0.3, 0.35, 0.5);
    m.add(gl);
    return m;
  });

  const bonePairs = [
    ["pelvis", "spine"],
    ["spine", "chest"],
    ["chest", "neck"],
    ["neck", "head"],
    ["head", "_crown"],
  ];
  [1, -1].forEach((s) => {
    bonePairs.push(
      ["chest", "armU" + s],
      ["armU" + s, "armL" + s],
      ["armL" + s, "hand" + s],
      ["pelvis", "legU" + s],
      ["legU" + s, "legL" + s],
      ["legL" + s, "foot" + s],
      ["foot" + s, "_toe" + s],
    );
    J["_toe" + s] = grp(J["foot" + s], [0, -P.ank + 0.4, P.shoeL * 0.65]);
  });
  J._crown = grp(head, [0, 7.2 * hs, 0]);
  const bg = new T.BufferGeometry();
  bg.setAttribute("position", new T.BufferAttribute(new Float32Array(bonePairs.length * 6), 3));
  const bonesL = new T.LineSegments(
    bg,
    new T.LineBasicMaterial({ color: 0xffff55, depthTest: false, transparent: true }),
  );
  bonesL.renderOrder = 10;
  bonesL.visible = false;
  bonesL.frustumCulled = false;
  root.add(bonesL);
  const marker = new T.Mesh(
    new T.SphereGeometry(0.7, 12, 8),
    new T.MeshBasicMaterial({ color: 0xff55ff, depthTest: false, transparent: true, opacity: 0.9 }),
  );
  marker.renderOrder = 11;
  marker.visible = false;
  root.add(marker);

  // Ben is modelled in sprite pixels; `turn` holds him at world scale and is what a scene adds and rotates.
  const turn = new T.Group();
  turn.scale.setScalar(benGScale);
  turn.add(root);
  const fig: Fig = {
    P,
    root,
    turn,
    J,
    X,
    props,
    pickables,
    bones: bonesL,
    bonePairs,
    marker,
    jointList: bones,
    d: { A, Lg, standY: restY, shOff: s0 + s1 + P.shUp, torso: Tt },
    loc(o: T.Object3D) {
      return root.worldToLocal(o.getWorldPosition(new T.Vector3()));
    },
    locQ(o: T.Object3D) {
      return root
        .getWorldQuaternion(new T.Quaternion())
        .invert()
        .multiply(o.getWorldQuaternion(new T.Quaternion()));
    },
  };
  return fig;
}
