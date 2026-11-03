// Loads the rendered 3D turntable reference grids that the pixel editor can trace over.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The published reference set, written by `bun run turntable:render`. */
export const referenceUrl = 'models/ben-3d/turntable-reference/references.json';
interface ReferenceSet { views: { angle: number; grid: string[] }[] }

/** The yaw a saved standing-turn frame shows, or null for any other frame. */
export function turntableAngle(frameName: string): number | null {
  const match = /^ben_turn(\d{3})$/.exec(frameName);
  return match ? Number(match[1]) : null;
}

/** Parses a reference set into grids by angle, ignoring malformed views. */
export function referenceGrids(set: unknown): Map<number, string[]> {
  const grids = new Map<number, string[]>();
  const views = (set as Partial<ReferenceSet> | null)?.views;
  if (!Array.isArray(views)) return grids;
  for (const view of views)
    if (view && Number.isFinite(view.angle) && Array.isArray(view.grid) && view.grid.every(row => typeof row === 'string')) grids.set(view.angle, view.grid);
  return grids;
}

let pending: Promise<Map<number, string[]>> | null = null;
/** Fetches the reference set once; a failed fetch can be retried. */
export function loadTurntableReference(): Promise<Map<number, string[]>> {
  pending ??= fetch(referenceUrl)
    .then(response => { if (!response.ok) throw new Error(`Reference renders are unavailable (${response.status}).`); return response.json(); })
    .then(referenceGrids)
    .catch(error => { pending = null; throw error; });
  return pending;
}
