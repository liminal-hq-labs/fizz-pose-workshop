// Exports reusable joint diagrams and a smooth animated SVG from sampled side-view rigs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { sampleRig } from './sample.ts';

import { type RigPose, type SideRig } from './run.ts';
import type { Vec2 } from './kinematics.ts';

const number = (n: number): string => n.toFixed(3);
const point = (p: Vec2): string => `${number(p[0])},${number(p[1])}`;
export function rigDrawing(pose: RigPose, ground: number, width: number): string {
  const line = (points: readonly Vec2[], colour: string, stroke = .3): string => `<polyline points="${points.map(point).join(' ')}" fill="none" stroke="${colour}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const joints = (points: readonly Vec2[], colour: string): string => points.map(p => `<circle cx="${number(p[0])}" cy="${number(p[1])}" r=".28" fill="${colour}"/>`).join('');
  let equipment = '';
  const environment = pose.presentation?.environment;
  if (environment?.kind === 'ladder') {
    for (const x of [environment.x, environment.x + environment.width]) equipment += line([[x,environment.y],[x,ground]], '#688276', .15);
    for(let y=environment.y;y<=ground;y+=environment.spacing) equipment += line([[environment.x,y],[environment.x+environment.width,y]],'#688276',.15);
  } else if (environment) equipment += line([[environment.x,ground],[environment.x,environment.y],[environment.x+environment.width,environment.y]],'#688276',.3);
  if (pose.presentation?.phone) equipment += line([pose.presentation.phone,[pose.presentation.phone[0],pose.presentation.phone[1]-3]],'#55ffff',.9);
  if (pose.pogo) {
    const p = pose.pogo, coils: Vec2[] = [p.springTop];
    for (let i = 1; i < 6; i++) coils.push([p.tip[0] + (i % 2 ? -1 : 1), p.springTop[1] + p.springLength * i / 6]);
    coils.push(p.tip);
    equipment = line([p.springTop, p.shaftTop], '#ddd', .4) + line(p.pegs, '#ddd', .4)
      + line([[p.shaftTop[0] - 3, p.shaftTop[1]], [p.shaftTop[0] + 3, p.shaftTop[1]]], '#ddd', .4)
      + line(coils, p.grounded ? '#fff66b' : '#ddd', .25);
  } else if (pose.weapon) equipment = line([pose.weapon.grip, pose.weapon.muzzle], pose.weapon.flash ? '#ffff55' : '#ff55ff', .8);
  return equipment + `<path d="M0 ${ground}H${width}" stroke="#465f50" stroke-width=".12"/>`
    + line(pose.farLeg, '#9573bc') + line(pose.farArm, '#9573bc')
    + line([pose.root, pose.neck], '#eeeeaa', .45) + line([pose.nearArm[0], pose.farArm[0]], '#ffaa55', .5)
    + line(pose.nearLeg, '#74e5fa', .4) + line(pose.nearArm, '#74e5fa', .4)
    + line([pose.nearFoot.heel, pose.nearFoot.ball, pose.nearFoot.toe], pose.nearFoot.stance ? '#fff66b' : '#74e5fa', .3)
    + line([pose.farFoot.heel, pose.farFoot.ball, pose.farFoot.toe], pose.farFoot.stance ? '#fff66b' : '#9573bc', .3)
    + joints(pose.nearLeg, '#74e5fa') + joints(pose.nearArm, '#74e5fa')
    + joints(pose.farLeg, '#9573bc') + joints(pose.farArm, '#9573bc')
    + `<ellipse cx="${number(pose.neck[0])}" cy="${number(pose.neck[1] - 6)}" rx="4.5" ry="5.5" fill="none" stroke="#9ee47a" stroke-width=".25"/>`
    + `<circle cx="${number(pose.face.eye.world[0])}" cy="${number(pose.face.eye.world[1])}" r=".17" fill="#71b7ff"/><circle cx="${number(pose.face.mouth.world[0])}" cy="${number(pose.face.mouth.world[1])}" r=".17" fill="#ff7d7d"/><circle cx="${number(pose.face.ear.world[0])}" cy="${number(pose.face.ear.world[1])}" r=".17" fill="#d7b775"/>`
    + line([[pose.neck[0], pose.neck[1] - 6], [pose.neck[0] + 3, pose.neck[1] - 6 + pose.headTurn * .45]], '#9ee47a', .2);
}
export function rigSvg(rig: SideRig, time?: number): string {
  const envelope = (body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" width="${rig.width * 10}" height="${rig.height * 10}" viewBox="0 0 ${rig.width} ${rig.height}"><title>${rig.name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</title><rect width="100%" height="100%" fill="#102018"/>${body}</svg>\n`;
  if (time !== undefined) return envelope(rigDrawing(sampleRig(rig, time), rig.groundY, rig.width));
  const count = 60, loop = rig.performance?.loop ?? true;
  const css = Array.from({ length: count }, (_, i) => `.f${i}{animation:r${i} ${rig.durationMs}ms steps(1,end) ${loop ? 'infinite' : '1 forwards'}}@keyframes r${i}{0%{visibility:${i === 0 ? 'visible' : 'hidden'}}${(i / count * 100).toFixed(6)}%{visibility:visible}${((i + 1) / count * 100).toFixed(6)}%{visibility:hidden}100%{visibility:${!loop && i === count-1 ? 'visible' : 'hidden'}}}`).join('')
    + '@media(prefers-reduced-motion:reduce){.f{animation:none!important;visibility:hidden!important}.f0{visibility:visible!important}}';
  return envelope(`<style>${css}</style>` + Array.from({ length: count }, (_, i) => `<g class="f f${i}" visibility="hidden">${rigDrawing(sampleRig(rig, i / (loop ? count : count - 1)), rig.groundY, rig.width)}</g>`).join(''));
}
