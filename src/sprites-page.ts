// Builds the Ben sprite checklist page: old and new sprites side by side with status and filters.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/// <reference types="vite/client" />

import workshop from '../assets.json';
import './style.css';
import './sprites.css';
import {
  STATUSES, buildFacingMatrix, defaultFilters, facingInfo, FACINGS, isMissingSide, isSideView, rowsMissingSide, filterSlots, frameIndexAt, frameOffset, gridSize, gridToPixels, groupSlots, newPlayback, oldPlayback, parseInventory, parseSpriteSet,
  progress, statusInfo, summarise, totalDosBytes, usageLabel,
  type Filters, type Playback, type Slot, type SortMode, type UsageFilter,
} from './sprite-checklist.ts';
import type { WorkshopData } from './types.ts';

const data = workshop as WorkshopData;
// Both files are optional so the page still builds and explains itself when a snapshot is not yet committed.
const inventoryFiles = import.meta.glob('../source/sprite-inventory.json', { eager: true, import: 'default' });
const spriteFiles = import.meta.glob('../source/game-sprites/*.json', { eager: true, import: 'default' });
const inventory = parseInventory(Object.values(inventoryFiles)[0]);
const spriteSets: Record<string, Record<string, string[]>> = {};
for (const [path, raw] of Object.entries(spriteFiles)) spriteSets[path.replace(/^.*\//, '').replace(/\.json$/, '')] = parseSpriteSet(raw);

type Child = Node | string | null | undefined | false;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  for (const child of children) if (child) node.append(child);
  return node;
}
const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let globalPaused = reducedMotion;
let scale = innerWidth < 600 ? 2 : 3;
let filters: Filters = { ...defaultFilters };
let sort: SortMode = 'gaps-first';

interface Preview { canvas: HTMLCanvasElement; playback: Playback; box: { width: number; height: number }; paused: boolean; elapsed: number; drawn: number; button: HTMLButtonElement | null }
let previews: Preview[] = [];

function draw(preview: Preview, index: number): void {
  const { canvas, playback, box } = preview;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, box.width, box.height);
  const rows = playback.frames[index];
  if (!rows) return;
  // Frames are never mirrored: left-facing art is its own set of frames.
  const offset = frameOffset(gridSize(rows), box);
  for (const pixel of gridToPixels(rows, data.palette)) { context.fillStyle = pixel.colour; context.fillRect(pixel.x + offset.x, pixel.y + offset.y, 1, 1); }
  preview.drawn = index;
}
function setPaused(preview: Preview, paused: boolean): void {
  preview.paused = paused;
  if (!preview.button) return;
  preview.button.textContent = paused ? 'Play' : 'Pause';
  preview.button.setAttribute('aria-pressed', String(!paused));
}

function buildPreview(kind: 'Old' | 'New', slot: Slot, playback: Playback, box: { width: number; height: number }, absentText: string): HTMLElement {
  const wrap = el('div', { class: 'preview' });
  const found = playback.frames.length;
  if (!found) {
    const reason = playback.expected ? `Frames not found: ${playback.missing.join(', ')}` : absentText;
    wrap.append(el('div', { class: 'no-sprite', role: 'img', 'aria-label': `${kind} sprite for ${slot.label}: none available. ${reason}` }, el('strong', {}, 'No sprite'), el('span', {}, reason)));
    return wrap;
  }
  const canvas = el('canvas', { role: 'img', width: String(box.width), height: String(box.height), 'aria-label': `${kind} sprite for ${slot.label}, ${found} ${found === 1 ? 'frame' : 'frames'}` });
  canvas.style.width = box.width * scale + 'px';
  const preview: Preview = { canvas, playback, box, paused: globalPaused || found < 2, elapsed: 0, drawn: -1, button: null };
  wrap.append(el('div', { class: 'stage' }, canvas));
  if (found > 1) {
    const button = el('button', { type: 'button', class: 'mini', 'aria-label': `Pause or play the ${kind.toLowerCase()} ${slot.label} preview` });
    button.onclick = () => setPaused(preview, !preview.paused);
    preview.button = button;
    setPaused(preview, preview.paused);
    wrap.append(button);
  }
  draw(preview, 0);
  previews.push(preview);
  return wrap;
}

function badge(kind: string, text: string, hint = ''): HTMLElement {
  const node = el('span', { class: `badge badge-${kind.replace(/[^a-z0-9-]/g, '')}` }, text);
  if (hint) node.title = hint;
  return node;
}
function usageLine(game: string, slot: Slot, key: 'fizz1' | 'fizz2'): HTMLElement {
  const usage = slot.games[key];
  return el('div', { class: 'usage' }, el('span', { class: 'game' }, game), badge(usage.state === 'could-use' ? 'could' : usage.state === 'n/a' ? 'na' : usage.state, usageLabel(usage.state), usage.evidence));
}
function originLabel(origin: string): string {
  if (origin === 'main') return 'main';
  if (origin === 'none' || !origin) return 'no source';
  return origin.replace(/^pr-(\d+)$/, 'PR $1');
}

function buildRow(slot: Slot): HTMLTableRowElement {
  const info = statusInfo(slot.status);
  const oldPlay = oldPlayback(slot.old, spriteSets), newPlay = newPlayback(slot.new, data.frames, data.animations);
  const all = [...oldPlay.frames, ...newPlay.frames].map(rows => gridSize(rows));
  const box = { width: Math.max(1, ...all.map(size => size.width)), height: Math.max(1, ...all.map(size => size.height)) };
  const evidence = [['Fizz 1', slot.games.fizz1], ['Fizz 2', slot.games.fizz2]].filter(([, usage]) => (usage as Slot['games']['fizz1']).evidence);
  const stunnerHint = slot.stunnerSide === 'right-hip' ? 'The Fizz Stunner is on Ben\'s right hip.' : slot.stunnerSide === 'far-hip-left-facing' ? 'The Fizz Stunner is on Ben\'s right hip, the far hip when he faces left, so it is mostly hidden.' : '';
  const chips = el('span', { class: 'chips' }, badge(`facing-${slot.facing}`, facingInfo(slot.facing).chip, facingInfo(slot.facing).label + (slot.pair ? `. Opposite side: ${slot.pair}` : '')));
  if (slot.mirrorForbidden) chips.append(badge('nomirror', 'Never mirrored', `${stunnerHint} Draw each side separately; a flipped sprite puts the Stunner on the wrong hip.`.trim()));
  if (isMissingSide(slot)) chips.append(badge('missing', 'Missing a side', 'This facing has no finished sprite yet'));
  const slotCell = el('th', { scope: 'row', 'data-label': 'Slot' }, el('span', { class: 'slot-name' }, slot.label), el('code', {}, slot.id), chips);
  if (evidence.length) slotCell.append(el('details', {}, el('summary', {}, 'Evidence'), ...evidence.map(([game, usage]) => el('p', {}, `${game as string}: ${(usage as Slot['games']['fizz1']).evidence}`))));
  const count = (play: Playback) => play.expected ? `${play.frames.length}${play.frames.length < play.expected ? ' of ' + play.expected : ''} ${play.expected === 1 ? 'frame' : 'frames'}` : 'no frames';
  const oldCaption = slot.old ? [el('span', {}, `${slot.old.set || 'unknown set'} · ${count(oldPlay)}`), slot.old.note && el('span', { class: 'muted' }, slot.old.note)] : [el('span', {}, 'no old sprite')];
  const newCaption = slot.new ? [el('span', {}, `${originLabel(slot.new.origin)}${slot.new.frameSize ? ' · ' + slot.new.frameSize : ''} · ${count(newPlay)}`), newPlay.missing.length && newPlay.frames.length ? el('span', { class: 'warn' }, `Missing: ${newPlay.missing.join(', ')}`) : null] : [el('span', {}, 'no new sprite')];
  const dos = slot.dos;
  return el('tr', { id: `slot-${slot.id}`, tabindex: '-1', 'data-status': slot.status, 'data-facing': slot.facing },
    slotCell,
    el('td', { 'data-label': 'In the games' }, usageLine('Fizz 1', slot, 'fizz1'), usageLine('Fizz 2', slot, 'fizz2')),
    el('td', { 'data-label': 'Old' }, buildPreview('Old', slot, oldPlay, box, 'No old sprite recorded'), el('div', { class: 'caption' }, ...oldCaption)),
    el('td', { 'data-label': 'New' }, buildPreview('New', slot, newPlay, box, 'Nothing drawn yet'), el('div', { class: 'caption' }, ...newCaption)),
    el('td', { 'data-label': 'Status' }, badge(slot.status || 'unknown', info.label, info.hint)),
    el('td', { 'data-label': 'DOS cost' }, dos ? el('span', {}, `${dos.totalBytes.toLocaleString('en-CA')} B`, el('span', { class: 'muted' }, ` ${dos.bytesPerFrame.toLocaleString('en-CA')} B per frame`)) : el('span', { class: 'muted' }, 'not recorded')),
    el('td', { 'data-label': 'Notes' }, slot.notes || el('span', { class: 'muted' }, '—')),
  );
}

function renderSummary(): void {
  const summary = summarise(inventory.slots), done = progress(inventory.slots);
  const tiles = $('#tiles');
  tiles.replaceChildren(...STATUSES.map(status => {
    const button = el('button', { type: 'button', class: `tile badge-${status.id}`, 'aria-pressed': String(filters.status === status.id), title: status.hint }, el('strong', {}, String(summary.byStatus[status.id] ?? 0)), el('span', {}, status.label));
    button.onclick = () => { filters = { ...filters, status: filters.status === status.id ? 'all' : status.id }; syncControls(); renderTable(); renderSummary(); };
    return el('li', {}, button);
  }));
  const unknown = Object.entries(summary.byStatus).filter(([id, value]) => value && !STATUSES.some(status => status.id === id));
  for (const [id, value] of unknown) tiles.append(el('li', {}, el('span', { class: 'tile' }, el('strong', {}, String(value)), el('span', {}, id || 'No status'))));
  const bar = $('#progress-bar');
  bar.setAttribute('aria-valuenow', String(done.percent));
  bar.setAttribute('aria-valuetext', `${done.ready} of ${done.used} used slots have new art ready`);
  $('#progress-ready').style.width = done.percent + '%';
  $('#progress-game').style.width = done.inGamePercent + '%';
  $('#progress-text').textContent = done.used
    ? `${done.ready} of ${done.used} used slots have new art ready (${done.percent}%). ${done.inGame} of them are already in the game.`
    : 'No slots are marked as used yet.';
  $('#games-line').textContent = `Fizz 1: ${summary.fizz1.used} used, ${summary.fizz1['could-use']} could use. Fizz 2: ${summary.fizz2.used} used, ${summary.fizz2['could-use']} could use.`;
}

const matrixRows = buildFacingMatrix(inventory.slots);
function showSlot(id: string): void {
  // A filtered-out row is brought back by clearing the filters, so a matrix link always lands somewhere.
  if (!document.getElementById(`slot-${id}`)) { filters = { ...defaultFilters }; syncControls(); renderTable(); renderSummary(); renderMatrix(); }
  const row = document.getElementById(`slot-${id}`);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
  row.focus({ preventScroll: true });
}
function matrixCell(slot: Slot): HTMLTableCellElement {
  const info = statusInfo(slot.status);
  const link = el('a', { href: `#slot-${slot.id}`, class: `cell-link cell-${info.id}`, title: `${slot.id}: ${info.hint}` }, el('span', { class: 'cell-status' }, info.label), el('span', { class: 'cell-frames' }, slot.new ? `${slot.new.frames.length} ${slot.new.frames.length === 1 ? 'frame' : 'frames'}` : 'no frames'));
  link.setAttribute('aria-label', `${slot.label}: ${info.label}`);
  link.onclick = event => { event.preventDefault(); showSlot(slot.id); };
  return el('td', { 'data-label': slot.facing === 'right' ? 'Facing right' : 'Facing left' }, link);
}
function renderMatrix(): void {
  $('#matrix-body').replaceChildren(...matrixRows.map(row => el('tr', {}, el('th', { scope: 'row' }, row.label), matrixCell(row.right), matrixCell(row.left))));
  const missing = rowsMissingSide(matrixRows), sides = inventory.slots.filter(isMissingSide).length;
  $('#matrix-summary').textContent = matrixRows.length
    ? `${matrixRows.length} poses have a right and a left slot. ${missing.length} of them have a side with no finished sprite (${sides} slots missing a side).`
    : 'No right and left pairs are recorded in the inventory yet.';
  const other = inventory.slots.filter(slot => !isSideView(slot));
  const counts = FACINGS.filter(entry => entry.id !== 'right' && entry.id !== 'left').map(entry => [entry, other.filter(slot => slot.facing === entry.id).length] as const).filter(([, n]) => n);
  $('#matrix-other').textContent = counts.length ? `Not in the matrix: ${counts.map(([entry, n]) => `${n} ${entry.label.toLowerCase()}`).join(', ')}.` : '';
  const button = $<HTMLButtonElement>('#matrix-missing');
  button.setAttribute('aria-pressed', String(filters.missingSide));
  button.textContent = filters.missingSide ? 'Showing only slots missing a side (show all)' : 'Show only slots missing a side';
  button.hidden = !matrixRows.length;
  $('#matrix').closest('.matrix-wrap')!.toggleAttribute('hidden', !matrixRows.length);
}

function renderTable(): void {
  previews = [];
  const visible = filterSlots(inventory.slots, filters);
  const groups = groupSlots(visible, inventory.groups, sort);
  const table = $('#checklist');
  table.querySelectorAll('tbody').forEach(node => node.remove());
  for (const entry of groups) {
    const body = el('tbody', {});
    const heading = el('th', { colspan: '7', scope: 'colgroup' }, el('span', {}, entry.group.label), el('span', { class: 'group-count' }, ` · ${entry.slots.length} ${entry.slots.length === 1 ? 'slot' : 'slots'}${entry.gaps ? `, ${entry.gaps} with gaps` : ''}`));
    body.append(el('tr', { class: 'group-row' }, heading), ...entry.slots.map(buildRow));
    table.append(body);
  }
  const message = !inventory.slots.length
    ? 'No sprite inventory was found. Add source/sprite-inventory.json to see the checklist.'
    : visible.length ? '' : 'No slots match these filters.';
  $('#empty').textContent = message;
  $('#empty').hidden = !message;
  $('#count').textContent = inventory.slots.length ? `Showing ${visible.length} of ${inventory.slots.length} slots. Visible DOS cost: ${totalDosBytes(visible).toLocaleString('en-CA')} B.` : '';
}

function syncControls(): void {
  $<HTMLSelectElement>('#f-status').value = filters.status;
  $<HTMLSelectElement>('#f-group').value = filters.group;
  $<HTMLSelectElement>('#f-usage').value = filters.usage;
  $<HTMLInputElement>('#f-search').value = filters.search;
  $<HTMLInputElement>('#f-gaps').checked = filters.gapsOnly;
  $<HTMLSelectElement>('#f-facing').value = filters.facing;
  $<HTMLInputElement>('#f-side').checked = filters.missingSide;
  $<HTMLSelectElement>('#f-sort').value = sort;
}
function option(value: string, label: string): HTMLOptionElement { return el('option', { value }, label); }
function setupControls(): void {
  $('#f-status').append(option('all', 'All statuses'), ...STATUSES.map(status => option(status.id, status.label)));
  $('#f-group').append(option('all', 'All groups'), ...inventory.groups.map(group => option(group.id, group.label)));
  $('#f-facing').append(option('all', 'Any facing'), ...FACINGS.map(entry => option(entry.id, entry.label)));
  const usageOptions: [UsageFilter, string][] = [['all', 'Any'], ['fizz1-used', 'Used in Fizz 1'], ['fizz2-used', 'Used in Fizz 2'], ['either-used', 'Used in either'], ['could-use', 'Could use'], ['unused', 'Unused']];
  $('#f-usage').append(...usageOptions.map(([value, label]) => option(value, label)));
  const update = () => {
    filters = {
      status: $<HTMLSelectElement>('#f-status').value, group: $<HTMLSelectElement>('#f-group').value, usage: $<HTMLSelectElement>('#f-usage').value as UsageFilter,
      search: $<HTMLInputElement>('#f-search').value, gapsOnly: $<HTMLInputElement>('#f-gaps').checked,
      facing: $<HTMLSelectElement>('#f-facing').value, missingSide: $<HTMLInputElement>('#f-side').checked,
    };
    sort = $<HTMLSelectElement>('#f-sort').value as SortMode;
    renderTable(); renderSummary(); renderMatrix();
  };
  for (const id of ['#f-status', '#f-group', '#f-facing', '#f-side', '#f-usage', '#f-search', '#f-gaps', '#f-sort']) $(id).addEventListener('input', update);
  $('#f-form').addEventListener('submit', event => event.preventDefault());
  $('#f-reset').onclick = () => { filters = { ...defaultFilters }; sort = 'gaps-first'; syncControls(); renderTable(); renderSummary(); renderMatrix(); };
  $('#matrix-missing').onclick = () => { filters = { ...filters, missingSide: !filters.missingSide }; syncControls(); renderTable(); renderSummary(); renderMatrix(); };
  const pause = $<HTMLButtonElement>('#pause-all');
  const label = () => { pause.textContent = globalPaused ? 'Play all previews' : 'Pause all previews'; pause.setAttribute('aria-pressed', String(!globalPaused)); };
  pause.onclick = () => { globalPaused = !globalPaused; for (const preview of previews) setPaused(preview, globalPaused); label(); };
  label();
  const scaleSelect = $<HTMLSelectElement>('#scale');
  scaleSelect.value = String(scale);
  scaleSelect.onchange = () => { scale = Number(scaleSelect.value); for (const preview of previews) preview.canvas.style.width = preview.box.width * scale + 'px'; };
  syncControls();
}

let last = performance.now();
function tick(now: number): void {
  const delta = Math.max(0, Math.min(now - last, 250));
  last = now;
  for (const preview of previews) {
    if (preview.paused) continue;
    preview.elapsed += delta;
    const index = frameIndexAt(preview.playback.durationsMs, preview.elapsed);
    if (index !== preview.drawn) draw(preview, index);
  }
  requestAnimationFrame(tick);
}

$('#generated').textContent = inventory.generated ? `Inventory generated ${inventory.generated}` : '';
$('#sources').textContent = inventory.sources.map(source => `${source.id}: ${source.repo}@${source.ref}`).join(' · ');
setupControls();
renderSummary();
renderMatrix();
renderTable();
requestAnimationFrame(tick);
