# Fizz 2 door designs

A design study for Fizz 2's keyed doors and level exit, for Scott to pick from. The art is in `source/door-designs.json`, drawn by `scripts/build-door-designs.ts` (`bun run doors:build`; `--check` reports a stale file), and shown on `doors.html` with animated previews, a layer toggle, a 1, 2 or 3 tile height toggle, a held-open or empty ending, a night preview and Ben in each scene: beside a keyed door and running through it once open, and in front of an exit and walking into it. The exit walk-in uses the lab's `ben_doorIn1` to `ben_doorIn8` and `source/ben-door-pass.json`, so this work is stacked on `feat/walk-through-door`. Nothing here changes the workshop's Ben frames, `assets.json` or `edits.json`.

## The brief

- Sixteen EGA colours only (the letters of `source/game-palette.json`, the same as Fizz 2's `docs/SPRITES.md`) and `.` for transparent. 16 px tiles. Light from the upper left: lit tops and left rims, shaded undersides and right faces.
- Ben is 33 px tall in game (a 0.8 by 2.0 tile body); the workshop frames pad him to 24 by 44.
- **Keyed doors**: a red door and a blue door, a column of 16 × 16 door tiles. The slice's doors are 3 tiles tall (16 × 48); Fizz 1's `doorRed` and `doorBlue` are one tile. Each carries an iron lock and a white shape badge (▲ on red, ● on blue) so colour is never the only cue. The key opens the door at a touch: the door is passable on that tick and the game raises `dooropen` at the door's centre cell with a sound. Fizz 1 draws an open door as nothing; Fizz 2 wants a visible opening, with the empty ending kept as an option.
- **Exit**: a stone-arched doorway on the far edge of the floor, lit green inside with a white up arrow. Ben goes through by pressing Up while overlapping it. The drawn piece is 20 × 35, placed 4 px right of the exit cell's left edge and 35 px above the top of the lower exit cell; the light is a separate 14 × 32 glow piece.
- Some designs never animate (cheapest); others open in 3 to 6 frames. At most 8 frames a door and about 2 KB a design at 4 bits a pixel, `ceil(w × h / 2)` bytes a frame.

## Keyed doors

Every keyed door is three 16 × 16 segments, stored per frame:

- **top**: the lintel and the badge plate. The badge is always on this segment.
- **mid**: a plain stretch of the leaf, repeated for doors taller than 3 tiles.
- **bot**: the lock and the foot of the door.

A door of 1 tile is `top` alone (badge, no lock, as Fizz 1's single tile); 2 tiles are `top` + `bot`; 3 tiles are `top` + `mid` + `bot`; taller doors repeat `mid`. Every animation is worked out segment by segment, so the same frames serve any height. The red and blue variants share every grid: the paint letters swap (r and R for red, b and B for blue) and only the badge shape differs. The back layer's plate has a hole exactly where that colour's badge is; the glow layer fills it.

| Design | Behaviour | Frames (opening ms) | Badge | Segments stored | Baked 16 × 48 | Baked 16 × 32 |
| --- | --- | --- | --- | --- | --- | --- |
| Plank Swing | animated: leaf turns away on its left hinge, foreshortened 12, 8, 4 px, held open as its edge | closed, swing8, swing4, open (90 + 90) | on the leaf; a 5 px narrow badge at 8 px, hidden at 4 px | 12 back + 2 glow = 1,792 B | 1,792 B | 1,280 B |
| Pocket Slide | animated: leaf slides right into a slot in the right jamb | closed, slide2, slide6, slide10, open (70 + 70 + 80) | rides the leaf for one step, then hidden | 15 + 2 = 2,176 B | 2,176 B | 1,536 B |
| Twin Leaves | animated: two half leaves part into the jambs under a fixed transom; the lock splits at the seam | closed, part2, part4, open (80 + 80) | on the transom, visible in every frame | 12 + 1 = 1,664 B | 1,664 B | 1,152 B |
| Lock Pop | animated: the keyhole turns a quarter, the lock flashes, the leaf pops as a ring of sparks | closed, turn1, turn2, pop, open (90 + 120 + 90) | on the leaf until the pop | 11 + 1 = 1,536 B | 2,048 B | 1,408 B |
| Fizz Dissolve | animated: the leaf fizzes away from the floor up in white bubbles, the plate last | closed, fizz1, fizz2, fizz3, open (80 + 80 + 100) | on the plate, which holds until open | 15 + 1 = 2,048 B | 2,048 B | 1,408 B |
| Signpost Arch | no animation: iron bars in the door's colour fill an open stone arch; the bars are gone on the tick | closed, open | on a sign hung from the arch, always visible | 6 + 1 = 896 B | 896 B | 640 B |
| Classic Block | no animation: Fizz 1's tile grown into segments, painted frame and grained boards; it vanishes | closed | on the top segment | 3 + 1 = 512 B | 512 B | 384 B |

Costs are for one colour; each distinct 16 × 16 grid costs 128 B, each distinct baked 16 × 48 frame 384 B and 16 × 32 frame 256 B, and the badge is one 128 B glow segment for every height. Storing segments is never dearer than baking and is cheaper where only one segment changes (Lock Pop's turn frames). A bake that swaps colours at load time would pay once for both colours.

Why each one suits Fizz 2:

- **Plank Swing**: everyone reads a swing, and the leaf narrows rather than moving, so it stays in its column at any height. The held frame keeps the leaf's edge against the jamb, so the room remembers a door was there.
- **Pocket Slide**: sideways motion is the easiest opening to read at 16 px; the slot says where the leaf went.
- **Twin Leaves**: the badge never moves, so the open doorway still says which key opened it. On a 2-tile door the transom leaves a 19 px opening; on 3 tiles 35 px, taller than Ben.
- **Lock Pop**: the lock changes first, so the player sees the key's effect before the door goes.
- **Fizz Dissolve**: the Fizz joke as a door, on-brand and unlike any real door; the bubbles hide the cost of the in-between frames.
- **Signpost Arch**: the cheapest door that still shows an open doorway, with the badge kept in the room on its sign.
- **Classic Block**: the most faithful and cheapest: it plays exactly as Fizz 1 did.

### Keyed door states and endings

Each keyed design has the sequences `closed` (one held frame), `opening` (the frames above with their durations; empty for the two that do not animate), `open` (the held open frame) and `emptyEnding` (nothing drawn). The game chooses the ending: the held open frame (`heldOpenFrame` in the data) stays for the rest of the room, or the door disappears after the opening frames, as in Fizz 1. Classic Block has only the empty ending.

## Exits

Each exit is 20 × 35 and stands on the far plane: its bottom edge is the sill, on the far edge of the floor, higher on screen than the floor line Ben stands on in front of it (`placement.anchor` is `far-plane sill`; keyed doors are `floor-line column`). The piece's top-left corner is 4 px right of the exit cell's left edge and 35 px above the top of the lower exit cell. It is split into three pieces:

- **back**, 20 × 29 at (0, 0): the stone arch (an outlined ring of voussoirs with a white keystone, a lit left jamb, a shaded right jamb) and any leaf or shutter.
- **front**, 20 × 6 at (0, 29): the lip, a stone threshold step with a white lit nosing, the bottom 6 rows above the sill across the full width. One frame, shared by every design.
- **glow**, 14 × 32 at (3, 3): the lit opening, a dithered darker floor and a 6 px white up arrow. Where a design has a leaf or shutter, each back frame has a glow frame that lights only what that frame leaves open, so the light never covers a leaf.

| Design | Behaviour | Back frames | Glow frames | Bytes |
| --- | --- | --- | --- | --- |
| Into the Light | always open; over the last three walk-in frames the light floods over Ben (two dither veils, then full) and fades back to an empty doorway | arch | light, veil6, veil12 | 290 + 60 + 3 × 224 = 1,022 B |
| Over the Lip | always open; Ben walks in over the lip and is gone | arch | light | 290 + 60 + 224 = 574 B |
| Lighthouse Lift | animated; a transom with the arrow lamp, steel leaves part on the Up press and close once Ben is in | shut, half, open | one for each | 3 × 290 + 60 + 3 × 224 = 1,602 B |
| Drop Shutter | always open; once Ben is in, an iron shutter drops in three steps to the lip | open, drop1, drop2, shut | open, drop1, drop2 (shut has none) | 4 × 290 + 60 + 3 × 224 = 1,892 B |
| Lighthouse Door | animated; a brown plank door with a lit round window swings in, and swings shut behind Ben | shut, ajar, open | one for each | 3 × 290 + 60 + 3 × 224 = 1,602 B |

Why each one suits Fizz 2: Into the Light tells the walk-in with the light, which glows at night with the rest of the exit and softens the crop; Over the Lip is the cheapest exit that still shows Ben going in; Lighthouse Lift explains "press Up to go up" by itself; Drop Shutter's slam is a natural end-of-level beat; Lighthouse Door matches the keyed doors' planks, so doors and exits read as one family.

Exit sequences are `idle` (waiting), an optional `opening` (on the Up press, with Ben frozen in front) and `enter`: the eight walk-in frames, then whatever closes, ending with Ben hidden.

## Layer and overlap contract

Draw order, back to front, with the one new pass the exit needs:

1. Ground pass: back wall or sky, far-plane dressing, the exit (back, glow, then the front lip), terrain from the bottom row up with the keyed doors (back, then glow), spikes.
2. Keys and snacks; 3. the chicken; 4. shots; 5. puffs.
6. Ben.
7. **New exit pass, only during the walk-in**: the step's `glowOver` (if any), then the exit's front lip again, over Ben.
8. At night, the light pass; 9. captions.

The glow layer is drawn in the glow bank (bank 2, level 14), which the night pass leaves at full brightness; its letters are W for keyed doors and g, G and W for exits. Every back cell under an opaque glow cell is transparent, so the badge and the light exist only on that layer.

**Keyed doors: a floor-line column, Ben beside it or passing.** A keyed door is terrain: a column of segments standing on the floor line, drawn in the ground pass with only back and glow layers. Ben is drawn after it, so he is in front of the whole door in every frame, and there is no front layer to split. While the door is shut he can only stand beside it, clear of the leaf; the opening plays after the `dooropen` event and never blocks him; once it is open he runs across the doorway in front of it with `walk-run-6` (`ben_walkRight1`, 3, 5, 7, 9 and 11). The page shows both: the opening with Ben waiting beside the door, and Ben passing through the open doorway.

**Exit: far plane, Ben in front, then the walk-in.** While Ben plays he stands on the floor line in front of the exit, lower on screen than its sill, and the whole exit, lip included, is behind him. When he presses Up the walk-in follows `source/ben-door-pass.json`: the sprite's left edge is 2 px left of the exit (`spriteX = exitX - 2`), its top is at `sill + startBelowSill - 36 - rise`, it rises one pixel a frame for 7 px over `ben_doorIn1` to `ben_doorIn8` (120, 110, 100, 110, 110, 100, 110, 120 ms), and it does not shrink. Each frame draws only the sprite's top `visibleRows` rows (36, 36, 33, 29, 24, 18, 11, 4); the game crops the rest. During the walk-in the lip is drawn after Ben, covering his feet. `startBelowSill`, the distance from the sill down to the floor line, is the game's to set; the page offers 0, 6, 10 and 16 px and starts at 10.

## What the Fizz 2 session needs to decide

- **Which designs**: one keyed family and one exit, and whether the keyed door keeps its held open frame or ends empty.
- **Where the floor line is below the sill (`startBelowSill`)**, which decides how the walk-in reads. At 10 px or more, Ben's crown stays inside the arch's opening for the whole 7 px rise, but the contract's crop line rises above the 6-row lip from the sixth frame on (7, 14 and 23 px above it), so Ben is cut by a line in the open doorway rather than by stone. Closer to the sill the lip does more of the hiding, but his crown climbs out of the opening: at 6 px it reaches the top edge of the arch on the last frame, and at 0 px it ends 6 px above the arch. Either raise the lip (a taller front piece), crop to the lip's top edge instead of the contract's rows, or accept the cut inside the light (Into the Light's veil hides it).
- **The new pass after Ben**: confirm step 7 above (the lip, and `glowOver`, after Ben only during the walk-in).
- **Keyed door height**: the slice's doors are 3 tiles. On a 2-tile door Ben (33 px) is a pixel taller than the door, and Twin Leaves leaves only a 19 px opening under its transom. Is 3 tiles the standard?
- **The open door's prism**: today a shut door is a prism with a top strip and a right side face, and an open door is not drawn. With a held open frame, should the case keep its top strip and side face, or is the front-face frame enough?
- **Timing**: the opening durations are workshop choices; should the `dooropen` sound be cut to match (about 180 to 300 ms)?
- **Night**: the badge and the exit light are in the glow bank. Should the lift's leaves or the shutter catch the exit's light (they are in the lit bank now)?
- **Bytes**: per colour a keyed design is 512 B to 2,176 B as segments; does DOS want one colour-swapped copy for both doors instead of two?
