# Vendored from Lieutenant Fizz

Built from [`liminal-hq/lieutenant-fizz`](https://github.com/liminal-hq/lieutenant-fizz) at commit `94f354d` (the 0.4.0 release preparation). The game is licensed Apache-2.0 OR MIT by the same owner as this workshop.

| File | What it is | How it was made |
|---|---|---|
| `sim.wasm` | The Episode 1 simulation: every rule of the game, with a raw C-ABI export surface and no imports. | `bun run build:wasm` in the game repository, without the optional `wasm-opt` pass. |
| `sprites.png` | Every sprite the simulation can draw, packed into one 1024-pixel sheet at one texel a pixel. | `buildAtlas(defineSprites(), { size: 1024, scale: 1 })` from the game's engine and sprite catalogue; the albedo flipped to read top-down. |
| `sprites.json` | Each sprite's `[left, bottom, width, height]` in that sheet, in pixels. | The same atlas's rectangles. |
| `fonts/` | The Fizz font in regular and bold, the game's own pixel typeface, with its licence. | Copied from `packages/engine/assets/fonts/`. The font is licensed OFL-1.1 (`fonts/OFL.txt`), unlike the rest. |

The 3D level page (`crater-fields.html`) runs `sim.wasm` and draws what it says to draw. The simulation scales sprites by the sizes in `sprites.json`, so the two files must come from the same build. `sprites.png` is used only to draw a sprite flat when it has no 3D model.

The sound of the page is a port too: the audio code in `src/level-3d/audio/` (the effects, the Crater Fields music and its longer Enhanced song, the Undertone voice builder, the built-in synth, the Enhanced sound field, master chain, rooms and mix, and their tests) is ported from `liminal-hq/lieutenant-fizz` at the same commit `94f354d`, from `packages/engine/src/` (`audio.ts`, `master.ts`, `mix.ts`, `music-songs.ts`, `sound-field.ts`, `sound-graph.ts`, `fake-audio-context.ts`) and `episodes/episode-1/src/audio/` (`patterns.ts`, `enhanced-sfx.ts`, `rooms.ts`, `mix.ts`, `songs.ts`). Each file's header names its source. The page plays through [`@liminal-hq/undertone`](https://www.npmjs.com/package/@liminal-hq/undertone) (`^0.2.0`, MIT, no dependencies) as the game does, with the game's built-in synth as the fallback it uses when Undertone cannot load. The other levels' music and rooms, the title and cinematic tracks and the live-tuning hook are not ported. Unlike `sim.wasm` and `sprites.png` it is source, so it is not refreshed by rebuilding: re-port it when the game's audio changes.

To refresh: check out the game, run `bun run build:wasm`, copy `episodes/episode-1/src/wasm/sim.wasm` here, and rebuild the sheet with the call above.
