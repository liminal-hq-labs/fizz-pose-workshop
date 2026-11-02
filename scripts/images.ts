// Encodes palette-indexed pixel grids as transparent PNG, SVG and GIF images.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { PNG } from 'pngjs';
import { GIFEncoder } from 'gifenc';
import type { Frame, Palette } from '../src/types.ts';

export function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
export function raster(frame: Frame, palette: Palette, scale = 1): PNG {
  const image = new PNG({ width: frame.width * scale, height: frame.height * scale });
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const colour = palette[frame.grid[y][x]];
    if (!colour) continue;
    const channels = rgb(colour);
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const offset = ((y * scale + dy) * image.width + x * scale + dx) * 4;
      image.data[offset] = channels[0]; image.data[offset + 1] = channels[1]; image.data[offset + 2] = channels[2]; image.data[offset + 3] = 255;
    }
  }
  return image;
}
export function png(frame: Frame, palette: Palette, scale = 1): Buffer {
  return PNG.sync.write(raster(frame, palette, scale));
}
export function rects(frame: Frame, palette: Palette): string {
  const result: string[] = [];
  frame.grid.forEach((row, y) => [...row].forEach((code, x) => {
    if (palette[code]) result.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[code]}"/>`);
  }));
  return result.join('\n');
}
export function gif(frames: Frame[], durations: number[], palette: Palette): Uint8Array {
  const colours = Object.values(palette).filter((value): value is string => value !== null);
  const colourTable = [[0, 0, 0], ...colours.map(rgb)];
  const encoder = GIFEncoder();
  frames.forEach((frame, index) => {
    const indices = Uint8Array.from(frame.grid.join(''), code => palette[code] ? colours.indexOf(palette[code]!) + 1 : 0);
    encoder.writeFrame(indices, frame.width, frame.height, { palette: colourTable, transparent: true, transparentIndex: 0, delay: durations[index], repeat: 0, dispose: 2 });
  });
  encoder.finish();
  return encoder.bytes();
}
