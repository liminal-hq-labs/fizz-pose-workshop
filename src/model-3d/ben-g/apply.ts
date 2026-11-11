// Applies one pose frame to the cartoon Ben: spine, limbs, hands, props and carried gear.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as T from "three";
import type { PoseOut, Fig } from "./types.ts";
import { PI, sin, cos, max, V } from "./shared.ts";
import { solveLimb, eulerQuaternion } from "./ik.ts";
import { eachSide } from "./poses.ts";

export function applyPose(fig: Fig, o: PoseOut, t: number): void {
  const J = fig.J;
  const X = fig.X;
  const P = fig.P;
  const pr = fig.props;
  fig.root.position.y = -(o.rootDrop || 0);
  J.pelvis.position.set(o.px, o.py, o.pz);
  J.pelvis.rotation.set(o.prot[0], o.prot[1], o.prot[2]);
  (["spine", "chest", "neck", "head"] as const).forEach((n) => {
    J[n].rotation.set(o[n][0], o[n][1], o[n][2]);
  });
  J.chest.scale.set(1, o.chestScale, o.chestScale);
  fig.turn.updateMatrixWorld(true);
  eachSide((s) => {
    const h = o.hands[s];
    const sh = fig.loc(J["armU" + s]);
    const tg = h.abs ? V(h.abs[0], h.abs[1], h.abs[2]) : sh.add(V(h.rel![0], h.rel![1], h.rel![2]));
    const Qa = solveLimb(
      fig,
      J["armU" + s],
      J["armL" + s],
      P.aU,
      P.aL,
      tg,
      V(h.hint[0], h.hint[1], h.hint[2]),
      -1,
    );
    if (h.wrap) {
      const Qw = new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(V(0, s, 0), V(0, 0, -1), V(-s, 0, 0)),
      );
      J["hand" + s].quaternion.copy(
        Qa.invert().multiply(eulerQuaternion(h.wrap, 0, 0).multiply(Qw)),
      );
    } else J["hand" + s].quaternion.identity();
    const gr = Math.min(h.grip || 0, 1.4);
    X.fingers[s].forEach((fg, i) => {
      const g1 = h.fing ? h.fing[i >> 1] : gr;
      fg.rotation.z = -s * g1 * (i % 2 ? 0.95 : 0.8);
    });
    X.thumbs[s].rotation.z = s * gr * 0.5;
    const ft = o.feet[s];
    const hp = fig.loc(J["legU" + s]);
    const hint = ft.hint || [s * 0.15, 0, 1];
    const fg = ft.abs
      ? V(ft.abs[0], ft.abs[1], ft.abs[2])
      : hp.add(V(ft.rel![0], ft.rel![1], ft.rel![2]));
    const Q2 = solveLimb(
      fig,
      J["legU" + s],
      J["legL" + s],
      P.legU,
      P.legL,
      fg,
      V(hint[0], hint[1], hint[2]),
      1,
    );
    J["foot" + s].quaternion.copy(
      Q2.invert().multiply(eulerQuaternion(ft.pitch || 0, s * (ft.yaw || 0), s * (ft.roll || 0))),
    );
  });
  /* props */
  X.gun.visible = !!o.gun;
  X.holster.visible = !o.gun;
  X.spark.visible = !!o.flash;
  pr.pogo.visible = !!o.pogo || !!o.pogoFree;
  pr.ladder.visible = !!o.ladder;
  pr.ledge.visible = !!o.ledge;
  pr.phone.visible = !!o.phone;
  if (o.pogo) {
    const g = o.pogo;
    const top = g.pegH - g.c;
    pr.pogo.scale.setScalar(1);
    pr.pogo.position.set(g.tip[0], g.tip[1], g.tip[2]);
    pr.pogo.rotation.x = g.lean;
    pr.ride.position.y = top;
    pr.spring.scale.y = max(top - 1.3, 0.3);
    pr.plunger.scale.y = top;
    pr.plunger.position.y = top / 2;
    pr.shaft.scale.y = g.len;
    pr.shaft.position.y = g.len / 2;
    pr.band.position.y = g.len - 1.6;
    pr.bar.position.y = g.len;
  }
  if (o.ladder) {
    pr.ladder.position.set(0, 0, o.ladder.z);
    pr.rungs.position.y = o.ladder.off - 2.4;
  }
  if (o.ledge) pr.ledge.position.set(0, o.ledge.y, 0);
  if (o.phone) {
    pr.phone.position.set(o.phone.p[0], o.phone.p[1], o.phone.p[2]);
    pr.phone.rotation.set(0.75, 0, 0);
    pr.glow.intensity = 0.9 + 0.15 * sin(t * 3);
  } else pr.glow.intensity = 0;
  if (o.fk)
    Object.keys(o.fk).forEach((n) => {
      const e = o.fk![n];
      J[n].quaternion.setFromEuler(
        new T.Euler((e[0] * PI) / 180, (e[1] * PI) / 180, (e[2] * PI) / 180, "XYZ"),
      );
    });
  if (X.aerial) {
    const al = o.aerial || 0;
    X.aerial.visible = al > 0.02;
    X.aerial.scale.y = Math.max(0.05, al * 2.8);
    X.aerialTip!.scale.y = 1 / Math.max(0.05, al * 2.8);
  }
  if (X.gunCan) {
    X.gunCan.visible = o.canZ !== null;
    X.gunCan.position.z = o.canZ === undefined || o.canZ === null ? -0.75 : o.canZ;
  }
  fig.turn.updateMatrixWorld(true);
  const hkk = P.hand / 2.4;
  if (X.helmet) {
    const Hm = o.helmetIn;
    const held = fig.held;
    let tgt: T.Object3D | null = X.helmet;
    const par = Hm ? J["hand" + Hm.hand] : X.hd;
    if (held) {
      X.helmet.visible = !Hm;
      held[1].visible = !!Hm && Hm.hand === 1;
      held[-1].visible = !!Hm && Hm.hand === -1;
      tgt = Hm ? held[Hm.hand] : null;
    } else {
      if (X.helmet.parent !== par) par.add(X.helmet);
      if (!Hm) {
        X.helmet.position.set(0, 0, 0);
        X.helmet.quaternion.identity();
        X.helmet.scale.setScalar(1);
        tgt = null;
      }
    }
    if (Hm && tgt) {
      const spin = Hm.mode === "spin";
      const Qd = spin
        ? eulerQuaternion(0.1 * sin(t * 3.1), Hm.spin ?? 0, 0.1 * cos(t * 2.3))
        : eulerQuaternion(PI + 0.1 * sin(t * 2.2), 0.5, 0.08 * sin(t * 1.7));
      const ql = fig.locQ(par).invert().multiply(Qd);
      const anc = (spin ? V(0, 7.55, -0.7) : V(0, -0.6, 0.55))
        .multiplyScalar(P.hs)
        .applyQuaternion(ql);
      const gp = spin ? V(0, -2.75 * hkk, 0.46 * hkk) : V(-Hm.hand * 0.32 * hkk, -1.6 * hkk, 0);
      tgt.quaternion.copy(ql);
      tgt.scale.setScalar(P.hs);
      tgt.position.copy(gp.sub(anc));
    }
    X.hairTop.visible = !!Hm;
  }
  if (o.pogoFree) {
    const pf = o.pogoFree;
    const plen = pf.len;
    pr.pogo.visible = pf.scale > 0.02;
    pr.pogo.scale.setScalar(pf.scale);
    pr.pogo.rotation.x = pf.lean || 0;
    pr.ride.position.y = 4.6;
    pr.spring.scale.y = 3.3;
    pr.plunger.scale.y = 4.6;
    pr.plunger.position.y = 2.3;
    pr.shaft.scale.y = plen;
    pr.shaft.position.y = plen / 2;
    pr.band.position.y = plen - 1.6;
    pr.bar.position.y = plen;
    pr.pogo.position.set(pf.top[0], pf.top[1] - (4.6 + plen) * pf.scale, pf.top[2]);
  }
  if (X.packPogo) X.packPogo.visible = !(o.pogo || (o.pogoFree && o.pogoFree.scale > 0.11));
  const fc = pr.freeCan;
  fc.visible = !!o.freeCan;
  if (o.freeCan) {
    if (o.freeCan.drop !== undefined) {
      fc.position.set(
        o.freeCan.at![0],
        Math.max(0.8, o.freeCan.at![1] - 60 * o.freeCan.drop * o.freeCan.drop),
        o.freeCan.at![2],
      );
      fc.rotation.set(o.freeCan.drop * 9, 0, 0.6);
    } else {
      const hp = fig.loc(J.hand1);
      const hq2 = fig.locQ(J.hand1);
      fc.position.copy(
        V(-0.5 * hkk, -1.5 * hkk, 0)
          .applyQuaternion(hq2)
          .add(hp),
      );
      if (o.freeCan.along)
        fc.quaternion.copy(fig.locQ(X.gun)).multiply(eulerQuaternion(PI / 2, 0, 0));
      else fc.rotation.set(0.15, 0, 0.1);
      fig.dropAt = [fc.position.x, fc.position.y, fc.position.z];
    }
  }
  if (X.gun.visible) {
    const gq = fig.locQ(X.gun);
    fig.gunAxis = V(0, 0, 1).applyQuaternion(gq);
    fig.canIn = fig.loc(X.gun).add(
      V(0, 0.2, -0.75)
        .multiplyScalar(P.hand / 2.4 > 0 ? 1 : 1)
        .applyQuaternion(gq),
    );
  }
  fig.face = o.face || null;
  fig.turn.updateMatrixWorld(true);
  const mouthP = fig.loc(J.head).add(V(0.6, 1.6 * P.hs, 4.2 * P.hs));
  pr.notes.forEach((n, i) => {
    n.visible = !!o.notes;
    if (!o.notes) return;
    const u = (t * 0.55 + i * 0.5) % 1;
    n.position.set(mouthP.x + 1 + u * 2.2 + sin(u * 7 + i) * 0.4, mouthP.y + u * 5, mouthP.z + 0.3);
    n.rotation.z = 0.25 * sin(u * 6 + i);
    n.scale.setScalar(0.8 + u * 0.5);
    n.userData.m.opacity = u < 0.75 ? 1 : (1 - u) * 4;
  });
  if (o.shotId !== undefined && fig.lastShot !== o.shotId && X.gun.visible) {
    fig.lastShot = o.shotId;
    const sd = V(0, 0, 1).applyQuaternion(fig.locQ(X.gun));
    sd.y = 0;
    sd.normalize();
    fig.shots = (fig.shots || []).slice(-2);
    fig.shots.push({ t0: t, p: fig.loc(X.spark), d: sd });
  }
  if (!o.gun) fig.shots = [];
  pr.bubbles.forEach((b, i) => {
    const sh = (fig.shots || [])[i];
    const age = sh ? t - sh.t0 : -1;
    b.visible = !!sh && age >= 0 && age < 1.3;
    if (!b.visible) return;
    b.position.copy(sh.p).addScaledVector(sh.d, 0.6 + age * 26);
    b.scale.setScalar(0.85 + 0.25 * Math.min(1, age * 6));
    b.material.opacity = age < 0.9 ? 0.92 : (0.92 * (1.3 - age)) / 0.4;
  });
  fig.lift = o.lift;
}
