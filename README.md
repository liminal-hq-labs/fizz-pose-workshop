# Polished Ben pose workshop

A new Classic Fizz pose study based on the adjacent original native study. The original files are preserved. Open `preview.html` directly in a browser; no server or dependencies are needed for viewing. The preview supports pause, scale, playback speed and side-view mirroring, and initially pauses when reduced motion is requested.

## Artwork

The three-quarter side-view keeps the 16 × 32 standing silhouette on a transparent 24 × 44 canvas with room for raised arms, a blaster and a pogo spring. Helmet clusters, the white racing stripe, face shading, denim and shoe soles have been simplified. All sixteen game pose names from `episodes/episode-1/src/sprites/characters.ts` are represented, with two additional run phases and one recoil frame. Climbing shows the back of the helmet and shirt.

The overworld is a separate top-down design on a 24 × 24 canvas with eight headings (N, NE, E, SE, S, SW, W, NW). Each heading has two walking frames. The helmet stripe, brim and partial face indicate the heading; feet and hands alternate. This replaces the current head-and-shoulders interpretation for this study.

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
