// Asserts the safe parts of the game export contract: the palette letters match the game's table and every cycle has one canvas size.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { test, expect } from 'bun:test';
import palette from '../source/game-palette.json';
import { gameLetters, reportCycles, gameCanvas } from './export-report.ts';

test('the workshop palette uses exactly the game\'s sixteen EGA letters in the game\'s order', () => {
  expect(Object.keys(palette).filter(code => code !== '.').join('')).toBe(gameLetters);
});
test('every saved cycle uses game palette letters only and the 24 by 32 game canvas is the target size', () => {
  const reports = reportCycles();
  expect(reports.length).toBeGreaterThan(0);
  for (const report of reports) { expect(report.unknownLetters).toBe(''); expect(report.frames).toBeGreaterThan(0); }
  expect(gameCanvas).toEqual({ width: 24, height: 32, anchor: [12, 32] });
});
