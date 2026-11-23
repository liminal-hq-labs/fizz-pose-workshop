// The proportions the ground tiles of every theme share: the lane's depth, the crust's thickness and lip, and the strip a hero walks on.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { depth } from '../toon.ts';

/** How many look-alike variants each kind of default tile has; a tile picks one by hashing its position. */
export const variantCount = 8;

/** Half the depth of the ground strip: terrain runs from -half to +half in Z. */
export const half = depth.lane / 2;
/** Half the depth of a floating ledge or block. */
export const shelfHalf = depth.shelf / 2;
/** The vertical thickness of the grassy crust. */
export const crustDepth = 0.2;
/** How far the crust's front lip stands out from the rock face. */
export const lipOut = 0.06;
/** How far back from the front edge the flat top gives way to the lip's bevel. */
export const bevelSpan = 0.07;
/** Where the ground's surface is flat enough to walk on: details that stand above it stay outside |z| < this. */
export const walkBand = 0.55;
/** How far below the crust's edge the rock is in the shadow of its lip. */
export const lipShadow = 0.14;
/** The height above the face at which boulders and gems sit: on top of the stones, which reach `stoneRelief`. */
export const studBase = half + 0.02;
