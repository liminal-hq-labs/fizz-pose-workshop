// Describes palette-indexed sprite frames and timed animation sequences.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export interface Frame {
  width: number;
  height: number;
  grid: string[];
}
export type Frames = Record<string, Frame>;
export type Palette = Record<string, string | null>;
export interface Animation {
  frames: string[];
  durationsMs: number[];
}
export interface WorkshopData {
  palette: Palette;
  frames: Frames;
  animations: Record<string, Animation>;
}
export interface SheetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
