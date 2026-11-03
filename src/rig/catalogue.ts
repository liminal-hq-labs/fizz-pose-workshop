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
import ledge from '../../source/ben-ledge-rig.json';
import whistleLeft from '../../source/ben-whistle-left-rig.json';
import whistleRight from '../../source/ben-whistle-right-rig.json';
import phone from '../../source/ben-phone-rig.json';
import phoneTyping from '../../source/ben-phone-typing-rig.json';
import type { SideRig } from './run.ts';

// The left-facing run turns the pinned right-facing run round with the same continuous solver and keys, so its twelve sprites keep the
// right run's timing, stride and hand-edited faces while the Stunner stays on Ben's right hip, which now faces away.
const runLeft: SideRig = { ...(run as SideRig), name: 'Ben · left-facing running rig', facing: 'left' };
// The left-facing jump, fall and ledge pull turn the right-facing rig round, keeping the Stunner on Ben's right (far) hip, so each pair shares one set of keys.
const jumpLeft: SideRig = { ...(jump as SideRig), name: 'Ben · left-facing jump rig', facing: 'left' };
const fallLeft: SideRig = { ...(fall as SideRig), name: 'Ben · left-facing brace-for-impact fall rig', facing: 'left' };
const ledgeLeft: SideRig = { ...(ledge as SideRig), name: 'Ben · left-facing ledge pull rig', facing: 'left' };

/**
 * Extra single sprites drawn from the same rig on another canvas, such as the legacy two-frame climb: each `times` phase is
 * rendered on the rig canvas and cropped by `offset` to `width` by `height`, saved as `prefix` + 1, 2, …
 */
export interface RigStills { prefix: string; times: readonly number[]; width: number; height: number; offset: readonly [number, number]; }
/**
 * A one-shot entry may hand over to a looping `then` action when it finishes (the sit-down leads into typing). A loop may name
 * a `sequence`: a saved animation that plays its `leadIn` once, then the loop `repeats` times, then restarts.
 */
export interface RigEntry { rig: SideRig; prefix: string; animation: string; folder: string; title: string; labels: readonly string[]; stills?: RigStills; then?: string; sequence?: { name: string; leadIn: string; repeats: number }; }
export const rigCatalogue: readonly RigEntry[] = [
 {rig:run as SideRig,prefix:'ben_walkRight',animation:'walk-run',folder:'ben-running',title:'Run',labels:['Near contact','Near roll-through','Near push-off','Near toe-off','Flight · far leg leads','Far leg reaches','Far contact','Far roll-through','Far push-off','Far toe-off','Flight · near leg leads','Near leg reaches']},
 {rig:runLeft,prefix:'ben_walkLeft',animation:'walk-run-left',folder:'ben-running-left',title:'Run left',labels:['Near contact','Near roll-through','Near push-off','Near toe-off','Flight · far leg leads','Far leg reaches','Far contact','Far roll-through','Far push-off','Far toe-off','Flight · near leg leads','Near leg reaches']},
 {rig:pogo as SideRig,prefix:'ben_pogoRight',animation:'pogo',folder:'ben-pogo',title:'Pogo',labels:['Compress','Launch','Rise','Apex','Fall','Land']},
 {rig:fire as SideRig,prefix:'ben_fireRight',animation:'fizz-blaster',folder:'ben-firing',title:'Fizz Stunner',labels:['Aim','Discharge','Recoil','Recover','Settle','Ready']},
 {rig:ladder as SideRig,prefix:'ben_ladder',animation:'climb',folder:'ben-ladder',title:'Ladder climb',labels:['Left hand grips high','Pull up on the left hand','Right hand lets go','Right hand reaches','Right hand grips high','Pull up on the right hand','Left hand lets go','Left hand reaches'],stills:{prefix:'ben_climb',times:[0,.5],width:24,height:44,offset:[4,6]}},
 {rig:jump as SideRig,prefix:'ben_jumpRig',animation:'jump',folder:'ben-jump',title:'Jump',labels:['Crouch','Launch','Apex','Fall','Land','Recover']},
 {rig:jumpLeft,prefix:'ben_jumpLeft',animation:'jump-left',folder:'ben-jump-left',title:'Jump left',labels:['Crouch','Launch','Apex','Fall','Land','Recover']},
 {rig:fall as SideRig,prefix:'ben_fallRig',animation:'fall',folder:'ben-fall',title:'Fall · brace for impact',labels:['Braced · lowest','Leans in · rising','Leans in · high','Braced · highest','Leans back · dropping','Leans back · low']},
 {rig:fallLeft,prefix:'ben_fallLeft',animation:'fall-left',folder:'ben-fall-left',title:'Fall left · brace for impact',labels:['Braced · lowest','Leans in · rising','Leans in · high','Braced · highest','Leans back · dropping','Leans back · low']},
 {rig:death as SideRig,prefix:'ben_death',animation:'death',folder:'ben-death',title:'Dramatic death',labels:['The shock','Belly clutch · wobble left','Tongue out · wobble right','Seeing stars · wobble left','Last groan · wobble right','Topple','Curtain call']},
 {rig:ledge as SideRig,prefix:'ben_ledge',animation:'mantle',folder:'ben-ledge',title:'Ledge pull',labels:['Hang','Pull','Haul','Chest over edge','Elbows lock','Swing the knee','Knee up','Plant the foot','Push to crouch','Rise','Stand']},
 {rig:ledgeLeft,prefix:'ben_ledgeLeft',animation:'mantle-left',folder:'ben-ledge-left',title:'Ledge pull left',labels:['Hang left','Pull','Haul','Chest over edge','Elbows lock','Swing the knee','Knee up','Plant the foot','Push to crouch','Rise','Stand']},
 {rig:whistleLeft as SideRig,prefix:'ben_whistleLeft',animation:'whistle-left',folder:'ben-whistle-left',title:'Whistle left · standing idle',labels:['Beat · note leaves the lips','Sway forward','Release · toe lifts','Second beat','Sway back · blink','Toe lifts']},
 {rig:whistleRight as SideRig,prefix:'ben_whistleRight',animation:'whistle-right',folder:'ben-whistle-right',title:'Whistle right · standing idle',labels:['Beat · note leaves the lips','Sway forward','Release · toe lifts','Second beat','Sway back · blink','Toe lifts']},
 {rig:phone as SideRig,prefix:'ben_phone',animation:'phone-idle',folder:'ben-phone',title:'Seated phone idle',labels:['Face the camera','Bend the knees','Sit down','Fold legs','Reach for the phone','Take out phone','Raise screen','Read','Settle and scroll'],then:'phone-typing'},
 {rig:phoneTyping as SideRig,prefix:'ben_phoneType',animation:'phone-typing',folder:'ben-phone-typing',title:'Phone typing loop',labels:['Far thumb taps','Near thumb taps','Far tap · breathe in','Pause · blink','Near thumb taps','Far tap · foot jiggles','Near tap · breathe in','Pause · glance up'],sequence:{name:'phone-sit-and-type',leadIn:'phone-idle',repeats:3}},
];

/** The catalogue index an entry hands over to when it finishes (its `then`), or -1 when it has none. */
export function handoverTarget(entry: RigEntry): number { return entry.then ? rigCatalogue.findIndex(item => item.animation === entry.then) : -1; }
