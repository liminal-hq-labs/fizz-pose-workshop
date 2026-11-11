# Ben Blaze character sheet

This sheet is the agreed design for Ben as a three-dimensional cartoon character. It records what is settled, what is still being refined and what is undecided, so the model, its exports and any later artwork work from one description. The sprites remain the authored reference artwork; where a sprite and this sheet differ, the difference is listed under [Sprite shorthand](#sprite-shorthand).

The current build of this design is `prototypes/ben-g/tuning-bench.html`: one self-contained page, opened directly in a browser, that loads Three.js from a CDN. It holds the skinned body, the seventeen-bone rig, fifteen poses, hand posing and switches for the choices still being compared. It is a prototype in plain JavaScript; the design is to be ported into `src/model-3d/` so it shares the workshop's rig, pose library, GLB export and review tools.

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
- **Hands** — Refine. Bare, with a thumb and three fingers in the cartoon convention. No gloves. They have a flat palm, knuckles and jointed fingers and thumb; they still need to read less like a mitten, especially around the Stunner's grip.
- **Runners** — Locked. Red high-top running shoes with white rubber soles, a white rubber toe cap that wraps up over the front, white laces and a yellow badge on the outer side. The collar covers the ankle so the jeans never show through it.

## Gear

- **Bare-headed** — Refine. He takes the helmet off in some idles, holding it by the straps, so his hair has a complete top. The hairline at the temples is still a hard edge.
- **Helmet** — Refine. A close-fitting green bicycle helmet with a white stripe along the centre, a grey rim and a gentle teardrop tail. The shell has real thickness, with a darker liner inside. Its vents are cut through the shell like a real helmet's, with painted vents kept as an alternative; the cut edges are still coarse.
- **Chin strap** — Locked. Dark webbing hangs from the rim in front of and behind each ear, meets at a grey divider below the ear and runs under the chin to a buckle.
- **Fizz Stunner** — Refine. Worn on the right hip. Ben collects cans of fizz, cream soda in Episode 1 and grape in Episode 2, and the Stunner fires that carbonated fizz to stun enemies. A shot is a floating orb in the colour of the fizz. It is a cartoon science-fiction sidearm with real punch: rounded, detailed and clearly powered by pop. The chosen design is the can loader: a round drum with a flared nozzle, and a can of fizz that loads into the back. The pop bottle design is the runner-up and may return as a second weapon or a prop.
- **Fizz colour** — Locked. Everything powered by fizz takes the episode's flavour: pink cream soda in Episode 1, grape in Episode 2.
- **Wrist computer** — Refine. A small computer strapped to his left wrist with a glowing screen and two buttons. It shows his map, sends and receives messages and answers quick questions through his own AI helper, as an extension of his telephone. It has no aerial in normal use; a pull-out aerial may appear in a pose where he plays with it. It exists on the model only so far.
- **Where the pogo stick lives** — Refine. It appears when he needs it, as tools do in action games. On the model he pulls it from a back pocket, or from the backpack when he wears one. Both draws are still to be animated.
- **Pogo stick** — Locked. A yellow shaft with a red band, a yellow T handlebar with black rubber grips and red bar ends, dark footpegs with yellow end caps and a coil spring over a chrome plunger on a rubber tip.
- **Backpack** — Locked as optional gear. The model can wear it or leave it off; Ben without it is the default. Its straps loop over the shoulders and under the arms, it carries a can of fizz in a side pocket and the pogo stick rides in it.
- **Telephone** — Locked as a prop. A dark slab whose screen lights his face and hands in the seated idle.

## Movement

The first eleven poses follow the workshop's newest sprite sets: stand, run, pogo, Fizz Stunner, jump, fall, ladder climb, ledge hang, whistle, seated phone and the dramatic death. Motion on the model is bigger and more dramatic than the sprites allow, and the hips and shoulders counter-rotate so he never moves as a stiff block.

- **Run** — Refine. Heel strike, roll, toe-off and a flight phase, with the hips and shoulders twisting against each other. Foot contact still needs polish.
- **Pogo** — Refine. Each hand wraps its own handlebar grip, fingers over the front. The spine and chest squash and stretch with the spring; he should read as springy rather than rigid.
- **Jump** — Locked. Subtler than the sprite: a shorter stride and less arm reach.
- **Climb** — Refine. The hips and shoulders sway from side to side, the knees turn out past the ladder and the hands stay clear of the face.
- **Dramatic death** — Refine. The model holds one beat of it; the sprite sequence's belly clutch, changing faces and final topple are still to be added.
- **Bored idles** — Refine. Besides the telephone and whistling: checking the wrist computer, tipping the helmet to a nearby enemy, taking the helmet off to scratch his head and rocking on his heels. These four exist as first drafts. Spinning the helmet on a finger and playing with the wrist computer's aerial are still to come.
- **Drawing the pogo stick** — Open. See [Open questions](#open-questions).

## Sprites from the model

Poses that exist only on the model have no sprite yet. The workshop already renders the earlier 3D Ben into reference grids on the sprite canvas, in the 16 game colours with a black outline, for tracing in the pixel editor. The same route can produce first-draft sprites of the new poses from this model, in the lab's frame format, to be cleaned by hand.

## Sprite shorthand

The sprites compress detail into very few pixels. These features belong to that shorthand and are not copied literally into the model:

- **White skin.** The sprite uses the palette's white for skin. The model uses a natural skin tone.
- **Light-red shoulders and sleeves.** Light falling on a single red shirt, not a second colour of cloth. The jeans' stripe and side seam began the same way and are kept as design.
- **The yellow cross on the chest.** The bubble trio at the size a sprite allows.
- **The Stunner's outline.** A stand-in for a design that cannot be drawn in a four by five pixel patch.
- **The black outline.** Ink, not physical thickness on the helmet or shoes.

## Open questions

1. **Drawing the pogo stick.** A quick cartoon pull from the back pocket or backpack, or a simple pop into his hands?
2. **The pop bottle.** Does the runner-up Stunner design have a place: a second weapon, a power-up or a prop?
3. **Sprites of the new poses.** Should the new idles get sprite versions straight away, or once the model's poses are polished?
