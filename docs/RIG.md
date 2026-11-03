# Side-view rig and sprite tools

The running motion is defined as a continuous skeleton, then sampled into six sprites. Arm bones retain their lengths and elbow bend direction throughout the loop. Legs use two-bone inverse kinematics to reach a smooth foot path, with the knee pole always pointing forward. The pixel skin uses those same joints; its arm poses are not separately keyed.

## Files

- `source/ben-side-rig.json`: editable dimensions, bone lengths, running speed, torso lean, shoulder twist, stride and toe angles.
- `source/ben-side-skin.json`: palette-indexed head, shirt, shoe and Stunner patches, local anchors and small towards/away facial variants.
- `src/rig/kinematics.ts`: reusable vector transforms, forward kinematics, two-bone inverse kinematics and Bézier evaluation.
- `src/rig/face.ts`: head-local facial landmark projection and shared pixel snapping.
- `src/rig/run.ts`: continuous `sampleRunRig(rig, time)` solver. Time is measured in complete cycles and wraps smoothly at 1.
- `scripts/rig-skin.ts`: `skinRig(rig, skin, pose)` and `sampleRigSprites(rig, skin, prefix)` turn a skeleton into palette-indexed grids.
- `scripts/export-rig.ts`: saves the rig, skin, joint samples, animated skeleton SVG, individual skeleton SVGs, individual sprite PNG/SVG files and a sprite GIF.
- `src/rig/preview.ts`: the live continuous-versus-six-samples viewer, with a scrubber, slow playback, stepping and skeleton overlay.
- `rig/ben-running/`: saved exports of Ben’s current rig and six sampled poses.

## Draw and export

```sh
bun run draw:run
bun run generate
bun run validate
```

`draw:run` replaces the six running grids in `source/poses.json` from the rig and saves `rig/ben-running/`. In `edits.json` it updates only the running overrides that still match the previous redraw; an override that differs is a manual edit, so it is kept and reported. Run `bun run draw:run -- --replace-edits` to discard those edits deliberately. `generate` rebuilds the normal sprite files and gallery with saved editor overrides applied. Ordinary generation does not redraw the rig.

The lab’s **Rig first, six sprites second** section previews the continuous skeleton and its current editable sprite samples. **Six samples** holds the rig at the same six times as the sprite. **Overlay sampled rig on sprite** shows the sampled skeleton over the artwork. The previous/next buttons pause and step through the six poses, including the last-to-first transition. The standalone `rig/ben-running/rig.svg` animates 60 samples of the same rig; reduced-motion preferences show its first pose.

## Reuse with another character

Copy the rig and skin JSON files, change their names, dimensions, proportions and pixel patches, then export them without replacing Ben’s lab frames:

```sh
bun run rig:export source/my-side-rig.json source/my-side-skin.json rig/my-running-character
```

The optional positional arguments are the rig path, skin path and output directory. With no arguments, the command exports Ben. The exporter writes only to its output directory. To add a custom character to this gallery, register the returned `sampleRigSprites` grids and its animation references in `source/poses.json`; the existing editor and asset generator then handle those frames.

The generic sampler can also produce more than six poses. Choose a sample count and cycle duration whose frame duration is a multiple of 10 ms, matching GIF timing. Ben uses six samples across 600 ms: 100 ms per sprite.

## Rig settings and coordinates

Positive x is right and positive y is down. Units are source pixels. Joint positions remain floating point through the skeleton solve and are quantised only when the skin is drawn. The pixel canvas must contain the character’s full stride, helmet and hands; the renderer reports clipping rather than silently cutting off a limb.

- `root` is the in-place pelvis anchor. `groundY` is the shared contact line.
- `torso.leanDegrees` sets the forward lean; `pitchSwayDegrees` adds a small cyclic pitch. `bobAmplitude` and `bobLag` control vertical movement. `shoulderY`, `shoulderSpread` and `shoulderTwist` place the shoulders and counter-rotate them with the arm swing. `neckHeight` keeps the neck attachment a fixed distance from the pelvis.
- `arms.upperLength` and `forearmLength` are fixed. `swingDegrees` drives opposing shoulder angles; `phaseLead` aligns the swing with the leg recovery and `biasDegrees` sets its resting pitch, while `elbowDegrees` and `elbowFlexDegrees` keep a consistently bent elbow with a small natural variation. The forearm never changes bend direction when the upper arm crosses the torso.
- `legs.thighLength` and `shinLength` are fixed; the knee pole points forward. `hipSpread` separates the projected near and far hip attachments.
- `feet.heel`, `ball` and `toe` are local offsets from the ankle. The ball is the forefoot hinge and ground support. `landingToeDegrees` lifts the toe at contact, and `landingCompression` softens the shoe upper before it settles. Match those offsets to the shoe skin’s local coordinates.
- `stride.stanceFraction` must be less than half a cycle, leaving two flight windows. `frontX` and `backX` control reach. `lift` shapes the heel kick behind the body, and the optional `reachLift` shapes the forward swing (it defaults to `lift`). Ben uses `lift: 6.5` and `reachLift: 2`, so the recovering heel peaks about 3.8 pixels above the ground and the toe about 4.1, while both feet still clear the ground in the flight frames. The optional `nearPassForward` swings the near (camera-side) foot that many pixels wider forward around mid-swing (progress 0.4–0.72, eased in and out), so its shoe passes in front of the planted far shin instead of cutting it into a stub. The far foot passes behind the near leg and keeps the plain path. Ben uses `nearPassForward: 2`, which affects only frame 5 of the six samples. `toeOffDegrees` raises the heel around the supporting ball of the foot; `recoveryToeDegrees` lifts the toe in flight.

During stance the ball of the foot remains on the ground and moves backwards at a constant speed relative to the in-place body. Adding the corresponding virtual forward travel keeps that support point fixed in world space. A quintic Bézier recovery path preserves the endpoint velocity while folding and advancing the foot. The far leg uses the same path half a cycle later. Bone lengths constrain both arms and legs continuously, including between the six sampled frames.

## Skin binding

Head patches attach to a shared snapped neck anchor. Eye and mouth positions come from `face.eye` and `face.mouth` in the rig, rather than alternate bitmap rows. Their three coordinates are head-local x, y and depth; `face.yawDegrees` controls the small camera-facing rotation. Projection is continuous, but local coordinates are rounded before adding the common pixel anchor so the dots cannot drift independently of the helmet. The helmet, ear, cheeks and jaw stay anchored; the eye, mouth and nose shift within that silhouette. With `face.featureTurn: [away, towards]`, the features take three discrete poses by head turn: away, profile and towards the camera. `face.mouthWidths` gives the mouth width for each pose, with its front pixel held on the head-local `face.mouthFront` edge, and `face.farEye` reveals the other eye that many pixels in front of the near eye on the camera-facing pose. Rigs without these settings keep a one-pixel mouth that widens backwards on the camera-facing turn. Shirt patches attach to the pelvis and rotate with the torso; their towards/away variants suggest chest rotation. Sleeves cover the upper half of the arm’s first bone, and the exposed arm continues through the elbow to the hand. Shoes have separate heel and forefoot segments. Landing raises the toe and briefly compresses the upper, then the front settles flat. At push-off the heel rises around the grounded ball while the toe stays planted; the hinge relaxes in recovery and lifts again before contact. The Stunner attaches beside the near hip and rotates with the upper thigh.

Each patch contains rows with `x`, `y` and `pixels`, plus an `anchor`. The head and torso accept optional `towards` and `away` rows. The shoe has near/far rows, a ball pivot and `flexX` hinge. All colour codes come from `source/game-palette.json`, preserving the game’s sixteen opaque colours and transparent `.`.

## Verification

The tests sample 241 times across a cycle, measuring bone lengths, elbow bend orientation and leg reach. They check forefoot ground locking, landing compression, toe-off bending, flight clearance, loop continuity, six-phase contact order, palette constraints and the rendered soles. Export tests exercise a different canvas, proportions and sample count. Browser checks cover continuous playback, six-pose stepping, the overlay, mobile layout and the frame-for-frame SVG/GIF/PNG output.

## Facial landmark inspection

The rig viewer includes six head-aligned crops and a coordinate table. Each row lists the snapped head anchor, actual eye and mouth pixels, the expected ear pixel and whether its colour matches, and their offsets within the head. The base offsets are eye (+2, −5), mouth (+2, −3) and ear (−1, −4); the eye and mouth move within the head while the ear stays anchored. Continuous projected coordinates are shown above the table, and the landmark overlay is available on the rig and sprite. A row marked **Draft differs** identifies manual browser edits that no longer match the generated rig.

`rig/ben-running/face-sequence.json` saves both rig-derived and measured pixel coordinates; `face-sequence.svg` saves the head-aligned sequence. The exporter also includes full facial landmarks in `samples.json`. Tests cover a subpixel rounding-boundary case, 241 continuous poses, all six rendered eye/mouth pixels and the loop seam.

The running eye is the motion anchor. `face.eyeTravelPixels: 2` limits its entire canvas path to two horizontal pixels, including movement inherited from the torso; vertical travel stays within one pixel. The running face uses `turnLead: 1/18` (the head turn leads the stride by 20°), `featureTurn: [0.45, 0.8]`, `mouthWidths: [1, 2, 3]`, `mouthFront: 3` and `farEye: 2`. Frames 2 and 3 turn away (eye x18, one-pixel mouth at x18, nose tucked). Frames 1, 4 and 6 show the profile (eye x17, mouth x17–18, nose visible); frame 6 keeps the camera-facing head shading. Frame 5 is the camera-facing peak (eyes x16 and x18, mouth x16–18, nose tucked). These faces were refined by hand in the editor and the rig reproduces them exactly. The nose is part of the silhouette: it projects in the neutral side profile and retracts by one pixel at either turn, blending into the head. The helmet, ear, cheeks and jaw retain their original attachment. `face.profile` supplies the nose, cheek and chin landmarks.

The run's subtle head rotation is carried by the face sliding inside a still helmet. `seatedHead` in `src/rig/run.ts` snaps the head column to the rest neck plus the rounded sway, so the sub-pixel pitch sway cannot hop the helmet sideways in only one stride. It snaps the head row to the lowest canvas row that the torso patch still maps to the neck, so the white collar always rests directly on the red shirt rather than leaving an ink gap when the continuous neck sits near a pixel edge. The helmet therefore keeps one column and bobs identically in both strides (rows 15, 15, 14 twice), while the features turn inside it. The eyes and mouth together span three canvas columns (x16–18), so the face travels two pixels across the cycle, and the mouth's front pixel stays at x18, matching how the saved standing profiles end the mouth under the front eye. The head's `towards` variant drops the back-of-head shade on the ear row, so the lit face keeps a solid two-pixel ear instead of alternating grey and skin pixels. Tests cover the fixed helmet column, the matching strides, the collar join in all six sprites, the absence of speckled face rows across 241 samples, the per-pose mouth and eye pixels and that the rig alone redraws the pinned, hand-edited faces.

## Pogo and Fizz Stunner rigs

`src/rig/sample.ts` selects the continuous sampler using `motion`: omitted or `run` for running, `pogo` for spring motion and `fire` for the Fizz Stunner. `src/rig/actions.ts` solves action arms and legs with fixed bone lengths and explicit grip/ankle targets. The elbow pole keeps elbows beneath the aimed hands. All motions use the shared skin and facial landmark projection.

`source/ben-pogo-rig.json` sets spring compression and extension, shaft length, peg height and flight lift. Ground contact occupies phases `0–0.18` and `0.82–1`; the spring extends before flight and compresses after landing. The tip rises six pixels during flight. The pelvis follows the pegs, the shoe soles sit on the pegs and the hands follow the handle. The 24 × 52 canvas includes clearance for the helmet and stick. The six 150 ms samples are compression, launch, rise, apex, fall and landing.

`source/ben-fire-rig.json` sets recoil distance and muzzle kick. Feet stay fixed while the pelvis and torso react to recoil; both hands follow the gun. The held purple Stunner replaces its holstered patch. The 32 × 44 canvas allows room for the muzzle and flash. The six 100 ms samples are aim, discharge, recoil, recovery, settle and ready; the discharge sample includes a small palette-coloured flash. The firing gaze stays aimed, with `face.shiftAmplitude` set to zero.

Run `bun run draw:actions` then `bun run generate` to update the twelve editable action frames and their active gallery loops. This overwrites the corresponding editor overrides. `rig/ben-pogo/` and `rig/ben-firing/` contain the configuration, shared skin, joint samples, continuous SVG, six static skeleton SVGs, six PNG/SVG sprites, GIF and facial sequence measurements. The generic exporter accepts either action rig, for example `bun run rig:export source/ben-pogo-rig.json source/ben-side-skin.json rig/ben-pogo`.

The viewer's **Action** selector switches between the saved rigs. Continuous motion, six samples, speed, scrubbing, stepping, overlays, facial inspection and download links follow the selected action. The sprite sheet uses the maximum frame dimensions for its cells and records each frame's native rectangle in `assets.json`.

The side-view skin preserves the original helmet and facial outline. The nose projection is retracted at either turn; the ear, cheeks and jaw stay attached to the head.

## Climbing, jumping and expressive performances

`src/rig/catalogue.ts` registers all twelve rigs and their frame names, labels, animation names and export folders. `source/ben-ladder-rig.json`, `ben-jump-rig.json`, `ben-fall-rig.json`, `ben-death-rig.json`, `ben-ledge-rig.json`, `ben-whistle-left-rig.json`, `ben-whistle-right-rig.json` and `ben-phone-rig.json` define the performances; the left-facing jump, fall and ledge pull share their right-facing rig's keys. `performance.keys` stores pelvis position, torso lean, head roll, hand and ankle targets, expression and support flags. The continuous solver in `src/rig/performance.ts` interpolates these goals and solves fixed-length arms and legs. Unreachable goals and invalid phase ordering stop the export.

Run `bun run draw:performances` then `bun run generate` to rebuild the performance frames and their saved export folders. Name animations to redraw only those rigs, for example `bun run draw:performances jump fall`. An editor override that differs from the previous redraw is a manual edit and is kept; pass `--replace-edits` to adopt the rig's grids instead. Ordinary generation preserves manual adjustments. The two existing action rigs still use `bun run draw:actions`; running uses `bun run draw:run`.

### Interpolation through keys

Every channel (pelvis, lean, head roll, foot angles, phone) follows a monotone cubic Hermite curve through its keys, with Fritsch–Butland tangents for uneven key spacing. Velocity carries through each key instead of easing to a stop, but the curve never overshoots a key, so a held value stays still and a limb never exceeds its keyed reach. Loops use periodic tangents across the seam; one-shots start and end at rest. A key marked `hold: true` rests on its pose (anticipation, impact, final pose). A key marked `beat: true` is a deliberate comic snap that also rests, and it is the only place head roll or lean may swing across zero by three degrees or more.

Free hands and feet are interpolated as an angle and reach about their shoulder or hip, so they swing on arcs instead of cutting straight lines through the body. A target keyed at the same canvas point on both ends of a segment (a ledge grip) stays pinned, and a foot supported on both keys slides along its support.

An in-place loop that the game moves through the world sets `performance.travel`, the world displacement per cycle. Its keys are authored in world coordinates and its last key is the first moved by `travel`, so a hand or foot keyed at one point on consecutive keys holds that rung; the sampler subtracts the travel so far, which keeps the sprite in place while the rungs scroll past it. The skeleton preview scrolls the ladder guide by the same amount, so a pinned grip stays on its rung there too.

Keys need not sit on sample times. `performance.sampleTimes` lists the phase of each saved sprite (one per `sampleCount`, starting at zero, and ending at one for a one-shot), so in-betweens can fall wherever the motion needs them. `frameDurationsMs` then sets each sprite's hold: the jump holds its crouch and apex, the ledge pull holds its hang, and the death holds every beat.

### Ink-safe patch rotation

Small head rolls are drawn as a whole-pixel row shear (`tiltOffset` in `src/rig/kinematics.ts`) rather than a free rotation: every authored row of the helmet and face keeps its pixels and outline, and only whole rows step sideways. The rig's eye, mouth and expression pixels follow the same shear. Larger torso leans still rotate, but performance rigs seal the result: any drawn pixel whose source was fully enclosed in its patch, and which now touches empty canvas, gets ink in that neighbour. Performance rigs also ink one-pixel notches in the collar and shoulder band (the four rows below the collar), where a limb outline meets the shirt. Only existing palette codes are written. Run, pogo and firing keep the plain nearest-neighbour rotation so their saved references stay byte-for-byte.

The holstered Stunner swings with the near thigh by at most 35° in performances, so a raised knee cannot fold it up behind the shirt. A near knee raised above the hip (climbing onto the ledge, kicking in a fall) is drawn in front of the shirt.

### Cloth parts

A rig opts into secondary shirt motion with `clothing` in its JSON (`src/rig/clothing.ts`). It is deterministic and subtle at sprite scale: one pixel of movement in the right frames. The settings are:

- `lag`: the follow-through delay in cycles.
- `airflow`: the constant world velocity, in pixels per cycle, that an in-place rig stands for. A fall uses `[0, 40]`.
- `hem`: `row` (the shirt row directly above the belt), `threshold` (the speed in pixels per cycle that flares the hem) and `flutter` (whole waves per cycle, so a loop stays seamless).
- `sleeves`: `slide` (pixels a cuff may move along the upper arm) and `threshold` (the arm-swing speed, in degrees per cycle, for a full slide).
- `raisedSleeves`: pixels a cuff rides up its upper arm, towards the shoulder, while that elbow is above the shoulder. The ladder climb uses it, so the sleeve rides up the reaching arm and drops back as the arm pulls down.

The sampler takes the body's velocity `lag` cycles earlier plus the airflow. Moving forwards or backwards drags the hem out behind the motion. Falling or rising lifts it, so it flares one shirt pixel past its back or front outline, alternating with the flutter. The cuffs lag the upper arm's swing, and they ride up the arm in turn with that flutter. The skin changes only the hem row of the torso patch and the cuff position, so the collar, emblem, belt and Stunner keep their authored pixels and the outline stays closed. The fall, both ledge pulls (a one-pixel hem flare as the body surges up and over, and cuffs that lag the reaching arms) and the ladder climb use it. The run, look loop and standing sprites are pinned reference art and do not. The jump renders cleanly with it but keeps its approved art for now, and the front-view death and phone use a different shirt patch. An arm raised past the collar row may move its cuff there, but only along its own upper arm.

| Rig | View and pose sequence | Playback |
|---|---|---|
| Ladder climb | Back view, hand over hand: eight sprites at 180/150/150/120 ms per half. A hand catches a rung (held longest), pulls while the body surges up, then the other hand lets go and reaches two rungs up to the next catch. The opposite foot steps up two rungs just ahead of it, and the body sways a pixel towards the gripping hand. Every grip and foothold stays on its rung while held (`travel: [0, -8]`), and the sleeve of a raised arm rides up. The approved rear head is unchanged, and the Stunner hangs on Ben's right hip, the viewer's right. `ben_climb1`–`2` are the two catches, cropped to the 24 × 44 frame | Loop |
| Jump | Crouch, launch, apex, fall, land, recover at 180/80/130/100/110/120 ms. The feet follow the legs in the air: the trailing foot folds back with its shin (toes down and back, white sole facing back and up) through launch, apex and fall, the leading foot points its toes down at launch and for the landing and levels out under its knee at the apex, and the soles are flat only on the ground (crouch, land, recover). `replay: "continuous"` loops the saved animation straight from recover back to crouch | Hold final pose in the rig viewer; the gallery and exports loop |
| Jump left | The same six poses and timing turned round with `facing: "left"`: Ben's Stunner stays on his right hip, which now faces away, so only a sliver of the holster peeks out behind the body (as on the saved `ben_stand`) | Hold final pose in the rig viewer; the gallery and exports loop |
| Fall · right and left | Six sprites at 100 ms, braced for impact rather than flailing: falling feet-first with a slight forward crouch, the head tucked a little, both arms drawn in to guard the chest, knees bent and feet lightly staggered ready to land. The loop is a small sway and a one-pixel drop and rise in the frame; the hands stay within a pixel and a half of their guard. `ben_fallLeft1`–`6` use `facing: "left"` with the Stunner on the far hip | Loop |
| Dramatic death | Seven sprites: startled take, then the head wobbles left, right, left, right on held beats (clutch, tongue out, dizzy eyes, wince) while the body sags one way, a topple in-between and a final comic collapse to the other side; both oversized soles face the camera | Hold final pose |
| Ledge pull · left and right | Eleven sprites: hang (held), pull, haul, chest over edge, elbows lock, swing the knee, knee up, plant the foot, push to crouch, rise, stand; grips stay pinned through the pull. The left set (`ben_ledgeLeft1`–`11`, animation `mantle-left`) shares the keys through `facing: "left"`, so the Stunner stays on Ben's right hip, hidden on the far side, instead of appearing on both hips | Hold final pose |
| Whistling idle · left and right | Saved standing artwork in layers: two beats per loop with a one-pixel knee dip, a rigid forward and back sway, a nod, a near-toe lift before each beat, a lower-lip pulse, a blink and notes floating off the lips | Loop |
| Seated phone idle | Nine sprites: face camera, bend the knees, sit down, fold legs, reach for the phone, take it out, raise screen, read, settle; crossed shins and both hands around the phone | Hold seated pose |

Back-view climbing uses a rear helmet and shirt skin with no visible face. From behind, both arms come out over the shirt in the same light with the elbows hanging beneath the grips, and `stunnerBack` in the skin hangs the holster from the belt beside Ben's right thigh, on the viewer's right. Its ladder rig has slightly longer arms (4.2 and 4 px) and higher shoulders than the side rigs, so a reaching hand clears the helmet rim. Front-facing death and phone poses use the saved front-facing Ben artwork for their helmet and face proportions, with rig-painted expressions. Death presents large sole patches towards the viewer and keeps both hands at the belly; head roll and changing expressions provide the exaggerated performance. The phone back has a small camera detail and yellow Fizz mark, with no baked screen glow. The phone rig uses wider folded-leg bones to make the crossed-leg silhouette readable.

Ladder and ledge geometry appears only as a guide in the skeleton preview and skeleton SVGs. Sprite exports stay transparent and contain the character and personal equipment. These are in-place art studies; the game simulation will supply world movement.

One-shot performances include both endpoint poses, using their `sampleTimes` or, without them, `i / (sampleCount - 1)`. The rig viewer stops at the final pose. One-shots are saved with `loop: false`: the **Action loops** gallery holds the final pose for 1.2 s (`oneShotRestMs` in `src/rig/timing.ts`) and then replays, so the review never snaps from the last pose straight back to the first. Every animated GIF and SVG export, including the saved skeleton SVG and sprite GIF, loops continuously so any viewer keeps it moving; a one-shot folds the same rest into its final frame. The motion tests therefore measure no wrapping step for one-shots. Use **Play rig** to replay a completed rig or **Restart animations** to replay gallery actions. Loops use `i / sampleCount` and wrap continuously. Front/back facial inspection compares the head crop with the saved project artwork, so comic mouth shapes and hidden faces are reported correctly while edited drafts remain detectable.

### Phone-screen lighting

The phone idle faces the camera. Its screen faces Ben while the dark back case faces the player. The hidden screen should act as a small dynamic light in the game, brightening Ben’s face and hands once the phone is raised. Fade or modulate that light with screen visibility, and move it with the phone grip. Keep the lighting separate from the sixteen-colour sprite pixels. `lightingNote` in `source/ben-phone-rig.json` and its saved rig/sample exports preserves this integration note. The workshop displays the palette-only artwork; it does not implement engine lighting.

Left and right whistling rigs use complete patches of the current saved `ben_stand` and `ben_standRight` artwork. Their transparent canvas has four pixels of horizontal padding around the original 24 × 44 frame. Neither is a mirror of the other: the right view shows the Fizz Stunner on Ben's right hip and the left view keeps it hidden on the far side.

`standingIdle` in `source/ben-side-skin.json` splits each saved standing sprite into layers, in the sprite's own pixel coordinates, and `paintStandingIdle` in `scripts/performance-skin.ts` moves whole rows instead of redrawing them, so the helmet, collar, shirt, Stunner and shoes keep every saved pixel:

- **Bob:** rows above `kneeRow` ride the pelvis. Keying the root one pixel lower drops the knee row (the knees soften) while the shoes stay planted.
- **Sway:** the keyed `lean` shifts every row above `chestRow` (head, collar and shoulders) as one rigid block, by the lean's offset at that row, so the helmet never shears apart.
- **Nod:** `headRoll` additionally shears the rows above `neckRow` about the neck. The whistle nods forward by 4° and back by 3°, the largest rolls that keep the helmet's ink rim whole.
- **Toe tap:** a near foot keyed at 4° or more (`nearFootDegrees`) swaps the planted shoe rows for the authored `toeUp` rows, lifting the near toe by one pixel.
- **Lips:** the saved three-pixel mouth is painted over with skin and a two-pixel red pucker sits at the front of the face. The `lip` pixel directly beneath the pucker matches the light-grey lower-lip shade under the mouth of the saved front-facing stand. The keyed `pucker` channel turns it red from 0.5 as the lips push out to blow a note, then back to grey.
- **Blink:** the keyed `blink` channel turns both visible blue `eyes` pixels light grey (`L`) from 0.5, for a single frame with no in-between shades.
- **Notes:** `performance.notes` gives a cubic Bézier path and an `emitPhase`. Each note lives for two loops along the path, so one note leaves the lips per loop while the previous one drifts up and away; at the seam the old note leaves the top as a new one appears at the lips. The left rig mirrors the path, but the note glyph keeps its orientation.

The six sprites, held for 240, 200, 160, 240, 140 and 220 ms, are: the first beat (dip, lip red, a new note at the lips); sway forward with the lip still red; nod forward as the lip releases to grey and the toe lifts; the second beat (dip, toe down); sway back with a blink; and a slight nod back as the toe lifts again, leading straight into the first beat. Tests check the planted feet, the note path and seam, the one-hip Stunner, the helmet and collar, the timing of the toe lift, the lip and blink sequence, and that the notes never touch Ben's outline.

`src/rig/reflect.ts` reflects the complete skeleton, facial anchors, feet and environment guides for left-facing actions. Both ledge directions have separate editable frames, previews and export folders.

The jump’s airborne keys spread the ankles sixteen pixels apart at the apex and set independent `nearFootDegrees` and `farFootDegrees`; positive angles turn the toe down, and the white bottom row of the shoe is its sole. The trailing near leg bends back in the air, so its foot follows the shin past vertical: 135° at launch, 150° at the apex and 140° in the fall, with the toes down and back and the sole facing back and up. The leading far foot uses 40°, −5° and 40°. The crouch, landing and recovery stay at 0°. Performance shoes at these angles are sealed like rotated patches, so the red upper keeps its ink outline and an upturned sole is inked too. Ink never goes below the shoe's lowest row, and a pointed foot eases flat as it nears the ground so it never digs through it.

`facing: "left"` on any side-view rig turns it round for left-facing sprites without plain mirroring. The skeleton, face, collar, limbs and shoes reflect (the near limbs stay camera-side and the shoe badge stays on the near shoe's outer side), but the Fizz Stunner stays on Ben's right hip. Facing left, that hip is on the far side, so the right-facing render hangs the holster on the far hip and draws it before the far leg, torso and near limbs, which cover it. The jump (`ben_jumpLeft1`–`6`, animation `jump-left`, exports in `rig/ben-jump-left/`), the fall and the ledge pull use it, sharing the right-facing keys. A held weapon is not yet moved to the far hand, so left-facing firing still needs that before it uses the option. `mirrored: true` remains a plain whole-sprite mirror; no Stunner-bearing Ben rig uses it, and a motion test fails if any saved Ben frame that shows the Stunner is an exact flip of another frame.

The death is comic and friendly rather than a realistic fall. Its wobble is authored as `beat` keys: each roll flip lands on a beat that is sampled as its own sprite and held for at least 160 ms, consecutive flips alternate sides, the roll stays within 12°, and the lean flips only once, at the final held collapse, with the head flopping the same way. `scripts/motion.test.ts` checks these rules in place of the generic roll-flip guard.

The brace-for-impact fall (`source/ben-fall-rig.json`, `ben_fallRig1`–`6`) is a loop distinct from the jump: the feet stay together instead of striding, and the arms stay guarding the chest. Its left-facing set (`ben_fallLeft1`–`6`, animation `fall-left`) shares the same keys through `facing: "left"`, so the Stunner stays on the far hip instead of being copied across.

The front-facing **Look up & down** loop reuses the saved standing, look-up, half-bend and full-bend sprites. Its sequence is neutral → up → neutral → half-down → full-down → half-down. Looking up holds for 800 ms, each downward pose for 400 ms and each neutral transition for 200 ms. Run `bun run draw:look-loop` then `bun run generate` to restore this timing without redrawing any artwork.

## Standing 360° model-sheet study

`source/ben-turntable-rig.json` stores a fixed standing post in three dimensions: pelvis, neck, head, shoulders, elbows, wrists, hips, knees, ankles, toes, facial landmarks and the anatomical right-hip Stunner. Positive yaw turns Ben towards screen right. `src/rig/turntable.ts` rotates and projects these joints without changing their model-space positions or bone lengths. The turntable has its own preview section and playback controls; it is separate from the action rig selector.

`source/ben-turntable-skin.json` snapshots the current front and three-quarter standing sprites, all six right-running frames, the ladder reference and the shared side/rear head patches. These stable snapshots make regeneration reproducible without replacing the source artwork. The front quarters are preserved pixel for pixel with four pixels of horizontal padding. The front copy retains its original head, torso and upper trousers; a duplicated denim row at row 30 moves only the shoes down one pixel. Every turn now keeps its crown on row 2 and lowest sole on row 34. The original source sprites are unchanged.

| Yaw | Source and treatment |
|---|---|
| 0° | Saved front-facing stand with one added lower-leg row |
| 45° | Saved right-facing three-quarter stand |
| 90° | True right profile from the running head, over a neutral standing body |
| 180° | Climbing rear head over a neutral standing body |
| 270° | Mirrored running side head, with hip equipment handled separately |
| 315° | Saved left-facing three-quarter stand |

The remaining 15° stops interpolate the upper-body contours between these keys. Legs, shoes and equipment are separate detailed layers driven by the standing rig. Eyes and lips are hidden behind the profile. The hip equipment is projected from its own body landmark so it does not swap sides around the back. Standing side and rear bodies are inferred using the rig volumes in `scripts/turntable-skin.ts`; `scripts/turntable-reference.ts` preserves the authored keys and constructs the transitions. This is a reference-guided pixel-art turntable, not a uniquely reconstructed textured 3D mesh. The guide skeleton provides a stable geometric post while the preserved sprites retain their view-specific poses.

Run `bun run draw:turntable` followed by `bun run generate`. This overwrites only `ben_turn000` through `ben_turn345` and their saved editor overrides. The existing standing, climbing and running sprites remain unchanged. `rig/ben-turntable/` contains the rig, reference skin, 24 projected joint samples, 24 skeleton SVGs, 24 PNG/SVG frames, a sprite GIF and `reference-audit.json`. The regular animation exports are `animations/standing-360.gif` and `animations/standing-360.svg`.

### What the turn reveals

The front helmet is 11 pixels wide, while the two front-quarter helmets are 13 pixels wide. The broader quarter view is a defining part of Ben’s rounded helmet and forward brim, rather than a feature that can be obtained by simply narrowing the front image. The white stripe, grey rim, blue eyes, red shirt emblem and red high-tops provide the main landmarks around the turn. The rear head introduces the brown hair/nape and omits the facial features.

The original front stand is 32 occupied pixels tall, compared with 33 for both front quarters. Aligning their soles exposes a one-pixel difference at the crown. Arm/hand placement and the staggered side shoes also vary between the drawings. The turntable copy compensates for the height difference at the lower leg. These source sprites are strong individual poses but do not yet specify one perfectly rigid neutral model. A future model sheet can standardise crown height, shoulder/hand positions and shoe spacing while retaining the original drawings as references. The audit records the source bounds so these decisions can be made deliberately.

The Stunner is an asymmetric design landmark. Its attachment belongs to Ben’s anatomical right hip; visibility changes with yaw, but its body-side identity stays fixed. A whole-sprite mirror alone is therefore insufficient for future left/right poses with visible equipment.

### Detail refinement

[The source and in-between review](TURNTABLE_REVIEW.md) describes each reference and angle range before refinement. `scripts/turntable-details.ts` replaces the generated lower-body silhouette with independently layered legs, cyan seams, shoes and the hip Stunner. `source/ben-turntable-shoes.json` stores front, quarter, side, rear-quarter and rear patches. Shoe width changes gradually from six pixels at front/rear to ten at full quarter/profile. The ankle opening stays bound to the leg, with heel and toe landmarks tracked separately; the far foot is drawn first, raised slightly and shaded grey. The red upper no longer comes from a cuboid shoe volume. The source quarter anchors retain their detailed original feet.

`rig/ben-turntable/shoes.json` saves the directional shoe design with the rig exports. Tests enforce fixed crown/sole rows, front upper-body preservation, full quarter/profile sole length, separate heel detail and palette limits.

### Rear-head and shoe continuity

All turntable shoe templates have five rows, so changing direction does not change the shoe’s height. Their upper colours, ankle opening and sole remain distinct while the projected length foreshortens. The rear-head renderer reveals surface shading gradually, keeps one helmet-stripe cluster and registers both profiles and the rear around the same skull post. Brown-blond hair remains in the rear design; its eight-pixel patch is revealed by the visible rear surface instead of appearing as a complete texture swap. The [continuity review](TURNTABLE_REVIEW.md#shoe-and-rear-head-continuity) records the source of the earlier jumps and their corrections.

`source/ben-side-skin.json` defines `shoe.badge`, including its local point and yellow palette code. `shoeBadgePoint` in `scripts/rig-skin.ts` applies the shoe pitch and compression; the pixel renderer binds the badge to the nearest visible red upper pixel on the near shoe. The six running exports include the restored badge. Other saved action artwork is preserved; explicitly redrawing those rigs uses the shared skin’s badge rule.

## Volumetric model rig

The separate [3D model rig](BEN_3D.md) uses a shared Three.js skeleton with 24 joints and a portable GLB export. It adds actual rounded body depth, editable joints, continuous running and named demonstration poses. It does not regenerate or replace the pixel rig’s existing sprites.
