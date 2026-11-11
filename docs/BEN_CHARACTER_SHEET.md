# Ben Blaze character sheet

This sheet is the agreed design for Ben as a three-dimensional cartoon character. It records what is settled, what is still being refined and what is undecided, so the model, its exports and any later artwork work from one description. The sprites remain the authored reference artwork; where a sprite and this sheet differ, the difference is listed under [Sprite shorthand](#sprite-shorthand).

The current build of this design is `prototypes/ben-g/tuning-bench.html`: one self-contained page, opened directly in a browser, that loads Three.js from a CDN. It holds the skinned body, the seventeen-bone rig, nineteen poses, hand posing and switches for the choices still being compared. It is a prototype in plain JavaScript.

`bun run model:build-g` exports it as `models/ben-g/ben-g.glb`, a rigged glTF binary in metres (Ben stands about 1.55 m tall): the seventeen-bone skeleton, the skinned torso, arms and legs, the rigid head, hands, runners and gear parented to their bones, and one animation clip per pose. `prototypes/ben-g/glb-viewer.html` plays the exported file. The export has these limits: props such as the pogo stick, ladder and loose can travel inside the file and are hidden by zero scale when a clip does not use them; the helmet stays on his head in the head-scratch and helmet-spin clips; each clip keeps one facial expression; the vents are painted, because cut vents need a texture; and the toon shading and ink outline belong to whatever displays the model, so a plain viewer shows smooth shading. The model's source is still the prototype page, not TypeScript in `src/model-3d/`.

Each item carries one of three states:

- **Locked** — decided. Change it only by editing this sheet first.
- **Refine** — the idea is decided and the execution is not yet good enough.
- **Open** — undecided.

## Who he is

Ben "Lieutenant Fizz" Blaze is a neighbourhood tinkerer who follows his older cousin Billy into space wearing a bicycle helmet, with a modified pogo stick under one arm and a Fizz Stunner on his hip. He is an ordinary kid who goes on adventures: skinny, quick, cheerful and determined. The games borrow the look of the 1990s, but Ben is a child of the 2020s: he messages his friends, looks things up and carries a telephone and a wrist computer. He reads as a cartoon, in clean flat colours with an ink line, and never as a toy with an oversized round head.

- **Ink line** — Locked as a look, with an adjustable weight. The black outline is drawn by the renderer around the silhouette, so its thickness is a setting and not part of the mesh. The default is thin enough to appear and vanish as he moves.

- **Age** — Locked. Ben is 10, in every document and description.
- **Handedness** — Locked. Right-handed: the Stunner rides on his right hip and fires from his right hand.

## Proportions

Locked. One unit is one sprite pixel of the 24 × 44 side view, with the floor at 0.

| Measurement | Units |
|---|---|
| Overall height, floor to helmet crown | 30.9 |
| Heads tall, chin to helmet crown | about 3.3 |
| Head scale against the workshop skull (radii 3.0 × 3.45 × 3.7) | 1.08 |
| Neck, collar to the base of the skull | 1.1 |
| Pelvis to waist / waist to chest / chest to neck | 3.0 / 3.0 / 3.9 |
| Shoulder joints from the centre | 3.5 |
| Hip joints from the centre | 1.5 |
| Torso width × depth | 5.4 × 4.0 |
| Upper arm / forearm / hand | 4.4 / 3.8 / 2.6 |
| Thigh / shin / ankle height | 4.5 / 4.25 / 2.1 |
| Shoe length × width | 5.75 × 2.5 |

The head is an egg, taller than it is wide and deeper than it is wide, on a short neck: the chin sits just above the collar. The body is one continuous surface. Shoulders, elbows, waist, hips and knees bend as a person's do, with no visible ball or bulge at a joint.

## Colours

Locked. These are the model's flat base colours; lighting produces the shades between them.

| Part | Colour |
|---|---|
| Skin | `#f6c7a2` |
| Hair and eyebrows | `#b98a45` (brown-blond) |
| Eyes | `#2d55d8` iris, white sclera, near-black pupil, white glint |
| Mouth | `#b3202c` |
| Helmet shell / vents | `#49d957` / `#1c8a38` |
| Helmet stripe / rim | `#ffffff` / `#b4b8c4` |
| Shirt | `#d93a32`, one red all over |
| Shirt collar | `#ffffff` |
| Jeans | `#2f45b8` |
| Belt / buckle | `#4a4a55` / `#ffff55` |
| Runners / toe cap and sole / underside | `#c62d2d` / `#ffffff` / `#aaaaaa` |
| Chest print | `#ffe34d` on `#8a4a12` |
| Fizz accent | `#ff55ff` and `#aa00aa` (grape) |

## Head and face

- **Eyes** — Locked. Large upright ovals: white, a blue iris, a dark pupil and one white glint, under short brown-blond eyebrows.
- **Gaze** — Refine. The irises move inside the eyes, so he looks at his wrist computer, his telephone, the ladder above him or an enemy instead of staring ahead. Each pose sets a direction; finer control is still to come.
- **Nose** — Locked. A small round button.
- **Hair** — Locked. Close-cropped brown-blond, showing at the temples and nape below the helmet, with a small fringe escaping under the front rim.
- **Ears** — Locked. Small, at mid-depth, below the helmet rim.
- **Cheeks** — Locked. No blush or cheek marks; the shape of the face carries the cheeks.
- **Expressions** — Refine. He needs a full range: smiling (the default), whistling, shouting, determined and worried at the least, each built from eyebrows, eyelids and mouth together. Blinking is part of every idle. The five are in place as first drafts.

## Clothes

- **Shirt** — Locked. A plain red short-sleeved T-shirt. The white at his neck is the shirt's own collar band, part of the shirt, not a separate item.
- **Chest print** — Locked. The bubble trio: three yellow bubbles of different sizes with brown rims and a white glint each.
- **Jeans** — Locked. Slim blue denim jeans held by a dark belt with a yellow buckle.
- **Cloth detail** — Refine. Clothes carry a little construction detail so they read as cloth: a hem at the sleeves and waist of the shirt, and side seams, hems and pockets on the jeans. The detail also helps the sleeves sit on the shoulders as part of the shirt instead of as tubes beside the torso.
- **Jeans detail** — Locked. The jeans keep two features that began as sprite lighting and work as design: a light stripe down the front of each leg and a darker seam down each outer side. Hems and back pockets complete them.
- **Hands** — Refine. Bare, with a thumb and three fingers in the cartoon convention. No gloves. A flat slab of a palm with jointed fingers and thumb; individual fingers can curl on their own, as when one finger carries the spinning helmet.
- **Runners** — Locked. Red high-top running shoes with white rubber soles, a white rubber toe cap that wraps up over the front, white laces and a yellow badge on the outer side. The collar covers the ankle so the jeans never show through it.

## Gear

- **Bare-headed** — Refine. He takes the helmet off in some idles and carries it by the chin strap, so his hair has a complete top and a scalloped hairline at the temples.
- **Helmet** — Locked. A close-fitting green bicycle helmet with a white stripe along the centre, a grey rim and a gentle teardrop tail. The shell has real thickness, with a darker liner inside. Its vents are cut through the shell with smooth edges, so his hair shows through them; painted vents remain as an alternative.
- **Chin strap** — Locked. Dark webbing hangs from the rim in front of and behind each ear, meets at a grey divider below the ear and runs under the chin to a buckle.
- **Fizz Stunner** — Refine. Worn on the right hip. Ben collects cans of fizz, cream soda in Episode 1 and grape in Episode 2, and the Stunner fires that carbonated fizz to stun enemies. A shot is a floating orb in the colour of the fizz. It is a cartoon science-fiction sidearm with real punch: rounded, detailed and clearly powered by pop. The chosen design is the can loader: a round drum with a flared nozzle, and a can of fizz that loads into the back. The pop bottle design is the runner-up and may return as a second weapon or a prop.
- **Fizz colour** — Locked. Everything powered by fizz takes the episode's flavour: pink cream soda in Episode 1, grape in Episode 2.
- **Wrist computer** — Refine. A small computer strapped to his left wrist with a glowing screen and two buttons. It shows his map, sends and receives messages and answers quick questions through his own AI helper, as an extension of his telephone. It has no aerial in normal use; a pull-out aerial may appear in a pose where he plays with it. It exists on the model only so far.
- **Where the pogo stick lives** — Locked. It appears when he needs it, as tools do in action games. On the model he pulls it from a back pocket, or from the backpack when he wears one, and it grows to full size as it swings round to be planted in front of him.
- **Pogo stick** — Locked. A yellow shaft with a red band, a yellow T handlebar with black rubber grips and red bar ends, dark footpegs with yellow end caps and a coil spring over a chrome plunger on a rubber tip.
- **Backpack** — Locked as optional gear. The model can wear it or leave it off; Ben without it is the default. Its straps loop over the shoulders and under the arms, it carries a can of fizz in a side pocket and the pogo stick rides in it.
- **Telephone** — Locked as a prop. A dark slab whose screen lights his face and hands in the seated idle.

## Movement

The first eleven poses follow the workshop's newest sprite sets: stand, run, pogo, Fizz Stunner, jump, fall, ladder climb, ledge pull, whistle, seated phone and the dramatic death. Motion on the model is bigger than the sprites allow, and the hips and shoulders counter-rotate so he never moves as a stiff block.

- **Run** — Refine. Heel strike, roll, toe-off and a flight phase, with the hips and shoulders twisting against each other. Foot contact still needs polish.
- **Pogo** — Refine. Each hand wraps its own handlebar grip. The spine and chest give a little with the spring; the lean stays small.
- **Jump** — Locked. A crouch, a take-off, a modest stride in the air and a landing that absorbs into the knees. Subtler than the sprite.
- **Fizz Stunner** — Refine. A fizz orb leaves the muzzle on the trigger pull and flies straight and level. The recoil travels through the body: the arm kicks up and back, the shoulders turn, the weight rocks onto the back foot and the front toe lifts.
- **Reload** — Refine. He slides the spent can out of the back of the Stunner, drops it, takes a fresh can from behind his hip, pushes it home and fires a test shot.
- **Climb** — Refine. The ladder stands clear of his face, the hands hook over the rungs from below, the hips and shoulders sway and the knees turn out.
- **Ledge pull** — Refine. He hangs clear of the wall, pulls up, leans over the edge, brings one foot up and stands.
- **Dramatic death** — Refine. Belly clutch, a hop onto his back with both soles to the camera, a dizzy wobble and a final topple flat.
- **Bored idles** — Refine. Besides the telephone and whistling: checking the wrist computer, pulling out its aerial, tipping the helmet to a nearby enemy, taking the helmet off to scratch his head, spinning the helmet on a finger and rocking on his heels.

## Sprites of the model's poses

Four of the new idles are drawn by the lab's own side-view sprite rig, as `source/ben-wrist-check-rig.json`, `ben-wrist-aerial-rig.json`, `ben-helmet-tip-rig.json` and `ben-rock-rig.json` in the rig catalogue: the hand-drawn head, shirt, arms, legs and shoes posed by keys, redrawn with `bun run draw:performances`. The rig's arms are shorter than the helmet is tall, so the helmet tip is a hand to the side of the rim with a small bow. The wrist computer is a two-pixel prop on the far forearm, a dark case under a lit screen, with an aerial of up to three pixels and a red tip. The lower shirt front is trimmed by one column in these frames as saved editor overrides.

The head scratch, helmet spin, pogo draw and Stunner reload still come from `bun run draw:model-poses`, which renders the model through the sprite converter with a proportion map and the hand-drawn standing head. They wait on art the skin does not have: a bare head, a helmet held in the hand, a hand-held pogo stick and a loose fizz can.

## Sprite shorthand

The sprites compress detail into very few pixels. These features belong to that shorthand and are not copied literally into the model:

- **White skin.** The sprite uses the palette's white for skin. The model uses a natural skin tone.
- **Light-red shoulders and sleeves.** Light falling on a single red shirt, not a second colour of cloth. The jeans' stripe and side seam began the same way and are kept as design.
- **The yellow cross on the chest.** The bubble trio at the size a sprite allows.
- **The Stunner's outline.** A stand-in for a design that cannot be drawn in a four by five pixel patch.
- **The black outline.** Ink, not physical thickness on the helmet or shoes.

## Open questions

1. **The pop bottle.** Does the runner-up Stunner design have a place: a second weapon, a power-up or a prop?
2. **Art for the remaining poses.** Who draws the bare head, the held helmet, the hand-held pogo stick and the loose can that the last four poses need: by hand in the pixel editor, or as drafts to correct?
