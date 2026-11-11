# Ben Blaze · cartoon model

Two glTF binaries of the same rigged character, built by `bun run model:build-g` from the model in `src/model-3d/ben-g/`. Both are in metres (Ben stands about 1.55 m tall, facing +Z, with his feet on Y = 0) and carry a seventeen-bone skeleton and nineteen animation clips at 24 frames a second. `ben-g.json` lists the bones and clips.

| File | Use it when | What is inside |
|---|---|---|
| `ben-g-toon.glb` | The model should look like the cartoon wherever it is opened: a web page, Blender, Godot, Unity, Unreal, a glTF viewer. | Unlit surfaces whose colours carry a baked two-tone shadow, plus a black ink shell around each outlined part. It needs no lights and no custom shader. |
| `ben-g.glb` | The engine applies its own cartoon shader and outline. | Lit materials with base colours only, and no ink shells. Parts that take an outline are marked `outline: true` in their node extras. |

## How the baked cartoon works

- **Ink outline.** Each outlined part has a second, slightly larger copy in black with its triangles turned inside out. With back-face culling on, which is the glTF default, only the far side of that copy is drawn, and it shows as a line round the part. If the model turns solid black, back-face culling is off: enable it on the `Ink` material.
- **Shading.** The shadow tone is painted into the vertex colours from one light above and in front of Ben in his standing pose. It moves with each part rather than with the scene's lights.
- **Materials.** `Toon` (every opaque surface), `ToonGlass` (the fizz orbs) and `Ink`. All three are unlit (`KHR_materials_unlit`).

## Clips

`Stand`, `Run`, `Pogo`, `Fire`, `Jump`, `Fall`, `Climb`, `LedgePull`, `Whistle`, `Phone`, `Wipeout`, `WristCheck`, `HelmetTip`, `HeadScratch`, `Rock`, `HelmetSpin`, `WristAerial`, `PogoDraw` and `Reload`. All but `LedgePull`, `Wipeout`, `PogoDraw` and `Reload` loop cleanly.

Props (the pogo stick, ladder, ledge, telephone, loose can, musical notes and fizz orbs) are part of the file. A clip hides the ones it does not use by keying their scale to zero, because glTF cannot animate visibility. Play a clip, or hide those nodes, before showing the model; the rest pose is `Stand`.

## Opening it

- **Web, with three.js.** Load either file with `GLTFLoader` and play clips with `AnimationMixer`. `prototypes/ben-g/glb-viewer.html` is a complete example that adds live toon shading and a screen-space outline to `ben-g.glb`; pass `?file=../../models/ben-g/ben-g-toon.glb` to see the baked file instead.
- **Web, without code.** `<model-viewer src="ben-g-toon.glb" animation-name="Run" autoplay camera-controls>` shows the baked cartoon.
- **Blender.** File → Import → glTF 2.0. Use `ben-g-toon.glb` and view it in Material Preview or Rendered mode; the importer turns on back-face culling for the ink. Each clip arrives as an action.
- **Godot, Unity, Unreal.** Import `ben-g-toon.glb` as a glTF scene. Keep back-face culling on for the `Ink` material and leave the materials unlit.

`renders/` holds stills from the viewer, saved by `bun run model:render-g`.
