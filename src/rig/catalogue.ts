// Lists saved Ben rigs and their editable frame sequences for the workshop and exporters.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import run from '../../source/ben-side-rig.json';
import pogo from '../../source/ben-pogo-rig.json';
import fire from '../../source/ben-fire-rig.json';
import ladder from '../../source/ben-ladder-rig.json';
import jump from '../../source/ben-jump-rig.json';
import fall from '../../source/ben-fall-rig.json';
import death from '../../source/ben-death-rig.json';
import ledgeLeft from '../../source/ben-ledge-left-rig.json';
import ledge from '../../source/ben-ledge-rig.json';
import whistleLeft from '../../source/ben-whistle-left-rig.json';
import whistleRight from '../../source/ben-whistle-right-rig.json';
import phone from '../../source/ben-phone-rig.json';
import type { SideRig } from './run.ts';

export interface RigEntry { rig: SideRig; prefix: string; animation: string; folder: string; title: string; labels: readonly string[]; }
export const rigCatalogue: readonly RigEntry[] = [
 {rig:run as SideRig,prefix:'ben_walkRight',animation:'walk-run',folder:'ben-running',title:'Run',labels:['Near contact','Near push-off','Flight · far leg leads','Far contact','Far push-off','Flight · near leg leads']},
 {rig:pogo as SideRig,prefix:'ben_pogoRight',animation:'pogo',folder:'ben-pogo',title:'Pogo',labels:['Compress','Launch','Rise','Apex','Fall','Land']},
 {rig:fire as SideRig,prefix:'ben_fireRight',animation:'fizz-blaster',folder:'ben-firing',title:'Fizz Stunner',labels:['Aim','Discharge','Recoil','Recover','Settle','Ready']},
 {rig:ladder as SideRig,prefix:'ben_ladder',animation:'climb',folder:'ben-ladder',title:'Ladder climb',labels:['Left reach','Right hand rises','Right reach','Right support','Left hand rises','Left reach again']},
 {rig:jump as SideRig,prefix:'ben_jumpRig',animation:'jump',folder:'ben-jump',title:'Jump',labels:['Crouch · landing absorbs into takeoff','Launch','Rise','Apex','Tip over','Fall','Drop','Touch down']},
 {rig:fall as SideRig,prefix:'ben_fallRig',animation:'fall',folder:'ben-fall',title:'Fall',labels:['Arms flung out','Near arm flaps up','Knees paddle','Arms sweep down','Far arm flaps up','Knees paddle back']},
 {rig:death as SideRig,prefix:'ben_death',animation:'death',folder:'ben-death',title:'Dramatic death',labels:['The shock','Belly clutch · wobble left','Tongue out · wobble right','Seeing stars · wobble left','Last groan · wobble right','Topple','Curtain call']},
 {rig:ledge as SideRig,prefix:'ben_ledge',animation:'mantle',folder:'ben-ledge',title:'Ledge pull',labels:['Hang','Pull','Haul','Chest over edge','Elbows lock','Swing the knee','Knee up','Plant the foot','Push to crouch','Rise','Stand']},
 {rig:ledgeLeft as SideRig,prefix:'ben_ledgeLeft',animation:'mantle-left',folder:'ben-ledge-left',title:'Ledge pull left',labels:['Hang left','Pull','Haul','Chest over edge','Elbows lock','Swing the knee','Knee up','Plant the foot','Push to crouch','Rise','Stand']},
 {rig:whistleLeft as SideRig,prefix:'ben_whistleLeft',animation:'whistle-left',folder:'ben-whistle-left',title:'Whistle left · standing idle',labels:['Pucker','First note','High note','Low note','Breathe','Repeat']},
 {rig:whistleRight as SideRig,prefix:'ben_whistleRight',animation:'whistle-right',folder:'ben-whistle-right',title:'Whistle right · standing idle',labels:['Pucker','First note','High note','Low note','Breathe','Repeat']},
 {rig:phone as SideRig,prefix:'ben_phone',animation:'phone-idle',folder:'ben-phone',title:'Seated phone idle',labels:['Face the camera','Bend the knees','Sit down','Fold legs','Reach for the phone','Take out phone','Raise screen','Read','Settle and scroll']},
];
