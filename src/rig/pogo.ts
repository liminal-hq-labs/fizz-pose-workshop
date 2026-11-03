// Places the side-view pogo stick from its keyed lift, lean and spring compression, and binds Ben's grips and footpegs to it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { add, rotate, type Vec2 } from './kinematics.ts';

/**
 * Pixel dimensions of the side-view pogo stick, measured along its shaft from the bottom row of the rubber tip. The spring
 * sits between the tip and the peg collar, so the collar, the footpegs, the shaft and the handlebar ride down as it
 * compresses. Offsets are right-facing canvas pixels, x forward and y down, before the stick's lean is applied.
 */
export interface PogoSettings {
	/** Rows of the rubber tip and its spring cap. */
	footHeight: number;
	/** Spring rows fully extended and fully compressed. */
	springExtended: number;
	springCompressed: number;
	/** Shaft rows from the peg collar up to the handlebar. */
	shaftLength: number;
	/** Where each sole rests, from the collar centre: `[near, far]`. The far peg sits back and up for the three-quarter view. */
	pegs: number[][];
	/** Where each hand closes, from the handlebar centre: `[near, far]`. */
	grips: number[][];
}

/** One moment of the stick: what the sampler keys and what the skin draws. */
export interface PogoStickPose {
	/** Bottom centre of the rubber tip. */
	tip: Vec2;
	/** Spring top, under the peg collar. */
	springTop: Vec2;
	/** Handlebar centre. */
	shaftTop: Vec2;
	/** The collar the pegs hang from, on its pixel row. */
	collar: Vec2;
	/**
	 * The collar before the tip and spring snap to whole rows. Ben's pelvis rides this point, so the body moves smoothly while
	 * the stick and the soles on its pegs step a whole row at a time.
	 */
	ride: Vec2;
	grips: readonly [Vec2, Vec2];
	/** Where the near and far soles rest. */
	pegs: readonly [Vec2, Vec2];
	/** Whole spring rows drawn for this pose. */
	springLength: number;
	/** 0 fully extended, 1 fully compressed. */
	compression: number;
	/** Shaft lean in radians; positive tips the handlebar forward. */
	lean: number;
	grounded: boolean;
}

/**
 * Places the stick. `x` is the tip's column, `lift` how far the tip has left the ground and `compression` the spring's load.
 * The tip, collar and pegs snap to whole rows, so the shoes on the pegs and the coils between them never part or overlap by
 * a stray pixel; the shaft keeps its continuous lean.
 */
export function pogoStickPose(settings: PogoSettings, groundY: number, x: number, lift: number, compression: number, lean: number): PogoStickPose {
	const squeeze = Math.max(0, Math.min(1, compression));
	const springLength = Math.round(settings.springExtended - (settings.springExtended - settings.springCompressed) * squeeze);
	const tipRow = groundY - Math.round(Math.max(0, lift));
	// Rows along the shaft: the lean moves each row forward by its height times tan(lean).
	const along = (rows: number): Vec2 => [x + rows * Math.tan(lean), tipRow - rows];
	const collarRows = settings.footHeight + springLength;
	const collar = along(collarRows), springTop = along(collarRows - 1), shaftTop = along(collarRows + settings.shaftLength);
	const offset = (point: Vec2, local: readonly number[]): Vec2 => add(point, rotate([local[0], local[1]], lean));
	const smoothRows = settings.footHeight + settings.springExtended - (settings.springExtended - settings.springCompressed) * squeeze;
	const ride: Vec2 = [x + smoothRows * Math.tan(lean), groundY - Math.max(0, lift) - smoothRows];
	return {
		tip: [x, tipRow], springTop, shaftTop, collar, ride,
		pegs: [[collar[0] + settings.pegs[0][0], collar[1] + settings.pegs[0][1]], [collar[0] + settings.pegs[1][0], collar[1] + settings.pegs[1][1]]],
		grips: [offset(shaftTop, settings.grips[0]), offset(shaftTop, settings.grips[1])],
		springLength, compression: squeeze, lean, grounded: tipRow >= groundY,
	};
}

/**
 * The ankle for a sole resting on `peg` with the foot pitched by `pitch` (positive points the toe down). The foot turns about
 * the ball, which stays on the peg, so a raised heel lifts the ankle instead of sinking the toe through the peg.
 */
export function ankleOnPeg(peg: Vec2, ball: readonly number[], pitch: number): Vec2 {
	const offset = rotate([ball[0], ball[1]], pitch);
	return [peg[0] - offset[0], peg[1] - offset[1]];
}

/** Checks the stick settings: positive lengths, an ordered spring and one offset pair each for the pegs and grips. */
export function validPogo(settings: PogoSettings | undefined): boolean {
	if (!settings) return false;
	const lengths = [settings.footHeight, settings.springExtended, settings.springCompressed, settings.shaftLength];
	const pairs = [...settings.pegs, ...settings.grips];
	return lengths.every(value => Number.isInteger(value) && value > 0) && settings.springCompressed < settings.springExtended
		&& settings.pegs.length === 2 && settings.grips.length === 2 && pairs.every(pair => pair.length === 2 && pair.every(Number.isFinite));
}
