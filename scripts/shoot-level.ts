// Takes screenshots of the 3D pages in headless Chromium: a level or the overworld at a chosen spot, or the model gallery.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/*
  bun scripts/shoot-level.ts --out shot.png --at 40,6 --steps 30 --hold right,jump
  bun scripts/shoot-level.ts --out gallery.png --gallery gloop0,gloop1,hopper0 --time 1.2
  bun scripts/shoot-level.ts --out map.png --map --at 12,10 --steps 30 --hold right
  bun scripts/shoot-level.ts --out mesa.png --level 3 --at 40,6

  --map         start a new game on the overworld (the game page, `fizz-3d.html`)
  --level id    start in a level by the sim's id (Crater Fields 0, Meteor Mesa 3, Zarg Lookout 4); with --map, the game
                page starts in that level instead, as it does for `?level`
  --at x,y      place Ben there (tiles) before stepping. In a level the default is the level start; on the map x runs
                east and y north (the map is 60 by 44 tiles), and Ben is placed through the sim's map position, so a
                spot inside a tree or the water falls back to the saucer. The line printed afterwards says where he is
  --steps n     sim steps to run before the picture (60 a second), default 20
  --hold a,b    inputs held during those steps: left right up down jump pogo fire confirm. On the map, confirm at a
                level's entrance enters it, and the page's own flow runs from there (the level name toasts)
  --gallery     with no value, every sprite the level draws; or a comma list of sprite names
  --time s      the gallery's clock, to pick an animation frame
  --columns n, --gap tiles, --distance tiles   gallery layout
  --size WxH    picture size, default 1600x900
  --zoom f      move the level camera closer (2 is twice as close)
  --flat        draw every sprite flat, as the game does, to compare a view with its models
  --stats       print the stage's counts for the picture: draw calls, triangles, actors, milliseconds in sync
  Prints the sprites that still have no 3D model.
*/

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const flag = (name: string): string | undefined => {
	const at = process.argv.indexOf('--' + name);
	if (at < 0) return undefined;
	const next = process.argv[at + 1];
	return next === undefined || next.startsWith('--') ? '' : next;
};
const out = flag('out') ?? 'level.png',
	[width, height] = (flag('size') ?? '1600x900').split('x').map(Number),
	gallery = flag('gallery'),
	map = flag('map') !== undefined,
	level = flag('level'),
	server = await createServer({
		server: { port: 0, strictPort: false, host: '127.0.0.1' },
		logLevel: 'error',
	});
await server.listen();
const address = server.httpServer?.address(),
	port = typeof address === 'object' && address ? address.port : 5173,
	browser = await chromium.launch({
		executablePath: process.env.CHROMIUM_PATH || undefined,
		args: [
			'--no-sandbox',
			'--use-gl=angle',
			'--use-angle=swiftshader',
			'--enable-unsafe-swiftshader',
		],
	}),
	page = await browser.newPage({ viewport: { width, height } });
page.on('pageerror', (error) => console.log('PAGE ERROR', error.message));
page.on('console', (message) => {
	if (message.type() === 'error') console.log('CONSOLE', message.text());
});
try {
	if (gallery !== undefined) {
		const query = new URLSearchParams({ gallery, time: flag('time') ?? '0' });
		for (const name of ['columns', 'gap', 'distance']) if (flag(name)) query.set(name, flag(name)!);
		await page.goto(`http://127.0.0.1:${port}/crater-fields.html?${query}`);
		await page.waitForFunction('window.ready === true', null, { timeout: 60000 });
		await page.waitForTimeout(400);
		console.log('families:', await page.evaluate('window.gallery.families.join(" ")'));
	} else {
		const params = ['paused'];
		if (flag('flat') !== undefined) params.push('flat');
		if (level) params.push(`level=${level}`);
		else if (map) params.push('new');
		await page.goto(
			`http://127.0.0.1:${port}/${map ? 'fizz-3d' : 'crater-fields'}.html?${params.join('&')}`,
		);
		await page.waitForFunction('window.ready === true', null, { timeout: 60000 });
		const at = flag('at')?.split(',').map(Number),
			hold = (flag('hold') ?? '').split(',').filter(Boolean),
			steps = Number(flag('steps') ?? 20),
			zoom = Number(flag('zoom') ?? 1);
		const result = await page.evaluate(
			({ at, hold, steps, zoom }) => {
				const level = (window as unknown as { level: any }).level;
				if (at) {
					if (level.sim.mode === level.Mode.map) level.placeOnMap(at[0], at[1]);
					else level.sim.teleport(at[0], at[1]);
				}
				const held = hold.reduce((bits: number, name: string) => bits | level.Input[name], 0);
				level.stage.zoom = zoom;
				/* The page's own hook runs its flow too: toasts, prompts and the heads-up line follow the steps. */
				level.advance(steps, held);
				const sim = level.sim;
				return {
					missing: [...level.stage.unmodelled].join(' '),
					where: `${level.stage.showing.key}, Ben at ${sim.state(level.State.playerX).toFixed(2)},${sim.state(level.State.playerY).toFixed(2)}`,
					prompt: level.prompt()?.title ?? null,
				};
			},
			{ at, hold, steps, zoom },
		);
		console.log('scene:', result.where, result.prompt ? `· prompt "${result.prompt}"` : '');
		console.log('no model yet:', result.missing || '(none)');
		if (flag('stats') !== undefined)
			console.log(
				'stats:',
				JSON.stringify(await page.evaluate('window.level.stage.stats ?? null')),
			);
	}
	await page.screenshot({ path: out });
	console.log('wrote', out);
} finally {
	await browser.close();
	await server.close();
}
