// Takes screenshots of the 3D level page in headless Chromium: the level at a chosen spot, or the model gallery.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/*
  bun scripts/shoot-level.ts --out shot.png --at 40,6 --steps 30 --hold right,jump
  bun scripts/shoot-level.ts --out gallery.png --gallery gloop0,gloop1,hopper0 --time 1.2

  --at x,y      place Ben there (tiles) before stepping; the default is the level start
  --steps n     sim steps to run before the picture (60 a second), default 20
  --hold a,b    inputs held during those steps: left right up down jump pogo fire
  --gallery     with no value, every sprite the level draws; or a comma list of sprite names
  --time s      the gallery's clock, to pick an animation frame
  --columns n, --gap tiles, --distance tiles   gallery layout
  --size WxH    picture size, default 1600x900
  --zoom f      move the level camera closer (2 is twice as close)
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
		await page.goto(`http://127.0.0.1:${port}/crater-fields.html?paused`);
		await page.waitForFunction('window.ready === true', null, { timeout: 60000 });
		const at = flag('at')?.split(',').map(Number),
			hold = (flag('hold') ?? '').split(',').filter(Boolean),
			steps = Number(flag('steps') ?? 20),
			zoom = Number(flag('zoom') ?? 1);
		const missing = await page.evaluate(
			({ at, hold, steps, zoom }) => {
				const level = (window as unknown as { level: any }).level;
				if (at) level.sim.teleport(at[0], at[1]);
				const held = hold.reduce((bits: number, name: string) => bits | level.Input[name], 0);
				level.stage.advance(steps, held);
				if (zoom !== 1) {
					const camera = level.stage.camera,
						ben = level.stage.draws.find((draw: { name: string }) => draw.name.startsWith('ben_'));
					camera.position.set(ben.x - 0.6, ben.y + 1.2, 27 / zoom);
					camera.lookAt(ben.x, ben.y, 0);
					level.stage.renderer.render(level.stage.scene, camera);
				}
				return [...level.stage.unmodelled].join(' ');
			},
			{ at, hold, steps, zoom },
		);
		console.log('no model yet:', missing || '(none)');
	}
	await page.screenshot({ path: out });
	console.log('wrote', out);
} finally {
	await browser.close();
	await server.close();
}
