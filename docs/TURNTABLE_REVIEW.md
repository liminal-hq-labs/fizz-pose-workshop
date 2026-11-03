# Standing turntable artwork review

## Source sprites

The front stand has an 11-pixel-wide helmet, a centred white stripe and grey rim, two blue eyes, a small red mouth and a shaded chin. The red short-sleeved shirt carries the yellow/brown Fizz emblem. The arms hang beside the torso with white skin and grey shading. Blue trousers have a black centre division and cyan seams. The shoes are separate red high-tops with white soles, small toe shapes and black side outlines; the front shoes have no yellow dots. The occupied sprite is 32 pixels tall, ending on row 33.

The left and right front-quarter stands have 13-pixel-wide helmets with a projecting brim, the broken white/green stripe and asymmetric facial shading. The sleeve, forearm and hand overlap the shirt and belt. The nearer shoe is longer, with an ankle opening, red upper, white toe/sole and a small yellow detail; the farther shoe is raised and partly hidden. The right-facing stand exposes the purple hip-mounted Fizz Stunner. These sprites occupy 33 rows and end on row 34.

The running poses provide true side-view helmet, face, nose and brim shapes. Their shoes have separate heel/upper and forefoot patches, white near soles and grey far soles, with black outlines defining the ankle and toe. Running lean, leg swing, shoe flex and body bob do not belong in the neutral turntable pose. The climbing reference supplies the helmet back, grey rim and brown nape/hair; its raised arms and bent climbing legs do not define a standing rear view.

## Existing in-between frames and their problems

| Angles | Existing detail | Required treatment |
|---|---|---|
| 15°, 30°, 330°, 345° | Whole-row resampling narrows or stretches colours between the saved front and quarter views. Small gaps, seams and facial pixels can merge. | Keep the reference upper bodies, use separate lower-leg and shoe layers, and retain each ankle opening and sole. |
| 60°, 75°, 285°, 300° | The running-derived side head is recognisable, but the body transitions towards a generic volume-rendered silhouette. | Preserve the brim, ear, sleeve and belt definitions; replace the generated feet with detailed directional shoes. |
| 90°, 270° | The shoe volume becomes a broad rectangular red block, with almost no ankle/toe shaping. Far and near shoes overlap without a useful separating outline. | Draw two layered side shoes from the running shoe design, with a raised, shaded rear shoe and a full white near sole. |
| 105°–165°, 195°–255° | Facial features disappear towards the back, but the lower body is still interpolated as one silhouette. Seams, holster edges and foot separation become inconsistent. | Track each leg, shoe and hip attachment independently. Keep the near/far ordering and reveal the heel rather than painting a long rear-facing toe. |
| 180° | Both cuboid feet merge into a single wide red slab. | Use two rear-view high-tops, each with its own heel panel, black side outline and white sole. Preserve a trouser/foot division. |
| Full cycle | Sole alignment translates the entire shorter front sprite down one pixel, so the crown drops during the turn. | Preserve the front head and torso at their original rows. Add one denim row at the trouser-to-shoe transition in the turntable copy, keeping the crown on row 2 and the near sole on row 34. |

The shoe blocks are a generation error, rather than a feature of the reference artwork: a rectangular shoe volume was ray-cast and then whole-row contour interpolation merged the feet. The height change also came from the generator’s alignment choice. The source drawings remain unchanged.

## Refinement constraints

The front-quarter anchors retain their source pixels. The front turntable copy retains the source head, torso, arms and upper trousers; one duplicated denim row extends the lower leg before the shoes. Every stop keeps the crown on row 2 and the lowest sole on row 34. Shoes use small directional pixel patches with distinct uppers, ankle openings, soles and toe/heel silhouettes. The far shoe is drawn first, with a small perspective lift and a grey sole when exposed side-on; front and rear soles remain white. The near shoe masks its hidden pixels. Cyan trouser seams and the holstered Stunner are separate body-bound details, rather than stretched row colours.

## Fizz Stunner reference

The existing held side profile is eight pixels wide by six pixels high: a black silhouette, dark-grey top/barrel, purple and bright-magenta body, a short grip below the rear housing and a squared muzzle. The holstered patch is four by five pixels, with a dark belt clip, purple body and a tapered lower end. These exact patches are the source views for a standalone study. Opposite side views are mirrored; front, rear and quarter views are labelled interpretations because those details are not fully specified by the tiny on-character sprites. A firing view reuses the existing cyan/white/yellow discharge colours.

## Shoe and rear-head continuity

The first shoe refinement still mixed four-row front/rear patches with five-row quarter/profile patches. Keeping the sole fixed therefore moved the top of the shoe up and down when the template changed. All five directional patches now use five rows: an ankle opening, three upper/toe/heel rows and one sole row. Horizontal foreshortening remains six to ten pixels, while the collar and sole heights stay consistent. The far shoe retains the same structure before perspective lift and occlusion.

The rear transition previously selected one complete head texture before the halfway point and another afterwards. At 135°, ten brown pixels appeared at once. The brown-blond hair is part of the character and is retained as a separate eight-pixel rear patch. Its visible area follows the turning surface: the counts at 90°, 105°, 120°, 135°, 150°, 165° and 180° are 0, 1, 2, 4, 6, 7 and 8, reversing towards the other profile. Rear shading reveals from the trailing edge, while the helmet stripe follows one interpolated attachment rather than switching textures.

Profile/rear head registration is also unified. The model post is centred on x=15; the asymmetrical side patch anchors at x=16 for the right profile and x=14 for the mirrored left profile. The rear patch anchors at x=15. Through the rear half, helmet dome rows 4–6 retain bounds x=10–20 while the brim, hair and shading turn. Contour changes are spread between the expanding rear side and receding facial side to keep the head rounded. The original front and quarter references remain intact.

The running shoe skin omitted the yellow side detail. It is now a one-pixel badge bound to local shoe point (0, 0), behind the forefoot hinge. The binding follows the shoe’s pitch and compression and chooses the nearest red upper pixel so it does not paint the sole or outline. Each of the six saved running frames changes by exactly one yellow pixel; running pose, head, face, shoe outline and animation timing stay unchanged.

`scripts/sprite-continuity.test.ts` verifies fixed shoe structure, registered head contours, the gradual hair reveal and the rig-bound badge. `rig/ben-turntable/continuity-review.json` records the generated crown/sole rows, rear hair counts and dome bounds.

## 3D reference renders

The saved in-betweens are row morphs between unrelated keys. The render path instead poses the 3D Ben (`docs/BEN_3D.md`) at a turntable yaw and turns the view into a sprite grid in the saved sprites' format, as a reference to trace and clean rather than a finished frame.

```sh
bun run turntable:render                      # every 15° stop, sprite-faithful head
bun run turntable:render -- --angles 135,150  # selected stops only
bun run turntable:render -- --head cartoon    # another head style, in variants/cartoon-sprite/
bun run turntable:render -- --proportions model
bun run turntable:render -- --from-captures   # re-run the conversion on the saved captures
```

The command starts its own Vite server on a free port (or uses `TURNTABLE_RENDER_URL`) and drives system Chromium with software WebGL, as `bun run model:review` does. It writes only to `models/ben-3d/turntable-reference/`; non-default head styles or proportions go to a `variants/` subfolder so the committed set stays the sprite-faithful one. Renders are reproducible: running it twice gives byte-identical files.

### Method

1. **Render.** `src/model-3d/sprite-passes.ts` renders the Standing pose through an orthographic camera that maps one model unit onto one canvas pixel on the turntable canvas (32 × 44, centre column 15, sole row 34), at 8× supersampling. Three passes are drawn with no lighting, tone mapping, shadows or antialiasing: the unlit material and vertex colour, the view-space normal and the depth.
2. **Cel shade.** `scripts/sprite-render.ts` quantises each supersample to the nearest EGA colour, folds bright partners back to their base (r→R, g→G, b→B, m→M, so the model's lighter sleeves and bright shell do not decide the shade) and applies one light fixed on screen at the upper left, as the sprites are lit: skin, collar and soles darken W→L on the far side, the helmet and shirt gain g and r on surfaces facing the light. The result is saved as `flat-NNN.png` and `depth-NNN.png`.
3. **Sprite proportions.** The realistic model is 3.6 heads tall; the saved sprites are 2.9. A piecewise-linear height map moves the model's helmet rim, eyes, chin, collar, belt and shoe top onto the sprite rows (rim on row 8, eyes on row 9, collar on row 14, belt on row 23, shoes from row 31), and a width map widens the helmet ×1.25, the shirt and arms ×1.2 and the shoes ×1.3. `--proportions model` skips the map.
4. **Downsample.** Each pixel takes the majority colour of its 8 × 8 supersamples if at least half are covered. Small details win their pixel at a set share: eye dots on skin (12%), the mouth (25%), the chest emblem (20%), the helmet stripe (22%) and rim (25%) on the shell, the jeans seam (15%). Hair and foam glimpsed through the helmet vents become shell green; the ground row's grey sole underside stays white.
5. **Ink and clean-up.** A pixel whose left or right neighbour is more than 1.6 units nearer gets ink, which separates an arm from the shirt and one shoe from the other; vertical overlaps stay uninked, as in the sprites. Filled pixels with no filled side neighbour are removed, lone depth-ink dots are dropped, and a lone shade pixel joins its base colour. A one-pixel black outline is then drawn outside the silhouette (ink, not extra volume), never below the ground row, and empty pinholes boxed in by ink close up.

`references.json` holds the 24 converted grids, the head style, scale and conversion settings; `sprite-NNN.png` are the grids at native size and `contact-sheet.png` puts each saved `ben_turn*` stop above its render. In the pixel editor, **3D reference** draws the render for the selected standing-turn frame under the sprite (or over it with **On top**) at the chosen opacity. It is off by default, only paints the editing canvas, and leaves the frame, drafts, history and project saves unchanged.

`scripts/turntable-render.test.ts` checks that every grid is reproduced exactly from its committed captures, uses only palette codes, fills the 32 × 44 canvas from row 2 to the sole row 34 on the centre column, has no colour pixel touching transparency except under the soles, mirrors between left and right turns outside the Stunner's hip rows, and keeps the Stunner on Ben's right hip. Synthetic captures check the outline, detail, speck and ink rules.

### The 135° pilot

`source/turntable-pilot-135.json` is a draft of the missing 135° key, cleaned by hand from `sprite-135.png`. It is not in `edits.json` and does not replace `ben_turn135`. `pilot-135-comparison.png` lays out the saved 0°, 45°, 90°, 135°, 180° and 315° frames, the renders at the same angles, and the pilot under the 135° column, at 8×.

The render supplies what is visible at 135°: the back of the helmet and the stripe heading down it, brown hair at the nape on screen left, his right arm and right hip towards the viewer, the Stunner on that hip only, and the near right shoe overlapping the far left one, toes pointing away. The pilot keeps those and redraws them in the saved sprites' conventions: the 11-pixel helmet with g lit upper left and a grey rim across row 8, the stripe running diagonally from x16 on row 3 to x14 on row 6, the rim shadow and three rows of hair, a grey ear at x17, a one-row white collar on row 14 above an all-red shoulder row 15 (so it cannot read as a scarf), a shaded far arm and a lit near arm, the four-row holstered Stunner patch at x19–20, rows 24–27, two separated legs with cyan seams, and two shoes: the far one lifted a row with a grey sole, the near one with the yellow badge, two red highlights, a white toe cap and a full white sole.

The automatic render is not close enough to use directly. 189 of the pilot's 336 drawn pixels (56%) differ from it, 52 of them in the silhouette, and the renders at the saved anchors differ from the saved frames by 148 (0°) to 274 (45°) pixels. At 135° the render gets these wrong:

- The helmet stripe hugs the left silhouette (x13 on row 3 down to x10 on rows 6–8) and reads as a white outline; the 0.5-unit grey trim drops below the brim at the back, so row 8 has no grey rim; the crown's ink cap is four pixels (x13–16) against the saved six.
- The face side has no ear, and a shell-edge green pixel sits at (11, 9) in the hair.
- The collar row 14 is three white pixels with a red pixel at (13, 14) and doubled ink at x17–18; row 13 also ends in doubled ink.
- The emblem wrapping round the side leaves a stray yellow pixel at (17, 18); the shoulders have no highlight.
- The model's longer arms put the near hand on rows 23–25 beside the holster; the sprites end the hands on row 23.
- The Stunner is one to two magenta pixels at x17, rows 23–25, between the hand and the jeans, rather than the sprite's 2 × 4 holster patch.
- Both legs merge into one five-pixel block (x13–17, rows 24–30) with a single seam pixel at (17, 29).
- Both shoes rest on the ground row, so the far shoe is not lifted; the near shoe has no badge and only one toe-cap pixel at (21, 33).

Across the turn, the sprite-faithful head's flat eye dots vanish edge-on, so the true profiles at 90° and 270° have no eye and no nose; the crown's ink cap is three or four pixels at every angle against the saved five or six; at 0° each eye is two pixels wide (x13–14 and x16–17) against the sprite's single pixels at x13 and x17, the mouth is one pixel at (15, 11) against three, and the emblem becomes a seven-pixel yellow bar on row 17. The Standing pose differs from the saved quarter stands (feet side by side, arms straight down), which is most of the 45° and 315° difference. Lighting is fixed on screen, so left and right turns mirror in silhouette but not in shading.

So the render is a reliable guide to visibility, occlusion and placement at angles that have no saved art, and the underlay makes that quick to trace, but each key still needs a pixel artist's redraw of about half its pixels. Posing the 3D Standing pose like the saved quarter stands (staggered feet, the quarter arm positions) and giving the head a profile eye would cut that work most before the remaining keys are drawn.
