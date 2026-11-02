# Original Classic Fizz pose workshop

A pose set derived from the unmodified original native Classic Fizz study, vendored in `source/classic-fizz-original.json`. The initial polished version is preserved in the first Git commit. The original files are preserved. Run `bun run dev` and open the printed local URL for the gallery and pixel editor. `standalone-preview.html` is the generated read-only gallery that also works directly from disk. The preview supports pause, scale, playback speed and side-view mirroring, and initially pauses when reduced motion is requested.

## Pixel editor

Install dependencies with `bun install`, then run `bun run dev`. The editor supports palette drawing, erasing, colour picking, continuous pointer strokes, undo/redo, per-frame reset and a native-size preview. Click a static gallery pose or use the frame selector to edit it. Gallery and animation previews update live.

Drafts are stored in this browser for this local address. **Save to project** writes `edits.json` and regenerates PNG, SVG, GIF, sprite-sheet and standalone preview exports. Generation and saving run entirely in Bun and TypeScript. Saving is explicit; browser drafts alone do not change repository files. Original source art stays untouched. JSON export/import provides portable backups; PNG export downloads the selected frame at native resolution.

`bun run generate` rebuilds assets with saved edits applied. `bun run test` checks pixel history and frame validation. `bun run build` creates `dist/` with the editor and image exports; `bun run preview` serves that build. The built editor supports browser drafts and JSON/PNG export; saving to project requires `bun run dev`.

The app entry is `index.html`; `preview.html` redirects to the app. `src/` contains the gallery, editor, styles and edit validation. `vite.config.ts` handles the development save endpoint and packages the image exports for builds. Frame overrides in `edits.json` take precedence over the authored grids in `source/poses.json`; per-frame reset restores the project version loaded by the page.

## Game palette

The editable sprites use exactly the game's sixteen EGA colours plus transparent (`.`). `source/game-palette.json` mirrors `packages/engine/src/palette.ts` from the game repository. The untouched original reference keeps its original colours. Imports and older browser drafts are converted to game codes before validation. Saved edits and all generated sprite exports use the game palette.

| Code | Colour | Hex |
|---|---|---|
| `.` | Transparent | None |
| `k` | Black | `#000000` |
| `B` | Blue | `#0000aa` |
| `G` | Green | `#00aa00` |
| `C` | Cyan | `#00aaaa` |
| `R` | Dark red | `#aa0000` |
| `M` | Magenta | `#aa00aa` |
| `N` | Brown | `#aa5500` |
| `L` | Light grey | `#aaaaaa` |
| `D` | Dark grey | `#555555` |
| `b` | Bright blue | `#5555ff` |
| `g` | Bright green | `#55ff55` |
| `c` | Bright cyan | `#55ffff` |
| `r` | Bright red | `#ff5555` |
| `m` | Bright magenta | `#ff55ff` |
| `y` | Yellow | `#ffff55` |
| `W` | White | `#ffffff` |

Legacy codes map as follows: `K` → `k`, `Q` → `G`, `h` → `W`, `V` → `N`, `O` → `N`, `s` → `b`, and `A` → `B`. Other codes remain unchanged. Skin maps to white to match the game's Ben, muted denim to bright blue, and orange/tan to brown. The mapping in `source/colour-map.json` is intentional rather than a nearest-RGB conversion.

## Artwork

The three-quarter side-view keeps the original 16 × 32 standing proportions on a transparent 24 × 44 canvas with room for raised arms, a blaster and a pogo spring. The standing grid retains the original design, translated by (4, 4) into the shared canvas, with the original foreground shoe mirrored to face left and its toe extended one pixel left without moving the ankle. The foreground heel extends one pixel right through its red upper, white sole and grey underside, with its outer black outline moved to match. The matching rear shoe is raised two pixels for perspective, with its toe extended one pixel left while its ankle stays in place. A stepped black outline separates the foreground toe from the raised rear shoe and continues upward towards the ankle. The original yellow belt dot is retained; the front trouser leg and shoe mask the overlapping rear shoe pixels. The untouched original remains in `source/classic-fizz-original.json` and the comparison image. Action frames use its original head and torso, including the flat helmet, fragmented racing stripe and grey rim. Newly drawn action limbs use cyan denim seams, white gloves and red shoes with white toe caps, white soles and grey undersides. The lab retains the game’s action pose studies, with a separate four-frame right-facing walk built from the current Ben artwork. `ben_walkRight1` through `ben_walkRight4` replace the retired `ben_run1` through `ben_run4` grids and exports. They show a true side profile with one blue eye, a forward helmet brim, alternating arm and leg swings, cyan denim seams and the purple Stunner fixed to the near belt. The three-quarter idle stands remain separate. Climbing shows the back of the helmet and shirt. `ben_standRight` mirrors the current left-facing standing pose and adds a compact purple Fizz Stunner below the near hand, attached to the belt with a dark clip. The right-facing version is separate so its visible equipment can differ from the left-facing pose. `ben_standFront` is a new camera-facing pose with a narrower head, centred helmet stripe, symmetric eyes, softly joined short sleeves, longer arms, a single black trouser seam and front-facing shoes and a small Stunner at Ben’s right hip (the viewer’s left). The game currently has no dedicated front-facing stand; these poses are lab assets. `ben_frontLookUp` tips the face towards the sky. `ben_frontBendHalf` lowers the gaze while bending partway forward; `ben_frontBendFull` presents the helmet crown towards the camera. Both bending frames spread the arms and hands outward for balance. All three preserve the saved front-facing stand’s legs, shoes and hip equipment at the same pixel positions (rows 24–43).

The overworld is a separate top-down design on a 24 × 24 canvas with eight headings (N, NE, E, SE, S, SW, W, NW). Each heading has two walking frames. The helmet stripe, grey rim, brim and partial face indicate the heading; feet and hands alternate. This replaces the current head-and-shoulders interpretation for this study.

## Files

- `frames/`: all 40 individual transparent PNGs and editable pixel-rectangle SVGs.
- `animations/`: five action loops and eight overworld walk loops, each as an animated SVG and transparent GIF.
- `assets.json`: palette, every editable pixel grid, per-frame timing and sprite-sheet rectangles.
- `sheets/ben-poses.png`: transparent sprite sheet in 24 × 44 cells; use the rectangles in `assets.json` for smaller overworld frames.
- `scripts/build-assets.ts`: Bun/TypeScript asset generator. Run `bun run generate` to regenerate exports.
- `source/poses.json`: editable source pixel grids and animation timing, preserved independently of generated output.
- `templates/`: README and standalone gallery templates.
- `original-study.png`: a copy of the original native study at 6× for comparison.

## Animation and integration notes

The right-facing walk uses four phases at 150 ms each (600 ms per loop), with opposing arm/leg swings, small body bob and planted soles sharing a baseline. Pogo alternates extension and compression at 180/140 ms with a fixed tip. Climbing uses two opposite arm/leg phases at 220 ms each. The pull-up preview shows grip, haul, push and a resting pose; the shooting preview adds a recoil frame. These are art preview timings, not changes to deterministic simulation timing. Animated SVGs honour reduced-motion preferences; GIF players control their own playback.

This is an external art workshop, not a game asset replacement. The taller side-view and new top-down dimensions differ from the current 16 × 24 side-view, 16 × 32 pogo and 16 × 16 overworld sprites. Integration would require deliberate atlas, draw-size and anchor review. The user interface, simulation and repository assets are unchanged.
