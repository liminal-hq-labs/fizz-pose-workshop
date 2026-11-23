// Checks the page's table of levels and the map's prompts against what the game says.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'bun:test';
import { LEVELS, levelName, promptFor, saucerId, SIGNS } from './levels.ts';

describe('the level table', () => {
	it('names the first area’s levels by the sim’s ids', () => {
		expect(levelName(0)).toBe('Crater Fields');
		expect(levelName(3)).toBe('Meteor Mesa');
		expect(levelName(4)).toBe('Zarg Lookout');
		expect(levelName(99)).toBe('The level');
	});

	it('has the sim’s sixteen levels, and the saucer last', () => {
		expect(LEVELS).toHaveLength(16);
		expect(LEVELS[saucerId]!.name).toBe('The Saucer');
	});

	it('plays the game’s tracks for the two levels it ports, and no track for the others', () => {
		expect(LEVELS[0]).toMatchObject({ track: 'crater', room: 'outdoor' });
		expect(LEVELS[3]).toMatchObject({ track: 'sky', room: 'outdoor' });
		expect(LEVELS.filter((level) => level.track !== null)).toHaveLength(2);
	});
});

describe('the map prompt', () => {
	it('words a level the way the game does, marking one that is cleared', () => {
		expect(promptFor(1, 0, 0)).toEqual({
			title: 'Crater Fields',
			text: 'Twinkling crystal craters and chocolate pools.',
			action: 'Enter',
		});
		expect(promptFor(1, 0, 1)!.text).toBe(
			'Cleared · Twinkling crystal craters and chocolate pools.',
		);
	});

	it('says which level a locked one waits for, and offers no action', () => {
		expect(promptFor(4, 0, 3)).toEqual({
			title: 'Meteor Mesa',
			text: 'Locked until you clear Crater Fields.',
			action: null,
		});
	});

	it('words teleporters, the saucer and the signposts', () => {
		expect(promptFor(2, 0, 1)).toMatchObject({ title: 'Teleporter', action: 'Teleport' });
		expect(promptFor(2, 4, 0)).toMatchObject({
			text: 'Quiet for now. Clear Zarg Lookout to power it.',
			action: null,
		});
		expect(promptFor(3, 0, 0)!.action).toBe('Enter');
		expect(promptFor(5, 0, 0)!.action).toBeNull();
		expect(promptFor(6, 1, 0)).toEqual({ title: 'Sign', text: SIGNS[1]!, action: null });
	});

	it('clears the prompt for type 0 and for an unknown level or type', () => {
		expect(promptFor(0, 0, 0)).toBeNull();
		expect(promptFor(1, 99, 0)).toBeNull();
		expect(promptFor(4, 0, 99)).toBeNull();
		expect(promptFor(9, 0, 0)).toBeNull();
	});
});
