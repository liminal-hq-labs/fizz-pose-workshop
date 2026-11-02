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

`draw:run` replaces the six running grids in `source/poses.json` and `edits.json` from the rig and saves `rig/ben-running/`. `generate` rebuilds the normal sprite files and gallery with saved editor overrides applied. Ordinary generation does not redraw the rig, so manual pixel edits remain intact until the explicit `draw:run` command is run.

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
- `stride.stanceFraction` must be less than half a cycle, leaving two flight windows. `frontX` and `backX` control reach. `lift` shapes heel recovery. `toeOffDegrees` raises the heel around the supporting ball of the foot; `recoveryToeDegrees` lifts the toe in flight.

During stance the ball of the foot remains on the ground and moves backwards at a constant speed relative to the in-place body. Adding the corresponding virtual forward travel keeps that support point fixed in world space. A quintic Bézier recovery path preserves the endpoint velocity while folding and advancing the foot. The far leg uses the same path half a cycle later. Bone lengths constrain both arms and legs continuously, including between the six sampled frames.

## Skin binding

Head patches attach to a shared snapped neck anchor. Eye and mouth positions come from `face.eye` and `face.mouth` in the rig, rather than alternate bitmap rows. Their three coordinates are head-local x, y and depth; `face.yawDegrees` controls the small camera-facing rotation. Projection is continuous, but local coordinates are rounded before adding the common pixel anchor so the dots cannot drift independently of the helmet. Cheek variants keep the slight turn readable without shifting the facial dots. Shirt patches attach to the pelvis and rotate with the torso; their towards/away variants suggest chest rotation. Sleeves cover the upper half of the arm’s first bone, and the exposed arm continues through the elbow to the hand. Shoes have separate heel and forefoot segments. Landing raises the toe and briefly compresses the upper, then the front settles flat. At push-off the heel rises around the grounded ball while the toe stays planted; the hinge relaxes in recovery and lifts again before contact. The Stunner attaches beside the near hip and rotates with the upper thigh.

Each patch contains rows with `x`, `y` and `pixels`, plus an `anchor`. The head and torso accept optional `towards` and `away` rows. The shoe has near/far rows, a ball pivot and `flexX` hinge. All colour codes come from `source/game-palette.json`, preserving the game’s sixteen opaque colours and transparent `.`.

## Verification

The tests sample 241 times across a cycle, measuring bone lengths, elbow bend orientation and leg reach. They check forefoot ground locking, landing compression, toe-off bending, flight clearance, loop continuity, six-phase contact order, palette constraints and the rendered soles. Export tests exercise a different canvas, proportions and sample count. Browser checks cover continuous playback, six-pose stepping, the overlay, mobile layout and the frame-for-frame SVG/GIF/PNG output.

## Facial landmark inspection

The rig viewer includes six head-aligned crops and a coordinate table. Each row lists the snapped head anchor, actual eye and mouth pixels, the expected ear pixel and whether its colour matches, and their offsets within the head. The base offsets are eye (+2, −5), mouth (+2, −3) and ear (−1, −4); a shared horizontal shift moves all three together. Continuous projected coordinates are shown above the table, and the landmark overlay is available on the rig and sprite. A row marked **Draft differs** identifies manual browser edits that no longer match the generated rig.

`rig/ben-running/face-sequence.json` saves both rig-derived and measured pixel coordinates; `face-sequence.svg` saves the head-aligned sequence. The exporter also includes full facial landmarks in `samples.json`. Tests cover a subpixel rounding-boundary case, 241 continuous poses, all six rendered eye/mouth pixels and the loop seam.

The eye, mouth and ear share a sinusoidal horizontal shift in head space. At the six running samples the shift is `0, +1, +1, 0, -1, -1` pixels: right, then back left. Their spacing stays constant; the rounded head anchor supplies body movement separately. `face.shiftAmplitude` controls the motion, and `face.ear` supplies the ear's local position. The face inspector and saved measurements include all three landmarks.

## Pogo and Fizz Stunner rigs

`src/rig/sample.ts` selects the continuous sampler using `motion`: omitted or `run` for running, `pogo` for spring motion and `fire` for the Fizz Stunner. `src/rig/actions.ts` solves action arms and legs with fixed bone lengths and explicit grip/ankle targets. The elbow pole keeps elbows beneath the aimed hands. All motions use the shared skin and facial landmark projection.

`source/ben-pogo-rig.json` sets spring compression and extension, shaft length, peg height and flight lift. Ground contact occupies phases `0–0.18` and `0.82–1`; the spring extends before flight and compresses after landing. The tip rises six pixels during flight. The pelvis follows the pegs, the shoe soles sit on the pegs and the hands follow the handle. The 24 × 52 canvas includes clearance for the helmet and stick. The six 150 ms samples are compression, launch, rise, apex, fall and landing.

`source/ben-fire-rig.json` sets recoil distance and muzzle kick. Feet stay fixed while the pelvis and torso react to recoil; both hands follow the gun. The held purple Stunner replaces its holstered patch. The 32 × 44 canvas allows room for the muzzle and flash. The six 100 ms samples are aim, discharge, recoil, recovery, settle and ready; the discharge sample includes a small palette-coloured flash. The firing gaze stays aimed, with `face.shiftAmplitude` set to zero.

Run `bun run draw:actions` then `bun run generate` to update the twelve editable action frames and their active gallery loops. This overwrites the corresponding editor overrides. `rig/ben-pogo/` and `rig/ben-firing/` contain the configuration, shared skin, joint samples, continuous SVG, six static skeleton SVGs, six PNG/SVG sprites, GIF and facial sequence measurements. The generic exporter accepts either action rig, for example `bun run rig:export source/ben-pogo-rig.json source/ben-side-skin.json rig/ben-pogo`.

The viewer's **Action** selector switches between all three rigs. Continuous motion, six samples, speed, scrubbing, stepping, overlays, facial inspection and download links follow the selected action. The sprite sheet uses the maximum frame dimensions for its cells and records each frame's native rectangle in `assets.json`.
