# Ben’s volumetric character model

The “Ben in three dimensions” section contains a fully rounded Three.js character. His helmet, skull, ears, nose, torso, arms, jeans, shoes and Fizz Stunner have depth from every direction. The mesh uses one world unit per calibrated sprite pixel, with a standing ground plane at −0.5 and crown at 32.5. These are model units, not physical measurements.

## Preview and rig

Run `bun run dev`, then choose **Rigged 3D** in the gallery navigation. Rotation runs independently of the sprite animations. Drag in Studio view to orbit, scroll to zoom, or use the angle slider. Choose Sprite orthographic view for a level comparison. Select a calibrated reference and press **Match reference view** to restore the standing pose at the reference angle; **Overlay reference** superimposes the original pixels.

The rig has 21 named bones: pelvis, spine, chest, neck, head, two upper arms, forearms and hands, two thighs, shins, feet and toe joints, plus Stunner and phone attachments. Torso weights blend across the spine and chest, while each sole blends into a toe joint for shoe flex. Face details, ears, helmet and hair follow the head bone. The Stunner remains on Ben’s anatomical right hip when standing and moves into his hands for the firing pose. The phone’s back faces the viewer and its screen faces Ben; dynamic screen lighting on his face remains a future lighting effect.

The pose selector provides standing, continuous running, jumping, climbing, firing, whistling, phone, looking up and belly-clutch poses. Running and whistling animate continuously; the other entries are held rig poses. These demonstrate the reusable model rig rather than replacing the existing six-frame sprite animations. Phone, firing and belly-clutch hands use two-bone inverse kinematics.

Open **Pose the rig and move Ben** to rotate individual joints or translate the whole character. Joint edits pause pose animation. **Save pose JSON** downloads the root position and orientation, plus every bone’s local position, quaternion and scale. This download does not overwrite sprite edits or the authored rig.

## Source and exports

- `source/ben-3d.json`: rest joints, calibrated dimensions and six sprite references.
- `source/ben-3d-skins.svg`: named surface artwork for the helmet stripe, chest emblem, shoe badge and phone mark.
- `src/model-3d/model.ts`: volumetric geometry, materials and skin bindings.
- `src/model-3d/rig.ts`: skeleton hierarchy and shared vertex skin weights.
- `src/model-3d/poses.ts`: skeletal poses, inverse kinematics and animation sampling.
- `src/model-3d/svg-skin.ts`: SVG parsing, tessellation, curved-surface projection and winding correction.
- `src/model-3d/preview.ts`: interactive Three.js preview and orthographic review renderer.
- `models/ben-3d/ben.glb`: portable skinned model containing eight named animation clips. Run and Whistle contain motion; the remaining clips hold their named poses. The phone attachment is hidden by scale outside the phone pose.
- `models/ben-3d/rig.json` and `skins.svg`: exported configuration and surface artwork.

Run `bun run model:build` to regenerate the GLB, rig description and skin artwork. Run `bun run generate` after preview changes to refresh the standalone HTML. `bun run build` packages the model and documentation with the app. The standalone HTML embeds the procedural model and Three.js; downloadable companion files require the surrounding project folder.

## Proportion review

Run a development server, then `bun run model:review`. Set `MODEL_REVIEW_URL` to review another served build. The command uses Playwright and system Chromium at `/usr/bin/chromium`; set `CHROMIUM_PATH` for another installation. Software WebGL is enabled for reproducible headless rendering. Run `bun run model:build` separately to refresh the downloadable GLB after a source change.

The review renders front, right quarter, right profile, rear, left profile and left quarter views with a fixed 32 × 44 orthographic projection. It compares occupied height, helmet width, visible head-band width, torso-band width, combined shoe width and shoe height against the saved calibrated reference sprites, using a two-pixel tolerance. The source helmet occupies rows 2–8, the head comparison uses rows 9–13, the torso and arms use rows 15–23, and shoes occupy rows 30–34. Bounds count rendered pixels at alpha ≥ 128. The report exits unsuccessfully for a dimension outside tolerance, browser exceptions or horizontal mobile overflow.

`models/ben-3d/review/reference-comparison.png` places the six model renders above the source sprites in angle order 0°, 45°, 90°, 180°, 270°, 315°. `poses.png` shows Standing, Run, Jump, Climb, Firing, Whistle, Phone, Look up and Belly clutch, read left to right and top to bottom. Pose framing allows extra headroom for jumping. `metrics.json` records the measurements and browser checks.

The saved reference review measures 33 pixels of standing height and five pixels of shoe height at all six headings. Helmet width differs by at most one pixel; visible head-band width, torso-band width and combined shoe width differ by at most two pixels. The calibration corrects the facial surface placement, increases torso depth, removes a resting foot stagger and extends the shoe toes while retaining a common ground plane.

This is a proportional interpretation of pixel references. It preserves a single body and shoe volume through rotation, while the source sprites contain hand-drawn outlines, different arm positions, staggered feet and angle-specific exaggeration. A matching bounding box does not establish an identical silhouette or a finished likeness. Visual review remains necessary for facial expression, surface treatment, joint deformation and unseen rear surfaces. The existing 137 sprite frames remain unchanged by model building and review.

## SVG surface artwork and Jar

[Jar’s model helpers](https://github.com/liminal-hq/jar/tree/527c5c34f62a8467e133249615a19fe7ca45040e/apps/jar/src/render/models) use named SVG paths, bevelled extrusions, decals, pivots and vertex deformation for fish and snails. The useful ideas here are named artwork layers, explicit authored coordinates and details that follow their owner’s movement. Ben’s rounded body is built independently from volumetric primitives and curved meshes; SVG layers decorate those surfaces. No Jar implementation or SVG asset was copied.

The helmet stripe is tessellated before mapping onto the rounded cap. Triangle winding is corrected after projecting SVG’s downward Y axis into model space. Shoe badges project onto the outer ankle panels and follow the foot bones; the chest emblem follows the chest. Base material colours come from the game palette, while studio lighting produces shaded colours between those palette entries.

Three.js references: [OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html), [GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html) and [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).
