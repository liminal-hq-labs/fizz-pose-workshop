// The cartoon Ben's poses: each returns one frame of goals for a time in seconds.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { HandGoal, PoseOut, Fig } from "./types.ts";
import { PI, sin, cos, max } from "./shared.ts";

/* ---------- poses, keyed to the workshop's newest sets ---------- */
export const poses: Record<string, (t: number, f: Fig) => PoseOut> = {
  stand(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const o = poseBase(d.standY);
    o.head = [0.02 * sin(t * 0.9), 0.12 * sin(t * 0.45), 0];
    o.chestScale = 1 + 0.012 * sin(t * 2);
    eachSide((s) => {
      o.hands[s] = { rel: [s * 0.8, -d.A * 0.985, 0.5], hint: [s * 0.6, 0, -1], grip: 0.35 };
      o.feet[s] = { abs: [s * P.hipHalf * 1.15, P.ank, s > 0 ? 0.5 : -0.3], yaw: 0.16 };
    });
    return o;
  },
  run(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const ph = t * 1.4;
    const o = poseBase(P.ank + d.Lg * 0.95 - d.Lg * 0.03 * cos(4 * PI * ((ph % 1) - 0.15)));
    o.prot = [0.16, -0.12 * cos(2 * PI * ph), 0];
    o.spine = [0.03, 0.06 * cos(2 * PI * ph), 0];
    o.chest = [0.08, 0.22 * cos(2 * PI * ph), 0];
    o.head = [-0.14, -0.16 * cos(2 * PI * ph), 0];
    eachSide((s) => {
      const u = (ph + (s > 0 ? 0 : 0.5)) % 1;
      const R = d.Lg * 0.29;
      const toe = P.shoeL * 0.42;
      let z;
      let y;
      let pitch;
      const TO = 0.7;
      if (u < 0.4) {
        const k = u / 0.4;
        z = R * (1 - 2 * k);
        pitch = k < 0.18 ? -0.26 * (1 - k / 0.18) : k > 0.6 ? TO * smoothstep((k - 0.6) / 0.4) : 0;
        y = P.ank + (pitch > 0 ? sin(pitch) * toe : -sin(pitch) * 0.7);
        if (pitch > 0) z += (1 - cos(pitch)) * toe;
      } else {
        const w = (u - 0.4) / 0.6;
        const e = smoothstep(w);
        z = -R + (1 - cos(TO)) * toe * (1 - e) + 2 * R * e;
        y = P.ank + sin(TO) * toe * (1 - e) + d.Lg * 0.3 * sin(PI * w) * (1 - 0.45 * w) + 0.18 * e;
        pitch = (TO + 0.35 * sin(PI * Math.min(w * 2.2, 1))) * (1 - e) - 0.26 * e;
      }
      o.feet[s] = { abs: [s * P.hipHalf * 0.85, y, z - 0.3], pitch, yaw: 0.04 };
      const a = cos(2 * PI * u + 0.25);
      const fw = max(0, -a);
      o.hands[s] = {
        rel: [s * 0.75 - s * 1.4 * fw, -d.A * 0.6 + d.A * 0.24 * fw, -d.A * 0.4 * a + 0.4],
        hint: [s * 0.7, 0.1, -1],
        grip: 1,
      };
    });
    return o;
  },
  pogo(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const u = (t * 1.25) % 1;
    const cmax = 2.0;
    let c = 0;
    let lift = 0;
    let tk = 0;
    if (u < 0.36) c = cmax * sin((PI * u) / 0.36);
    else {
      const v = (u - 0.36) / 0.64;
      lift = 5.2 * 4 * v * (1 - v);
      tk = sin(PI * v);
    }
    const q = c / cmax;
    const l = 0.05 + 0.02 * q;
    const pegH = 4.6;
    const ax = [0, cos(l), sin(l)];
    const tipZ = 1.6;
    const peg = [0, lift + ax[1] * (pegH - c), tipZ + ax[2] * (pegH - c)];
    const len = d.Lg * 0.6 + d.torso * 0.8;
    const hdl = [0, peg[1] + ax[1] * len, peg[2] + ax[2] * len];
    const o = poseBase(peg[1] + P.ank + d.Lg * (0.86 - 0.16 * q - 0.07 * tk));
    o.pz = peg[2] - 2.3 - 0.15 * q;
    o.prot = [0.05 + 0.09 * q - 0.03 * tk, 0, 0.02 * sin(t * 1.25 * PI)];
    o.spine = [0.06 * q - 0.04 * tk, 0, 0];
    o.chest = [0.08 + 0.07 * q - 0.03 * tk, 0, -0.02 * sin(t * 1.25 * PI)];
    o.neck = [-0.05 * q, 0, 0];
    o.head = [-0.1 - 0.07 * q + 0.05 * tk, 0, 0];
    o.chestScale = 1 - 0.06 * q + 0.03 * tk;
    eachSide((s) => {
      o.feet[s] = {
        abs: [s * 1.75, peg[1] + P.ank + 0.35, peg[2] - 0.9],
        pitch: 0.12 - 0.2 * q,
        yaw: 0.25,
        hint: [s * 0.45, 0, 1],
      };
      o.hands[s] = {
        abs: [s * 2.5, hdl[1] + 0.5, hdl[2] - 0.95],
        hint: [s * 1, -0.6, -0.5],
        grip: 1.35,
        wrap: l + 0.25,
      };
    });
    o.pogo = { tip: [0, lift, tipZ], lean: l, c, pegH, len };
    o.lift = lift;
    return o;
  },
  fire(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const cyc = t * 0.9;
    const cy = cyc % 1;
    const k = cy < 0.12 ? 0 : cy < 0.18 ? (cy - 0.12) / 0.06 : max(0, 1 - (cy - 0.18) / 0.34);
    const ks = smoothstep(k);
    const o = poseBase(P.ank + d.Lg * 0.95 - 0.25 * ks);
    o.pz = -0.8 * ks;
    o.prot = [-0.07 * ks, -0.18, 0];
    o.spine = [-0.05 * ks, 0, 0];
    o.chest = [0.04 - 0.12 * ks, 0.3 - 0.14 * ks, 0];
    o.head = [0.06 * ks, -0.1 + 0.1 * ks, 0];
    o.feet[1] = { abs: [P.hipHalf * 1.2, P.ank + 0.5 * ks, 2.3], pitch: -0.3 * ks, yaw: 0.1 };
    o.feet[-1] = { abs: [-P.hipHalf * 1.4, P.ank, -2.1], yaw: 0.55 };
    o.hands[-1] = {
      rel: [0.9, -0.5 + 1.6 * ks, d.A * 0.96 - 2.2 * ks],
      hint: [-0.7, -1, -0.2],
      grip: 1.2,
    };
    o.hands[1] = {
      rel: [0.5 + 0.6 * ks, -d.A * 0.78 + 0.8 * ks, -1.4 - 0.8 * ks],
      hint: [0.6, 0, -1],
      grip: 1,
    };
    o.gun = true;
    o.flash = cy >= 0.12 && cy < 0.2;
    if (cy >= 0.12) o.shotId = Math.floor(cyc);
    return o;
  },
  jump(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const u = (t / 1.9) % 1;
    const v = (u - 0.24) / 0.46;
    const air = v > 0 && v < 1;
    const a = air ? sin(PI * v) : 0;
    const lift = air ? 6.2 * 4 * v * (1 - v) : 0;
    const c =
      u < 0.24
        ? smoothstep(u / 0.17) * (1 - smoothstep((u - 0.19) / 0.05))
        : u >= 0.7
          ? 0.85 * sin(PI * Math.min(1, (u - 0.7) / 0.22))
          : 0;
    const o = poseBase(d.standY - 2.8 * c + lift);
    o.prot = [0.3 * c + 0.1 * a, 0, 0];
    o.chest = [0.25 * c + 0.04 * a, -0.1 * a, 0];
    o.head = [-0.2 * c - 0.08 * a, 0, 0];
    o.lift = lift;
    o.face = air ? "shout" : c > 0.3 ? "determined" : "smile";
    eachSide((s) => {
      o.feet[s] = air
        ? {
            rel: [s * 0.2, -d.Lg * (0.97 - 0.2 * a), (s > 0 ? 0.42 : -0.4) * d.Lg * a + 0.3],
            pitch: (s > 0 ? -0.15 : 0.6) * a + 0.4 * (1 - a),
            hint: [s * 0.2, s > 0 ? 0.4 : -0.2, 1],
          }
        : {
            abs: [s * P.hipHalf * 1.25, P.ank, s > 0 ? 0.5 : -0.3],
            yaw: 0.2,
            hint: [s * 0.4, 0, 1],
          };
      const sw = air ? a * (s > 0 ? -0.7 : 1) : -c;
      o.hands[s] = {
        rel: [s * 0.8, -d.A * (0.9 - 0.4 * Math.abs(sw)), d.A * 0.5 * sw + 0.4],
        hint: [s * 0.8, 0, -1],
        grip: 0.9,
      };
    });
    return o;
  },
  fall(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const fl = sin(t * 17) * 0.03;
    const o = poseBase(d.standY + 4.2 + 0.35 * sin(t * 3.1));
    o.prot = [0.08 + fl, 0, fl];
    o.chest = [0.12, 0, 0];
    o.head = [0.22, 0, 0];
    o.mouth = "open";
    o.lift = 4.2;
    eachSide((s) => {
      o.hands[s] = {
        rel: [-s * (P.sw - 1.0), -d.A * 0.3 + (s > 0 ? 0.6 : 0), d.A * 0.4],
        hint: [s * 1, -0.7, -0.1],
        grip: 1,
      };
      o.feet[s] = {
        rel: [s * 0.9, -d.Lg * 0.76 + 0.2 * sin(t * 9 + s), 1.5 + (s > 0 ? 1.0 : 0)],
        pitch: -0.12,
        yaw: 0.2,
      };
    });
    return o;
  },
  climb(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const gap = 2.4;
    const v = 5;
    const Tm = (4 * gap) / v;
    const lz = 6.8;
    const cy = (2 * PI * t) / Tm;
    const o = poseBase(d.standY + 0.8 + 0.25 * sin(2 * cy));
    o.pz = 0.5;
    o.px = 0.35 * sin(cy);
    o.prot = [0.05, 0.14 * sin(cy), 0.07 * sin(cy)];
    o.spine = [0.04, -0.1 * sin(cy), -0.08 * sin(cy)];
    o.chest = [0.02, -0.16 * sin(cy), -0.06 * sin(cy)];
    o.head = [-0.32, 0.06 * sin(cy), 0];
    const handTop = d.standY + 0.8 + d.shOff + 3.4;
    const footTop = handTop - Math.round((handTop - (P.ank + 0.8 + 2 * gap)) / gap) * gap;
    function trav(p: number, top: number): number[] {
      if (p < 0.5) return [top - p * 4 * gap, 0];
      const e = (p - 0.5) * 2;
      const s2 = e * e * (3 - 2 * e);
      return [top - 2 * gap + 2 * gap * s2, sin(PI * e)];
    }
    eachSide((s) => {
      const ph = (t / Tm + (s > 0 ? 0 : 0.5)) % 1;
      const h = trav(ph, handTop);
      const g = trav((ph + 0.5) % 1, footTop);
      o.hands[s] = {
        abs: [s * 2.75, h[0] - 1.55, lz - 0.85 - 1.0 * h[1]],
        hint: [s * 1, -0.7, -0.3],
        grip: 1.3 * (1 - h[1]),
        wrap: -1.15,
      };
      o.feet[s] = {
        abs: [s * 1.9, g[0] + P.ank - 0.1, lz - 3.1 - 0.7 * g[1]],
        pitch: 0.1 + 0.4 * g[1],
        yaw: 0.35,
        hint: [s * 1.3, 0, 1],
      };
    });
    const off = (handTop - v * t) % gap;
    o.ladder = { z: lz, off: off < 0 ? off + gap : off };
    return o;
  },
  ledge(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const u = (t / 6.5) % 1;
    const sw = sin(t * 1.5);
    let k;
    let o;
    const hangPy = 1.0 + P.ank + 0.3 + d.Lg * 0.97;
    const T0 = hangPy + d.shOff + 5.6;
    const hx = P.sw * 0.95;
    const H = poseBase(hangPy);
    H.pz = -5.3;
    H.prot = [0.05 + 0.03 * sw, 0, 0.03 * sw];
    H.head = [-0.45, 0, 0];
    const Pu = poseBase(T0 - d.shOff + 1.6);
    Pu.pz = -3.6;
    Pu.prot = [0.22, 0, 0];
    Pu.head = [-0.25, 0, 0];
    const M = poseBase(T0 + 1.2);
    M.pz = -1.4;
    M.prot = [0.8, 0, 0];
    M.head = [-0.6, 0, 0];
    const S2 = poseBase(T0 + d.standY);
    S2.pz = 2.4;
    eachSide((s) => {
      H.hands[s] = { abs: [s * hx, T0 + 0.3, 0.3], hint: [s * 1, 0, -0.3], grip: 1.4 };
      H.feet[s] = {
        abs: [s * 1.2, hangPy - 0.3 - d.Lg * 0.97, -5.0 + 1.2 * sin(t * 1.5 + s * 0.9)],
        hint: [s * 0.15, 0, 1],
        pitch: 0.6,
        yaw: 0,
      };
      Pu.hands[s] = { abs: [s * hx, T0 + 0.3, 0.3], hint: [s * 1, 0.2, -0.6], grip: 1.4 };
      Pu.feet[s] = {
        abs: [s * 1.2, Pu.py - 0.3 - d.Lg * 0.9, -3.0 + (s > 0 ? 1.4 : 0)],
        hint: [s * 0.2, 0, 1],
        pitch: 0.5,
        yaw: 0,
      };
      M.hands[s] = { abs: [s * (hx + 0.6), T0 + 0.3, 1.6], hint: [s * 1, 0.6, -0.4], grip: 0.3 };
      M.feet[s] =
        s > 0
          ? { abs: [2.7, T0 + P.ank, 0.8], hint: [1, 0.3, 0.6], pitch: 0, yaw: 0.5 }
          : { abs: [-1.4, T0 - 5.5, -3.2], hint: [-0.2, 0, 1], pitch: 0.7, yaw: 0 };
      S2.hands[s] = {
        abs: [s * (P.sw + 0.8), S2.py + d.shOff - d.A * 0.985, 2.9],
        hint: [s * 0.6, 0, -1],
        grip: 0.35,
      };
      S2.feet[s] = {
        abs: [s * P.hipHalf * 1.15, T0 + P.ank, 2.4 + (s > 0 ? 0.5 : -0.3)],
        hint: [s * 0.15, 0, 1],
        pitch: 0,
        yaw: 0.16,
      };
    });
    let drop = 0;
    if (u < 0.22) {
      o = H;
      o.face = "worried";
    } else if (u < 0.38) {
      k = smoothstep((u - 0.22) / 0.16);
      o = mixPose(H, Pu, k);
      o.face = "determined";
      drop = 0.3 * k;
    } else if (u < 0.54) {
      k = smoothstep((u - 0.38) / 0.16);
      o = mixPose(Pu, M, k);
      o.face = "determined";
      drop = 0.3 + 0.35 * k;
    } else if (u < 0.7) {
      k = smoothstep((u - 0.54) / 0.16);
      o = mixPose(M, S2, k);
      o.face = "smile";
      drop = 0.65 + 0.35 * k;
    } else {
      o = S2;
      o.face = "smile";
      drop = 1;
    }
    o.ledge = { y: T0 - 1.3 };
    o.rootDrop = drop * (T0 - 0.05);
    o.lift = 0;
    return o;
  },
  whistle(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const b = t * 2.6;
    const sw = sin(b);
    const o = poseBase(d.standY - 0.25 * Math.abs(sin(b)));
    o.px = 0.45 * sw;
    o.prot = [0, 0, 0.04 * sw];
    o.chest = [0, 0, -0.06 * sw];
    o.head = [0.07 * sin(2 * b) - 0.05, 0.3, 0.09 * sw];
    o.mouth = "o";
    eachSide((s) => {
      o.hands[s] = {
        abs: [o.px + s * (P.tW * 0.5 + 0.55), o.py + 1.5, 1.5],
        hint: [s * 1, 0.2, -0.6],
        grip: 1,
      };
      o.feet[s] = {
        abs: [s * P.hipHalf * 1.2, P.ank, s > 0 ? 0.6 : -0.3],
        yaw: 0.2,
        pitch: s > 0 ? -0.4 * max(0, sin(b * 2)) : 0,
      };
    });
    o.notes = true;
    return o;
  },
  phone(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const o = poseBase(P.legR + 1.65);
    o.pz = -1.2;
    o.prot = [-0.12, 0, 0];
    o.spine = [0.2, 0, 0];
    o.chest = [0.22, 0, 0];
    o.neck = [0.12, 0, 0];
    o.head = [0.12 + 0.03 * sin(t * 0.8), 0, 0.03 * sin(t * 0.6)];
    o.feet[1] = {
      abs: [-1.3, 1.25, o.pz + d.Lg * 0.46],
      pitch: 0.35,
      yaw: -1.3,
      roll: 0.9,
      hint: [1, 0.3, 0.35],
    };
    o.feet[-1] = {
      abs: [1.6, 1.15, o.pz + d.Lg * 0.36],
      pitch: 0.35,
      yaw: -1.3,
      roll: 0.9,
      hint: [-1, 0.3, 0.35],
    };
    const hy = o.py + d.torso * 0.52;
    const hz = o.pz + 3.7;
    eachSide((s) => {
      o.hands[s] = {
        abs: [s * 0.95, hy + 0.12 * max(0, sin(t * 13 + s * 1.7)), hz],
        hint: [s * 1, -0.6, -0.3],
        grip: 0.9,
      };
    });
    o.phone = { p: [0, hy + 0.5, hz + 0.25] };
    return o;
  },
  wipeout(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const u = (t / 4.8) % 1;
    const w = sin(t * 5.5);
    let k;
    const K0 = poseBase(P.ank + d.Lg * 0.9);
    K0.prot = [0.22, 0, 0.04 * w];
    K0.chest = [0.3, 0, 0];
    K0.head = [0.3, 0, 0.1 * w];
    const K1 = poseBase(P.legR + 1.3);
    K1.pz = -2.2;
    K1.prot = [-0.6, 0, 0.05 * w];
    K1.spine = [0.15, 0, 0];
    K1.neck = [0.15, 0, 0];
    K1.head = [0.25, 0, 0.32 * w];
    const K2 = poseBase(P.legR + 0.9);
    K2.pz = -3.0;
    K2.prot = [-1.45, 0, 0];
    K2.head = [0.15, 0, 0.12 * w];
    eachSide((s) => {
      K0.feet[s] = {
        abs: [s * P.hipHalf * 1.5, P.ank, 0.2],
        pitch: 0,
        yaw: 0.3,
        hint: [s * 0.5, 0, 1],
      };
      K0.hands[s] = {
        abs: [s * 0.9, K0.py + 2.4 + (s > 0 ? 0.5 : 0), 2.3],
        hint: [s * 1, -0.3, -0.2],
        grip: 0.6,
      };
      K1.feet[s] = {
        abs: [s * 2.3, d.Lg * 0.55 + 0.5 * sin(t * 5.5 + s), K1.pz + d.Lg * 0.8],
        pitch: -1.3,
        yaw: 0.25,
        hint: [s * 0.6, 1, 0.2],
      };
      K1.hands[s] = {
        abs: [s * 0.9, K1.py + 2.7 + (s > 0 ? 0.5 : 0), K1.pz + 0.7],
        hint: [s * 1, -0.3, -0.2],
        grip: 0.6,
      };
      K2.feet[s] = {
        abs: [s * 2.0, P.legR + 1.2 + 0.3 * max(0, sin(t * 7 + s)), K2.pz + d.Lg * 0.97],
        pitch: -1.45,
        yaw: 0.4,
        hint: [s * 0.4, 1, 0.1],
      };
      K2.hands[s] = { abs: [s * 6.4, 0.9, K2.pz - 4.0], hint: [s * 0.3, 1, 0], grip: 0.2 };
    });
    let o;
    if (u < 0.2) {
      o = K0;
      o.face = "worried";
    } else if (u < 0.32) {
      k = smoothstep((u - 0.2) / 0.12);
      o = mixPose(K0, K1, k);
      o.py += 2.6 * sin(PI * k);
      o.face = "shout";
    } else if (u < 0.56) {
      o = K1;
      o.face = "shout";
    } else if (u < 0.74) {
      o = K1;
      o.face = "whistle";
    } else if (u < 0.84) {
      k = smoothstep((u - 0.74) / 0.1);
      o = mixPose(K1, K2, k);
      o.face = "worried";
    } else {
      o = K2;
      o.face = "worried";
    }
    return o;
  },
  wrist(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const o = poses.stand(t, f);
    const tap = max(0, sin(t * 9)) * (sin(t * 1.3) > -0.2 ? 1 : 0);
    o.neck = [0.16, 0.05, 0];
    o.head = [0.34, 0.1, 0.04 * sin(t * 0.9)];
    o.chest = [0.06, 0.08, 0];
    o.hands[1] = { rel: [-2.9, -2.5, 2.7], hint: [1, -0.5, 0.3], grip: 0.5 };
    o.hands[-1] = { rel: [2.2, -2.2 - 0.25 * tap, 3.15], hint: [-1, -0.4, 0], grip: 0.9 };
    return o;
  },
  tip(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const o = poses.stand(t, f);
    const nod = smoothstep(max(0, sin(t * 2.2)));
    const hy = d.standY + d.torso + P.neck;
    o.prot = [0, 0.12, 0];
    o.chest = [0.04 * nod, 0.1, 0];
    o.head = [0.1 + 0.2 * nod, 0.08, 0];
    o.hands[-1] = {
      abs: [-4.3, hy + 2.5 - 0.7 * nod, 5.3 + 0.7 * nod],
      hint: [-1, -0.25, 0.5],
      grip: 0.75,
    };
    o.hands[1] = { abs: [P.tW * 0.5 + 0.7, o.py + 1.5, 0.9], hint: [1, 0.2, -0.8], grip: 1 };
    return o;
  },
  scratch(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const o = poses.stand(t, f);
    const sc = sin(t * 11);
    o.head = [0.087, -0.105, -0.14];
    o.chest = [0, 0, -0.052];
    o.helmetIn = { hand: 1, mode: "hang" };
    o.fk = {
      "armU-1": [-43, 52, -137],
      "armL-1": [-51 + 5 * sc, 0, 0],
      "hand-1": [180, -69 + 4 * sc, 180],
    };
    o.hands[-1].grip = 0.75 + 0.2 * sc;
    o.hands[1] = { rel: [3.6, -d.A * 0.7, 1.4], hint: [1, 0, -1], grip: 1.3 };
    return o;
  },
  spin(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const o = poses.stand(t, f);
    const sy = d.standY + d.shOff;
    o.head = [-0.12, -0.22, 0.05];
    o.chest = [-0.03, -0.06, 0];
    o.helmetIn = { hand: -1, mode: "spin", spin: t * 9 };
    o.hands[-1] = {
      abs: [-5.4 + 0.15 * sin(t * 3.1), sy + 3.2 + 0.2 * sin(t * 4.3), 2.0],
      hint: [-1, -1, 0.2],
      grip: 1.3,
      fing: [1.3, 1.3, 0],
    };
    o.hands[1] = { abs: [P.tW * 0.5 + 0.7, o.py + 1.5, 0.9], hint: [1, 0.2, -0.8], grip: 1 };
    return o;
  },
  aerial(t: number, f: Fig): PoseOut {
    const o = poses.wrist(t, f);
    const k = 0.5 - 0.5 * cos(t * 1.7);
    o.aerial = 0.12 + 0.88 * k;
    o.hands[-1] = {
      rel: [2.75, -2.0 + 2.3 * k, 2.55 - 0.5 * k],
      hint: [-1, -0.5, 0.1],
      grip: 1.1,
      fing: [1.3, 1.1, 0.9],
    };
    o.head = [0.3 - 0.12 * k, 0.12, 0.03];
    return o;
  },
  draw(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const u = (t / 3.8) % 1;
    const o = poses.stand(t, f);
    const sy = d.standY + d.shOff;
    const len = d.Lg * 0.6 + d.torso * 0.8;
    const Hh = 4.6 + len;
    const pack = !!f.X.packPogo;
    const R = pack ? [-1.4, sy + 2.4, -3.1] : [-1.9, o.py - 0.7, -2.9];
    const F = [-2.5, Math.min(sy + 0.3, Hh + 2.2), 4.3];
    const G = [-2.5, Hh + 0.5, 2.5];
    const st = [-P.sw - 0.8, sy - d.A * 0.985, 0.5];
    let h;
    let k;
    const lerp = function (a: number[], b: number[], q: number) {
      return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, a[2] + (b[2] - a[2]) * q];
    };
    o.hands[1] = { abs: [P.tW * 0.5 + 0.7, o.py + 1.5, 0.9], hint: [1, 0.2, -0.8], grip: 1 };
    if (u < 0.2) {
      k = smoothstep(u / 0.2);
      h = lerp(st, R, k);
      o.hands[-1] = { abs: h, hint: pack ? [-1, 0.6, -0.2] : [-1, 0, -0.6], grip: k };
      o.chest = [0, pack ? 0.1 : -0.25 * k, 0];
      o.head = [0, -0.35 * k, 0];
    } else if (u < 0.5) {
      k = smoothstep((u - 0.2) / 0.3);
      h = lerp(R, F, k);
      h[0] -= 2.2 * sin(PI * k);
      h[1] += 2.0 * sin(PI * k);
      o.hands[-1] = { abs: h, hint: [-1, -0.4, -0.2], grip: 1.3 };
      o.chest = [0, -0.25 * (1 - k), 0];
      o.head = [-0.1 * k, -0.35 * (1 - k), 0];
      o.pogoFree = {
        top: [h[0] + 2.5, h[1] - 0.5, h[2] + 0.5],
        scale: 0.1 + 0.9 * Math.min(1, k * 1.5) + 0.12 * sin(PI * Math.min(1, k * 1.5)),
        len,
        lean: 0.25 * (1 - k),
      };
    } else {
      k = smoothstep((u - 0.5) / 0.16);
      h = lerp(F, G, k);
      const hop = u > 0.72 ? 0.5 * Math.abs(sin(((u - 0.72) / 0.28) * PI * 3)) : 0;
      o.hands[-1] = { abs: [h[0], h[1], h[2]], hint: [-1, -0.6, -0.4], grip: 1.35, wrap: 0.3 * k };
      o.pogoFree = {
        top: [h[0] + 2.5, h[1] - 0.5, h[2] + 0.5 + 0.45 * k],
        scale: 1,
        len,
        lean: 0.03,
      };
      if (u > 0.62) {
        const k2 = smoothstep((u - 0.62) / 0.12);
        o.hands[1] = {
          abs: lerp([P.tW * 0.5 + 0.7, o.py + 1.5, 0.9], [2.5, Hh + 0.5, 2.5], k2),
          hint: [1, -0.6, -0.4],
          grip: 1.35,
          wrap: 0.3 * k2,
        };
      }
      o.py += hop * 0.5;
      o.face = u > 0.72 ? "determined" : "smile";
      o.head = [0.05, 0, 0];
    }
    return o;
  },
  reload(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const u = (t / 4.6) % 1;
    const o = poses.stand(t, f);
    const sy = d.standY + d.shOff;
    let k;
    const lerp = function (a: number[], b: number[], q: number) {
      return [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, a[2] + (b[2] - a[2]) * q];
    };
    o.gun = true;
    o.chest = [0.05, 0.12, 0];
    o.head = [0.22, 0.16, 0];
    o.face = "determined";
    o.hands[-1] = { rel: [1.6, -2.3, d.A * 0.8], hint: [-0.9, -1, -0.2], grip: 1.2 };
    const ax = f.gunAxis ? [f.gunAxis.x, f.gunAxis.y, f.gunAxis.z] : [0, 0, 1];
    const ci = f.canIn ? [f.canIn.x, f.canIn.y, f.canIn.z] : [-1, sy - 2, 3];
    const at = function (out: number) {
      return [ci[0] - ax[0] * out + 1.5, ci[1] - ax[1] * out + 1.1, ci[2] - ax[2] * out];
    };
    const hip = [P.tW * 0.5 + 0.9, o.py + 1.0, 0.6];
    const side = [6.0, o.py + 2.6, 2.6];
    const pouch = [3.4, o.py + 0.6, -1.0];
    const HL: HandGoal = { hint: [1, -0.6, -0.2], grip: 1.1 };
    if (u < 0.12) {
      k = smoothstep(u / 0.12);
      HL.abs = lerp(hip, at(0), k);
    } else if (u < 0.3) {
      k = smoothstep((u - 0.12) / 0.18);
      HL.abs = at(1.9 * k);
      o.canZ = -0.75 - 1.9 * k;
    } else if (u < 0.44) {
      k = smoothstep((u - 0.3) / 0.14);
      HL.abs = lerp(at(1.9), side, k);
      o.canZ = null;
      o.freeCan = { along: k < 0.3 };
    } else if (u < 0.6) {
      k = smoothstep((u - 0.44) / 0.16);
      HL.abs = lerp(side, pouch, k);
      HL.grip = 0.3 + 0.8 * k;
      o.canZ = null;
      if (u < 0.56 && f.dropAt) o.freeCan = { drop: (u - 0.44) * 4.6, at: f.dropAt };
      o.head = [0.15, 0.5 * k, 0];
    } else if (u < 0.78) {
      k = smoothstep((u - 0.6) / 0.18);
      HL.abs = lerp(pouch, at(1.9), k);
      o.canZ = null;
      o.freeCan = { along: k > 0.75 };
      o.head = [0.2, 0.5 * (1 - k), 0];
    } else if (u < 0.9) {
      k = smoothstep((u - 0.78) / 0.12);
      HL.abs = at(1.9 * (1 - k));
      o.canZ = -0.75 - 1.9 * (1 - k);
    } else {
      k = (u - 0.9) / 0.1;
      HL.abs = lerp(at(0), hip, smoothstep(k));
      o.flash = k < 0.45;
      o.shotId = 1000 + Math.floor(t / 4.6);
      o.hands[-1].rel = [1.6, -2.3 + 0.9 * sin(PI * Math.min(1, k * 2)), d.A * 0.8];
      o.face = "smile";
    }
    o.hands[1] = HL;
    return o;
  },
  rock(t: number, f: Fig): PoseOut {
    const d = f.d;
    const P = f.P;
    const r = sin(t * 2.1);
    const o = poseBase(d.standY + 0.35 * Math.abs(r) * (r > 0 ? 1 : 0.4));
    o.pz = 1.0 * r;
    o.prot = [0.03 * r, 0, 0];
    o.chest = [-0.04, 0, 0];
    o.head = [-0.06, 0.45 * sin(t * 0.7), 0];
    o.chestScale = 1 + 0.012 * sin(t * 2);
    eachSide((s) => {
      const p = r > 0 ? 0.34 * r : 0.26 * r;
      o.feet[s] = {
        abs: [
          s * P.hipHalf * 1.15,
          P.ank + (p > 0 ? sin(p) * P.shoeL * 0.42 : -sin(p) * 0.7),
          (s > 0 ? 0.3 : -0.1) + (p > 0 ? 0.3 : 0),
        ],
        pitch: p,
        yaw: 0.16,
      };
      o.hands[s] = {
        abs: [s * 0.7, o.py + 0.5, o.pz - P.tD * 0.5 - 0.9],
        hint: [s * 1, -0.1, -0.7],
        grip: 0.9,
      };
    });
    return o;
  },
};
export function mixPose(a: PoseOut, b: PoseOut, k: number): PoseOut {
  const o = poseBase(0);
  const L = function (x: number, y: number) {
    return x + (y - x) * k;
  };
  const LA = function (x: number[], y: number[]) {
    return [L(x[0], y[0]), L(x[1], y[1]), L(x[2], y[2])];
  };
  o.px = L(a.px, b.px);
  o.py = L(a.py, b.py);
  o.pz = L(a.pz, b.pz);
  o.lift = L(a.lift, b.lift);
  (["prot", "spine", "chest", "neck", "head"] as const).forEach((n) => {
    o[n] = LA(a[n], b[n]);
  });
  eachSide((s) => {
    o.hands[s] = {
      abs: LA(a.hands[s].abs!, b.hands[s].abs!),
      hint: LA(a.hands[s].hint, b.hands[s].hint),
      grip: L(a.hands[s].grip ?? 0, b.hands[s].grip ?? 0),
    };
    o.feet[s] = {
      abs: LA(a.feet[s].abs!, b.feet[s].abs!),
      hint: LA(a.feet[s].hint!, b.feet[s].hint!),
      pitch: L(a.feet[s].pitch ?? 0, b.feet[s].pitch ?? 0),
      yaw: L(a.feet[s].yaw ?? 0, b.feet[s].yaw ?? 0),
    };
  });
  return o;
}
export function smoothstep(x: number): number {
  x = Math.min(1, Math.max(0, x));
  return x * x * (3 - 2 * x);
}
export function poseBase(py: number): PoseOut {
  return {
    px: 0,
    py,
    pz: 0,
    prot: [0, 0, 0],
    spine: [0, 0, 0],
    chest: [0, 0, 0],
    neck: [0, 0, 0],
    head: [0, 0, 0],
    hands: {},
    feet: {},
    mouth: "smile",
    lift: 0,
    chestScale: 1,
  };
}
export function eachSide(fn: (s: number) => void): void {
  fn(1);
  fn(-1);
}
