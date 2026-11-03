// Describes a rig's dynamic prop light (the phone screen) as data a game applies at run time over unlit sprites.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Vec2 } from './kinematics.ts';

/**
 * A rig's `lighting` setting. The sprite pixels stay unlit in the sixteen game colours; the light is extra data per
 * frame: where the source is, how bright it is and which pixels it touches, so a game can brighten them at run time.
 */
export interface LightingSettings {
  /** What carries the light. `phone` follows the held phone and its `screen` channel. */
  source: 'phone';
  /** Offset from the phone's anchor to the centre of its screen, in source pixels. */
  offset: readonly number[];
  /** The light's colour: an EGA palette code and its hex value, for tinting in a renderer that supports it. */
  colour: { code: string; hex: string };
  /** Distance in source pixels at which the light's influence reaches zero. */
  radius: number;
  /** `linear` influence falls from 1 at the source to 0 at `radius`; `smooth` eases with a smoothstep. */
  falloff: 'linear' | 'smooth';
  /** Number of mask levels above zero (3 gives the levels 0–3). */
  levels: number;
  /** Body parts that receive the full light: skin, face and hands. Only skin colours among them are lit. */
  parts: readonly string[];
  /** Palette codes that count as lit skin within those parts. */
  skin: readonly string[];
  /** A fainter spill on other parts (the shirt front, the thighs), capped at `maxLevel`. */
  spill?: { parts: readonly string[]; maxLevel: number };
}

/** One sprite's light (`sprite` names its saved PNG): the source in sprite pixels, its intensity (0–1) and the per-pixel influence mask (`0`–`levels`). */
export interface FrameLight { sprite: string; intensity: number; source: Vec2 | null; mask: string[]; }
/** The saved `lighting.json` beside a rig's sprite exports. */
export interface LightingData {
  version: 1; rig: string; note?: string;
  colour: LightingSettings['colour']; radius: number; falloff: LightingSettings['falloff']; levels: number;
  /** For each palette code, its lit variant at levels 1, 2 and 3. */
  litVariants: Record<string, string[]>;
  frames: FrameLight[];
}

/**
 * One step brighter in the EGA palette, using its dim/bright pairs: black to dark grey, dark grey to light grey, light grey
 * to white, each dim colour to its bright partner and brown to yellow. Bright colours and white stay as they are, so a lit
 * pixel never changes hue and a DOS renderer can brighten through a lookup table with no new art.
 */
export const egaBrighter: Readonly<Record<string, string>> = {
  k: 'D', D: 'L', L: 'W', W: 'W', B: 'b', G: 'g', C: 'c', R: 'r', M: 'm', N: 'y',
  b: 'b', g: 'g', c: 'c', r: 'r', m: 'm', y: 'y',
};

/** Lit variants per code at levels 1–`levels`: the brighter step applied once per level. Transparency stays transparent. */
export function litVariants(levels: number): Record<string, string[]> {
  return Object.fromEntries(Object.keys(egaBrighter).map(code => {
    const steps: string[] = []; let lit = code;
    for (let level = 1; level <= levels; level++) { lit = egaBrighter[lit]; steps.push(lit); }
    return [code, steps];
  }));
}

/** Influence of the light at a distance: 1 at the source, 0 at and beyond the radius. */
export function influence(settings: Pick<LightingSettings, 'radius' | 'falloff'>, distance: number): number {
  const u = Math.max(0, Math.min(1, 1 - distance / settings.radius));
  return settings.falloff === 'smooth' ? u * u * (3 - 2 * u) : u;
}

/**
 * The per-pixel influence mask at full intensity. A pixel is lit only when it was painted as one of the lit parts in a skin
 * colour, or as a spill part (capped lower); outlines and everything else stay at zero. Levels round up, so any pixel inside
 * the radius gets at least level one.
 */
export function lightMask(settings: LightingSettings, grid: readonly string[], parts: readonly (readonly string[])[], source: Vec2 | null): string[] {
  return grid.map((row, y) => [...row].map((code, x) => {
    if (!source || code === '.' || code === 'k') return '0';
    const part = parts[y]?.[x] ?? '', lit = settings.parts.includes(part) && settings.skin.includes(code), spill = settings.spill?.parts.includes(part);
    if (!lit && !spill) return '0';
    const level = Math.ceil(settings.levels * influence(settings, Math.hypot(x + .5 - source[0], y + .5 - source[1])) - 1e-9);
    return String(Math.max(0, Math.min(lit ? settings.levels : settings.spill!.maxLevel, level)));
  }).join(''));
}

/** The level a game applies: the mask level scaled by the frame's intensity, rounded to the nearest whole level. */
export function appliedLevel(mask: number, intensity: number): number { return Math.round(mask * Math.max(0, intensity)); }

/** A lit copy of a sprite grid using the palette lookup, as a DOS renderer would draw it. The input grid is unchanged. */
export function lightGrid(grid: readonly string[], mask: readonly string[], intensity: number, variants: Readonly<Record<string, readonly string[]>>): string[] {
  return grid.map((row, y) => [...row].map((code, x) => {
    const level = Math.min(variants[code]?.length ?? 0, appliedLevel(Number(mask[y]?.[x] ?? 0), intensity));
    return level > 0 ? variants[code][level - 1] : code;
  }).join(''));
}
