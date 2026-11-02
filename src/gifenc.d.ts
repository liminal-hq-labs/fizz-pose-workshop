// Types the GIF encoder surface used by the asset exporter.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

declare module 'gifenc' {
  interface Encoder {
    writeFrame(pixels: Uint8Array, width: number, height: number, options: {
      palette: number[][];
      transparent: boolean;
      transparentIndex: number;
      delay: number;
      repeat: number;
      dispose: number;
    }): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  export function GIFEncoder(): Encoder;
}
