# Vendored from Lieutenant Fizz

Built from [`liminal-hq/lieutenant-fizz`](https://github.com/liminal-hq/lieutenant-fizz) at commit `94f354d` (the 0.4.0 release preparation). The game is licensed Apache-2.0 OR MIT by the same owner as this workshop.

| File | What it is | How it was made |
|---|---|---|
| `sim.wasm` | The Episode 1 simulation: every rule of the game, with a raw C-ABI export surface and no imports. | `bun run build:wasm` in the game repository, without the optional `wasm-opt` pass. |
| `sprites.png` | Every sprite the simulation can draw, packed into one 1024-pixel sheet at one texel a pixel. | `buildAtlas(defineSprites(), { size: 1024, scale: 1 })` from the game's engine and sprite catalogue; the albedo flipped to read top-down. |
| `sprites.json` | Each sprite's `[left, bottom, width, height]` in that sheet, in pixels. | The same atlas's rectangles. |

The 3D level page (`crater-fields.html`) runs `sim.wasm` and draws what it says to draw. The simulation scales sprites by the sizes in `sprites.json`, so the two files must come from the same build. `sprites.png` is used only to draw a sprite flat when it has no 3D model.

To refresh: check out the game, run `bun run build:wasm`, copy `episodes/episode-1/src/wasm/sim.wasm` here, and rebuild the sheet with the call above.
