// What the page knows about the game's levels and map: their names, music, rooms, the map's prompts and signposts.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Ported from episodes/episode-1/src/story.ts (`LEVELS`, `SIGNS`) and the prompt wording of `promptFor` in
// episodes/episode-1/src/game.ts of liminal-hq/lieutenant-fizz at commit 94f354d. Only the levels of the first area
// are given in full; the other ids carry their name and a shortened cleared line so a card can name them, and their music and rooms are not ported.

import type { RoomName } from './audio/rooms.ts';

/** What the page needs to know about one level. */
export interface LevelInfo {
	name: string;
	blurb: string;
	/** The music track played in it (`track` in the game), or null when this page has not ported the track. */
	track: string | null;
	/** The room its sound is heard in. */
	room: RoomName;
	/** The line on the level-cleared card. */
	cleared: string;
}

/** The music track the overworld plays. */
export const mapTrack = 'map';

/** Indexed by the sim's level id; ids this page does not draw yet still have a name and fall back to the neutral room. */
export const LEVELS: LevelInfo[] = [
	{
		name: 'Crater Fields',
		blurb: 'Twinkling crystal craters and chocolate pools.',
		track: 'crater',
		room: 'outdoor',
		cleared:
			'The path on to Meteor Mesa is open. Clear it and Zarg Lookout, and the first teleporter will hum.',
	},
	{
		name: 'Crystal Caves',
		blurb: 'Dark, glittering tunnels over chocolate rivers.',
		track: null,
		room: 'neutral',
		cleared:
			'One of the two levels the Frosting Frontier teleporter wants is done. Mirror Shafts is the other.',
	},
	{
		name: "Mildred's Citadel",
		blurb: 'A castle of cake, cookie doors and frozen chocolate.',
		track: null,
		room: 'neutral',
		cleared: 'The Citadel is cleared.',
	},
	{
		name: 'Meteor Mesa',
		blurb: 'Biscuit-rock mesas in open sky, with cloud ledges between them.',
		track: 'sky',
		room: 'outdoor',
		cleared: 'The sky is clear all the way to the horizon. Zarg Lookout is next along the path.',
	},
	{
		name: 'Zarg Lookout',
		blurb: 'A watchtower of ladders, stairs and one slow lift. The red key is on the roof.',
		track: null,
		room: 'neutral',
		cleared: 'The first teleporter is humming now, and Marshmallow Meadows are waiting.',
	},
	{
		name: 'Marshmallow Meadows',
		blurb: 'Soft hills, fenced-in marshmallows to bounce off, and a blue key in the clouds.',
		track: null,
		room: 'neutral',
		cleared: 'Marshmallow fluff clings to Ben’s boots. Somewhere ahead, the music of a playhouse.',
	},
	{
		name: 'Bonbon Playhouse',
		blurb: 'A candy theatre. The walls are only painted flats, so walk right in.',
		track: null,
		room: 'neutral',
		cleared: 'The curtain falls on a very sticky stage.',
	},
	{
		name: 'Fudge Bog',
		blurb: 'Wide pools of hot fudge, stepping stones and three very puffy spore pods.',
		track: null,
		room: 'neutral',
		cleared: 'Ben wipes fudge off his boots. That was the hard way round, and he knows it.',
	},
	{
		name: 'Mirror Shafts',
		blurb:
			'A tall crystal shaft sealed by gates. Bounce fizz off the mirrors to reach the switches.',
		track: null,
		room: 'neutral',
		cleared: 'The last gate slides open and the shaft hums.',
	},
	{
		name: 'Sugar Glass Gallery',
		blurb: 'A long gallery of hidden rooms. Not everything on these walls is decoration.',
		track: null,
		room: 'neutral',
		cleared: 'Ben leaves the gallery with a head full of paintings and pockets full of crumbs.',
	},
	{
		name: 'Frosting Flats',
		blurb: 'Long, open stretches of frosted rock, spike runs and hover platforms. Mind the drones.',
		track: null,
		room: 'neutral',
		cleared: 'A long way across, and not a single frosting stain on Ben’s helmet. Almost.',
	},
	{
		name: 'Frosting Spire',
		blurb: 'The tallest Zarg tower: twelve floors, three lifts, and a key in every colour.',
		track: null,
		room: 'neutral',
		cleared: 'Twelve floors up and twelve floors down, and Ben’s knees have opinions about it.',
	},
	{
		name: 'Cocoa Foundry',
		blurb: 'Belts, presses and pools of molten metal. Mind the timing, and mind the belts.',
		track: null,
		room: 'neutral',
		cleared: 'The presses thump on without him. Ben dusts the soot off his helmet.',
	},
	{
		name: 'Gumdrop Isle',
		blurb: 'A secret island, covered in snacks. Nobody was supposed to find this place.',
		track: null,
		room: 'neutral',
		cleared:
			'Ben leaves the island with a few more lives than he came with, and a very full pocket.',
	},
	{
		name: 'Whisper Hollow',
		blurb: 'A cave for climbers: a vine rope over fudge, a chimney to kick up, and hanging vines.',
		track: null,
		room: 'neutral',
		cleared: 'Ben’s arms ache and his boots are scuffed.',
	},
	{
		name: 'The Saucer',
		blurb: 'Ben’s own flying saucer, parked and steaming. Nothing to clear; just a look around.',
		track: null,
		room: 'neutral',
		cleared: '',
	},
];

/** The id of the saucer walk-through: a level with no goal, so it never shows a cleared card. */
export const saucerId = 15;

/** Signposts in Crater Corners, by the text number each sign point carries. */
export const SIGNS: string[] = [
	'Welcome to Crater Corners. Population: nine, plus one very confident cat. Please wipe your boots.',
	'The Sticky Bun Bakery: closed since the Zargs borrowed the cocoa. Sorry, no refunds.',
	'The fountain used to run chocolate. Now it runs on hope and a leaky pipe.',
];

/** The name of a level, or a stand-in for an id the table does not have. */
export function levelName(id: number): string {
	return LEVELS[id]?.name ?? 'The level';
}

/** A prompt the map shows when Ben stands at a landmark. */
export interface MapPrompt {
	title: string;
	text: string;
	/** What Enter does there, or null when it does nothing. */
	action: string | null;
}

/**
 * The map's prompt for a MAP_PROMPT event, as the game words it. `type` is the event's first number, `id` its second
 * and `extra` its third: 1 a level (`extra` 1 when cleared), 2 a teleporter, 3 the saucer, 4 a locked level (`id` the
 * level still to clear, `extra` the locked level), 5 the dormant teleporter and 6 a signpost (`id` the text). Type 0, or
 * a type this does not know, clears the prompt.
 */
export function promptFor(type: number, id: number, extra: number): MapPrompt | null {
	if (type === 1) {
		const info = LEVELS[id];
		return info
			? { title: info.name, text: (extra === 1 ? 'Cleared · ' : '') + info.blurb, action: 'Enter' }
			: null;
	}
	if (type === 4) {
		const info = LEVELS[extra];
		return info
			? {
					title: info.name,
					text: `Locked until you clear ${LEVELS[id]?.name ?? 'another level'}.`,
					action: null,
				}
			: null;
	}
	if (type === 2) {
		const required = LEVELS[id]?.name ?? 'a level';
		return extra === 1
			? { title: 'Teleporter', text: 'Humming and ready.', action: 'Teleport' }
			: {
					title: 'Teleporter',
					text: `Quiet for now. Clear ${required} to power it.`,
					action: null,
				};
	}
	if (type === 5)
		return {
			title: 'A dormant teleporter',
			text: 'Humming faintly, and going nowhere. Somewhere, something is hiding its other half.',
			action: null,
		};
	if (type === 6) return { title: 'Sign', text: SIGNS[id] ?? '', action: null };
	if (type === 3)
		return {
			title: 'Spaghetti with meatballs flying saucer',
			text: 'Parked and steaming gently. Step inside for a look around.',
			action: 'Enter',
		};
	return null;
}
