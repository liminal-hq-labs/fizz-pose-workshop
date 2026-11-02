# Original Classic Fizz pose workshop

A pose set derived from the unmodified original native Classic Fizz study, vendored in `source/classic-fizz-original.json`. The initial polished version is preserved in the first Git commit. The original files are preserved. Run `bun run dev` and open the printed local URL for the gallery and pixel editor. `standalone-preview.html` is the generated read-only gallery that also works directly from disk. The preview supports pause, scale, playback speed and side-view mirroring, and initially pauses when reduced motion is requested.

## Pixel editor

Install dependencies with `bun install`, then run `bun run dev`. The editor supports palette drawing, erasing, colour picking, continuous pointer strokes, undo/redo, per-frame reset and a native-size preview. Click a static gallery pose or use the frame selector to edit it. Gallery and animation previews update live.

Drafts are stored in this browser for this local address. **Save to project** writes `edits.json` and regenerates PNG, SVG, GIF, sprite-sheet and standalone preview exports. The development server requires Python 3 and Pillow for regeneration. Saving is explicit; browser drafts alone do not change repository files. Original source art stays untouched. JSON export/import provides portable backups; PNG export downloads the selected frame at native resolution.

`bun run generate` rebuilds assets with saved edits applied. `bun run test` checks pixel history and frame validation. `bun run build` creates `dist/` with the editor and image exports; `bun run preview` serves that build. The built editor supports browser drafts and JSON/PNG export; saving to project requires `bun run dev`.

The app entry is `index.html`; `preview.html` redirects to the app. `src/` contains the gallery, editor, styles and edit validation. `vite.config.js` handles the development save endpoint and packages the image exports for builds. Generated frame overrides in `edits.json` take precedence over generator artwork; per-frame reset restores the project version loaded by the page.

## Artwork

The three-quarter side-view keeps the original 16 × 32 standing proportions on a transparent 24 × 44 canvas with room for raised arms, a blaster and a pogo spring. The standing grid retains the original design, translated by (4, 4) into the shared canvas, with the original foreground shoe mirrored to face left and its toe extended one pixel left without moving the ankle. The foreground heel extends one pixel right through its red upper, white sole and grey underside, with its outer black outline moved to match. The matching rear shoe is raised two pixels for perspective, with its toe extended one pixel left while its ankle stays in place. A stepped black outline separates the foreground toe from the raised rear shoe and continues upward towards the ankle. The original yellow belt dot is retained; the front trouser leg and shoe mask the overlapping rear shoe pixels. The untouched original remains in `source/classic-fizz-original.json` and the comparison image. Action frames use its original head and torso, including the flat helmet, fragmented racing stripe and grey rim. Newly drawn action limbs use cyan denim seams, white gloves and red shoes with white toe caps, white soles and grey undersides. All sixteen game pose names from `episodes/episode-1/src/sprites/characters.ts` are represented, with two additional run phases and one recoil frame. Climbing shows the back of the helmet and shirt.

The overworld is a separate top-down design on a 24 × 24 canvas with eight headings (N, NE, E, SE, S, SW, W, NW). Each heading has two walking frames. The helmet stripe, grey rim, brim and partial face indicate the heading; feet and hands alternate. This replaces the current head-and-shoulders interpretation for this study.

## Files

- `frames/`: all 35 individual transparent PNGs and editable pixel-rectangle SVGs.
- `animations/`: five action loops and eight overworld walk loops, each as an animated SVG and transparent GIF.
- `assets.json`: palette, every editable pixel grid, per-frame timing and sprite-sheet rectangles.
- `sheets/ben-poses.png`: transparent sprite sheet in 24 × 44 cells; use the rectangles in `assets.json` for smaller overworld frames.
- `build-assets.py`: standalone source generator. Requires Python 3 and Pillow; run `python3 build-assets.py` to regenerate exports.
- `original-study.png`: a copy of the original native study at 6× for comparison.

## Animation and integration notes

Run uses four phases at 140 ms each. Pogo alternates extension and compression at 180/140 ms with a fixed tip. Climbing uses two opposite arm/leg phases at 220 ms each. The pull-up preview shows grip, haul, push and a resting pose; the shooting preview adds a recoil frame. These are art preview timings, not changes to deterministic simulation timing. Animated SVGs honour reduced-motion preferences; GIF players control their own playback.

This is an external art workshop, not a game asset replacement. The taller side-view and new top-down dimensions differ from the current 16 × 24 side-view, 16 × 32 pogo and 16 × 16 overworld sprites. Integration would require deliberate atlas, draw-size and anchor review. The user interface, simulation and repository assets are unchanged.
