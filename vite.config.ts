// Serves editable sprites and regenerates project assets when the editor saves.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { readFile, writeFile, copyFile, mkdir, cp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { validateFrames } from './src/model.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const run = promisify(execFile);
let saving = false;
export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { main: root + 'index.html', ...(existsSync(root + 'ben-3d.html') ? { ben3d: root + 'ben-3d.html' } : {}) } } },
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  plugins: [{
    name: 'sprite-project',
    configureServer(server) {
      server.watcher.add(root + 'edits.json');
      server.middlewares.use('/api/save', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"Use POST."}'); return; }
        if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) { res.statusCode = 403; res.end('{"error":"Save from this workshop page."}'); return; }
        if (saving) { res.statusCode = 409; res.end('{"error":"A save is already in progress."}'); return; }
        saving = true;
        let oldEdits;
        try {
          let body = '';
          for await (const chunk of req) { body += chunk; if (body.length > 500_000) throw new Error('The project file is too large.'); }
          const assets = JSON.parse(await readFile(root + 'assets.json', 'utf8'));
          const frames = validateFrames(JSON.parse(body), assets.frames, assets.palette);
          try { oldEdits = await readFile(root + 'edits.json', 'utf8'); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
          server.watcher.unwatch([root + 'assets.json', root + 'edits.json']);
          await writeFile(root + 'edits.json', JSON.stringify(frames, null, 2) + '\n');
          try { await run('bun', ['run', 'scripts/build-assets.ts'], { cwd: root }); }
          catch (error) {
            await writeFile(root + 'edits.json', oldEdits ?? '{}\n');
            throw new Error('Could not regenerate exports. Check the Bun terminal output, then save again.');
          }
          const module = server.moduleGraph.getModuleById(root + 'assets.json');
          if (module) server.moduleGraph.invalidateModule(module);
          res.end(JSON.stringify({ saved: true }));
        } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Could not save the project.' })); }
        finally { saving = false; server.watcher.add([root + 'assets.json', root + 'edits.json']); }
      });
    },
    async closeBundle() {
      await mkdir(root + 'dist', { recursive: true });
      for (const name of ['frames', 'animations', 'sheets', 'rig', 'docs', 'source', 'models', 'assets']) await cp(root + name, root + 'dist/' + name, { recursive: true });
      for (const name of ['assets.json', 'original-study.png', 'README.md', 'AGENTS.md', 'CLAUDE.md', 'preview.html', 'standalone-preview.html']) await copyFile(root + name, root + 'dist/' + name);
    },
  }],
});
