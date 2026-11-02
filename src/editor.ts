// Edits palette-indexed sprites with stroke history, browser drafts and project exports.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { createHistory, setPixel, validateFrames } from './model.ts';
import { normaliseFrames } from './palette.ts';

import type { Frame, WorkshopData } from './types.ts';

interface EditorState { name: string; frame: Frame }
interface Point { x: number; y: number }

export function initialiseEditor(data: WorkshopData): void {
  const baseline = structuredClone(data.frames);
  const history = createHistory<EditorState>();
  let frameName = 'ben_stand', colour = 'r', tool = 'pencil';
  let stroke: EditorState | null = null, previous: Point | null = null;
  let dirty = false, saving = false;
  const draftKey = 'classic-fizz-workshop-draft-v1';
  const section = document.querySelector<HTMLElement>('#editor')!;
  section.innerHTML = `
    <h2 id="editor-heading">A pixel at a time.</h2>
    <p>Pick a frame and draw directly on the grid. Every gallery and animation preview updates as you paint.</p>
    <div class="editor-layout">
      <div>
        <div class="controls"><label>Frame <select id="edit-frame"></select></label><label><input id="show-grid" type="checkbox" checked>Pixel grid</label></div>
        <div class="editor-board"><canvas id="pixel-canvas" tabindex="0" role="img" aria-label="Sprite editing canvas. Draw with the pointer; use the palette and tool buttons to select a colour."></canvas></div>
        <p id="pixel-position">24 × 44 pixels · native orientation</p>
      </div>
      <div>
        <div class="editor-tools"><button data-tool="pencil" aria-pressed="true">Pencil</button><button data-tool="eraser" aria-pressed="false">Eraser</button><button data-tool="picker" aria-pressed="false">Pick colour</button></div>
        <p class="small">Game EGA palette · 16 colours + transparent</p><div class="palette" aria-label="Game EGA palette: sixteen colours and transparent"></div><p id="selected-colour" class="small"></p>
        <div class="editor-tools"><button id="undo">Undo</button><button id="redo">Redo</button><button id="reset-frame">Reset frame</button></div>
        <div class="editor-tools"><button id="save-project">Save to project</button><button id="export-json">Export JSON</button><button id="export-png">Export PNG</button><label class="file-label">Import JSON<input id="import-json" type="file" accept=".json,application/json"></label></div>
        <p id="editor-status" role="status" aria-live="polite"></p>
        <p class="small">Drafts stay in this browser. Save to project writes the edits and rebuilds the image exports while the development server is running. Export JSON keeps a portable copy.</p>
        <canvas id="native-preview" role="img" aria-label="Current frame at native resolution"></canvas>
      </div>
    </div>`;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => section.querySelector<T>(selector)!;
  const canvas = $<HTMLCanvasElement>('#pixel-canvas'), native = $<HTMLCanvasElement>('#native-preview');
  const select = $<HTMLSelectElement>('#edit-frame');
  const standing = ["ben_stand", "ben_standRight"].filter(name => Object.hasOwn(data.frames, name));
  const frameNames = [...standing, ...Object.keys(data.frames).filter(name => !standing.includes(name))];
  const labels: Record<string, string> = { ben_stand: "ben_stand — Stand left", ben_standRight: "ben_standRight — Stand right · belt stunner" };
  select.replaceChildren(...frameNames.map(name => { const option = document.createElement("option"); option.value = name; option.textContent = labels[name] ?? name; return option; }));
  select.value = frameName;
  const status = (text: string): void => { $('#editor-status').textContent = text; };
  function snapshot(): EditorState { return { name: frameName, frame: structuredClone(data.frames[frameName]) }; }
  function apply(state: EditorState): void { frameName = state.name; data.frames[frameName] = state.frame; select.value = frameName; changed(); }
  function draft() {
    try { localStorage.setItem(draftKey, JSON.stringify(data.frames)); }
    catch { status('Browser storage is unavailable. Export JSON or save to project to keep your edits.'); }
  }
  function changed() {
    dirty = true; draft(); render();
    status('Draft updated in this browser. Save to project to rebuild the exports.');
  }
  try {
    const stored = localStorage.getItem(draftKey);
    if (stored) {
      const frames = validateFrames(normaliseFrames(JSON.parse(stored)), baseline, data.palette);
      Object.assign(data.frames, frames);
      dirty = JSON.stringify(data.frames) !== JSON.stringify(baseline);
      status(dirty ? 'Restored your browser draft. Save to project when ready.' : 'Project loaded.');
    } else status('Project loaded. Select a colour and draw.');
  } catch { status('The saved browser draft could not be read. The project frames are loaded.'); }

  function selectTool(next: string): void { tool = next; section.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === tool))); }
  function selectColour(code: string): void {
    colour = code;
    section.querySelectorAll<HTMLButtonElement>('[data-colour]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.colour === code)));
    $('#selected-colour').textContent = code === '.' ? 'Transparent' : `${code} · ${data.palette[code]}`;
  }
  for (const [code, hex] of Object.entries(data.palette)) {
    const button = document.createElement('button'); button.className = 'swatch' + (hex ? '' : ' transparent');
    button.type = 'button'; button.dataset.colour = code; button.title = hex ? `${code}: ${hex}` : 'Transparent';
    button.setAttribute('aria-label', button.title); button.setAttribute('aria-pressed', 'false');
    if (hex) button.style.backgroundColor = hex;
    button.onclick = () => { selectColour(code); selectTool('pencil'); };
    $('.palette').append(button);
  }
  section.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => { button.onclick = () => selectTool(button.dataset.tool!); });
  function drawFrame(context: CanvasRenderingContext2D, frame: Frame, scale: number): void {
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
      const hex = data.palette[frame.grid[y][x]];
      if (hex) { context.fillStyle = hex; context.fillRect(x * scale, y * scale, scale, scale); }
    }
  }
  function render() {
    const frame = data.frames[frameName], scale = 12;
    canvas.width = frame.width * scale; canvas.height = frame.height * scale;
    const ctx = canvas.getContext('2d')!;
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#334139' : '#29372f'; ctx.fillRect(x * scale, y * scale, scale, scale);
    }
    drawFrame(ctx, frame, scale);
    if ($<HTMLInputElement>('#show-grid').checked) {
      ctx.strokeStyle = '#ffffff24'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0; x <= frame.width; x++) { ctx.moveTo(x * scale + .5, 0); ctx.lineTo(x * scale + .5, canvas.height); }
      for (let y = 0; y <= frame.height; y++) { ctx.moveTo(0, y * scale + .5); ctx.lineTo(canvas.width, y * scale + .5); }
      ctx.stroke();
    }
    native.width = frame.width; native.height = frame.height; drawFrame(native.getContext('2d')!, frame, 1);
    $<HTMLButtonElement>('#undo').disabled = !history.canUndo; $<HTMLButtonElement>('#redo').disabled = !history.canRedo;
    $('#pixel-position').textContent = `${frame.width} × ${frame.height} pixels · ${frameName} · native orientation`;
  }
  function point(event: PointerEvent): Point {
    const frame = data.frames[frameName], box = canvas.getBoundingClientRect();
    return { x: Math.floor((event.clientX - box.left) / box.width * frame.width), y: Math.floor((event.clientY - box.top) / box.height * frame.height) };
  }
  function paint(event: PointerEvent): void {
    const frame = data.frames[frameName], { x, y } = point(event);
    if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) { previous = null; return; }
    $('#pixel-position').textContent = `${frameName} · x ${x}, y ${y}`;
    if (tool === 'picker') { selectColour(frame.grid[y][x]); return; }
    const code = tool === 'eraser' || event.buttons === 2 ? '.' : colour;
    // Interpolate between pointer events so fast drags remain continuous.
    const start = previous ?? { x, y }, steps = Math.max(Math.abs(x - start.x), Math.abs(y - start.y), 1);
    for (let i = 0; i <= steps; i++) setPixel(frame, Math.round(start.x + (x - start.x) * i / steps), Math.round(start.y + (y - start.y) * i / steps), code);
    previous = { x, y }; render();
  }
  function finish() {
    if (!stroke) return;
    const before = stroke; stroke = null; previous = null;
    if (history.record(before, snapshot())) changed();
  }
  canvas.oncontextmenu = event => event.preventDefault();
  canvas.onpointerdown = event => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
    stroke = snapshot(); previous = null; paint(event);
  };
  canvas.onpointermove = event => { if (stroke) paint(event); };
  canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = finish;
  select.onchange = () => { finish(); frameName = select.value; render(); };
  $<HTMLInputElement>('#show-grid').onchange = render;
  $<HTMLButtonElement>('#undo').onclick = () => { finish(); const state = history.undo(); if (state) apply(state); };
  $<HTMLButtonElement>('#redo').onclick = () => { finish(); const state = history.redo(); if (state) apply(state); };
  $('#reset-frame').onclick = () => { finish(); const before = snapshot(); data.frames[frameName] = structuredClone(baseline[frameName]); if (history.record(before, snapshot())) changed(); };
  section.addEventListener('keydown', event => {
    if (event.target instanceof Element && event.target.matches('input,select')) return;
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault(); $(event.shiftKey || event.key.toLowerCase() === 'y' ? '#redo' : '#undo').click();
    }
  });
  function download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('#export-json').onclick = () => { finish(); download(new Blob([JSON.stringify({ frames: data.frames }, null, 2) + '\n'], { type: 'application/json' }), 'ben-edited-frames.json'); };
  $('#export-png').onclick = () => { finish(); native.toBlob(blob => { if (blob) download(blob, frameName + '.png'); }); };
  $<HTMLInputElement>('#import-json').onchange = async event => {
    const input = $<HTMLInputElement>('#import-json');
    const file = input.files?.[0]; if (!file) return;
    try {
      finish(); const parsed = JSON.parse(await file.text()); const frames = validateFrames(normaliseFrames(parsed.frames ?? parsed), baseline, data.palette);
      for (const [name, frame] of Object.entries(frames)) {
        const before = { name, frame: structuredClone(data.frames[name]) };
        data.frames[name] = frame; history.record(before, { name, frame });
      }
      changed(); status(`Imported ${Object.keys(frames).length} frames. Save to project to rebuild exports.`);
    } catch (error) { status(error instanceof Error ? error.message : 'Could not complete the operation.'); }
    input.value = '';
  };
  $<HTMLButtonElement>('#save-project').onclick = async () => {
    if (saving) return;
    finish(); const savedFrames = structuredClone(data.frames); saving = true; $<HTMLButtonElement>('#save-project').disabled = true; status('Saving project and rebuilding image exports…');
    try {
      const response = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(savedFrames) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error ?? 'Project saving needs bun run dev. Export JSON to keep edits from a built preview.');
      }
      Object.assign(baseline, savedFrames); dirty = JSON.stringify(data.frames) !== JSON.stringify(savedFrames); draft();
      status(dirty ? 'Saved the submitted frames. Newer edits remain in your draft; save again to include them.' : 'Saved to project. PNG, SVG, GIF and sprite-sheet exports are rebuilt.');
    } catch (error) { status(error instanceof Error ? error.message : 'Could not complete the operation.'); }
    finally { saving = false; $<HTMLButtonElement>('#save-project').disabled = false; }
  };
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  // Click any static gallery pose to edit it.
  document.querySelectorAll<HTMLCanvasElement>('canvas[data-frame]').forEach(item => { item.style.cursor = 'pointer'; item.onclick = () => { finish(); frameName = item.dataset.frame!; select.value = frameName; render(); section.scrollIntoView({ behavior: 'smooth' }); }; });
  selectColour(colour); render();
}
