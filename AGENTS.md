# AGENTS.md

## Project and source of truth

Classic Fizz Pose Workshop is Liminal HQ's private Ben Blaze art lab: a Bun/Vite/TypeScript pixel editor, sprite gallery, reusable animation rigs and a rigged Three.js character study. It is separate from the Lieutenant Fizz game. Workshop experiments do not replace game assets or simulation rules automatically.

Read `README.md` for setup, `docs/RIG.md` before changing sprite motion, `docs/BEN_3D.md` before changing the model and `docs/TURNTABLE_REVIEW.md` before changing rotating views. Review saved reference sprites before changing character proportions, clothing, equipment or the palette.

- `source/classic-fizz-original.json` is the untouched original study. Preserve it.
- `source/poses.json` holds authored grids and animation timing; `edits.json` holds saved editor overrides and takes precedence. Browser drafts are not project saves.
- `source/game-palette.json` defines the sixteen game colours plus transparency. Preserve palette codes and crisp native pixels.
- `source/ben-*-rig.json`, `source/ben-side-skin.json` and `src/rig/` define reusable sprite animation. Preserve the rigs and tools alongside their exports.
- `source/ben-3d.json`, the skin SVG and `src/model-3d/` define the volumetric model. Sprite outlines are ink, not extra physical helmet or shoe volume.
- `templates/README.md` and `templates/standalone.html` are authoritative; their root outputs are generated. Edit the templates first.

## Commands and generated files

Use Bun, strict TypeScript, Vite and Three.js. Do not introduce Python or another package manager. `package.json` is the source of truth for commands and pinned versions.

```sh
bun install
bun run dev              # editor and project-save endpoint on 0.0.0.0:5173
bun run generate         # exports saved grids without redrawing them
bun run branding:build   # hero and avatars from the current saved sprite exports
bun run test
bun run typecheck
bun run build
bun run validate         # generation, type checking, tests and build
```

`draw:*` commands redraw authored poses and can replace manual edits. Only run the relevant command when deliberately changing that rig's artwork; commit or export manual work first. Ordinary generation preserves overrides. Generated sprite PNG/SVG/GIF files, sheets, rig exports and model review artefacts belong with their source changes. Keep `node_modules/`, `dist/` and `.vite/` untracked.

## Conventions

Use Canadian English in UI, identifiers, comments and documentation, except exact external API spellings. Write markdown paragraphs and bullets as unwrapped lines; use real em dashes. Explain the resulting behaviour for future readers without referring to the conversation or review history.

Keep changes focused. Prefer readonly data, `const`, explicit exported return types and no `any` without justification. Do not add re-export-only barrel files. Dispose of Three.js geometries, materials and textures; avoid allocations in frame loops. Keep artwork native to the existing pixel/SVG tools. Do not repaint saved reference sprites while changing the model or branding.

New or substantially rewritten TypeScript and JavaScript source files begin with:

```ts
// Brief one-line summary of what this file does.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
```

Use the same attribution in SVG comments. Do not infer a new licence for original reference artwork or imported assets; preserve their provenance.

## Verification

Run the relevant tests and `bun run validate` for application changes. For motion changes, check phase order, limb relationships, grounded contacts, loop closure and the saved reference proportions. For visual changes, inspect the browser output and state what was checked. Verify both normal and reduced-motion rendering for animated SVG branding. Keep the SVG avatar source and its uploaded PNG rendition in sync with `bun run branding:build`. Do not claim checks that were not run.

## Git and collaboration

Use focused, signed Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `build:`, `chore:`). Commit bodies explain what and why, wrap at approximately 72–100 characters and backtick code references. Write shell-sensitive commit messages to a file and use `git commit -F`. Include an agent co-author trailer for agent-authored changes. Stage explicit paths, never `git add -A` or `git commit -a`; preserve other people's changes and retry lock collisions without deleting locks.

Do not push, rewrite pushed history, merge or alter shared repository settings unless explicitly requested. Use merge commits for pull requests. PR titles are imperative, sentence case and omit Conventional Commit prefixes; descriptions contain `## Summary` and `## Test plan`, and every PR receives fitting category and scope labels. The Forgejo repository lives under `liminal-hq`; keep credentials and signing private keys out of files, output and commits.
