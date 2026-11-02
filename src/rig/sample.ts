// Selects the continuous motion sampler for reusable side-view rigs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { sampleRunRig, type SideRig, type RigPose } from './run.ts';
import { sampleActionRig } from './actions.ts';
export function sampleRig(rig: SideRig, time: number): RigPose {
  return rig.motion === 'pogo' || rig.motion === 'fire' ? sampleActionRig(rig, time) : sampleRunRig(rig, time);
}
