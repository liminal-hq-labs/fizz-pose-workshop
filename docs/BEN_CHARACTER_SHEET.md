# Ben Blaze character sheet

This sheet is the agreed design for Ben as a three-dimensional cartoon character. It records what is settled, what is still being refined and what is undecided, so the model, its exports and any later artwork work from one description. The sprites remain the authored reference artwork; where a sprite and this sheet differ, the difference is listed under [Sprite shorthand](#sprite-shorthand).

Each item carries one of three states:

- **Locked** — decided. Change it only by editing this sheet first.
- **Refine** — the idea is decided and the execution is not yet good enough.
- **Open** — undecided.

## Who he is

Ben "Lieutenant Fizz" Blaze is a neighbourhood tinkerer who follows his older cousin Billy into space wearing a bicycle helmet, with a modified pogo stick under one arm and a Fizz Stunner on his hip. He is an ordinary kid who goes on adventures: skinny, quick, cheerful and determined. He reads as a cartoon, in clean flat colours with an ink line, and never as a toy with an oversized round head.

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
| Shoe length × width | 6.4 × 2.7 |

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
- **Nose** — Locked. A small round button.
- **Hair** — Locked. Close-cropped brown-blond, showing at the temples and nape below the helmet, with a small fringe escaping under the front rim.
- **Ears** — Locked. Small, at mid-depth, below the helmet rim.
- **Cheeks** — Refine. A hint of colour that gives the cheeks shape. The current pink ovals are too strong; they should be fainter and softer, or be replaced by a different way of shaping the cheek.
- **Expressions** — Refine. He needs a full range: smiling (the default), whistling, shouting, determined and worried at the least, each built from eyebrows, eyelids and mouth together. Blinking is part of every idle.

## Clothes

- **Shirt** — Locked. A plain red short-sleeved T-shirt. The white at his neck is the shirt's own collar band, part of the shirt, not a separate item.
- **Chest print** — Locked. The bubble trio: three yellow bubbles of different sizes with brown rims and a white glint each.
- **Jeans** — Locked. Slim blue denim jeans held by a dark belt with a yellow buckle.
- **Cloth detail** — Refine. Clothes carry a little construction detail so they read as cloth: a hem at the sleeves and waist of the shirt, and side seams, hems and pockets on the jeans. The detail also helps the sleeves sit on the shoulders as part of the shirt instead of as tubes beside the torso.
- **Jeans stripe** — Locked. The bright stripe down each leg is lighting in the sprite. Painted on, it turns the jeans into track trousers, so the model has no stripe; a highlight on the denim comes from the lighting alone.
- **Hands** — Refine. Bare, with a thumb and three fingers in the cartoon convention. No gloves. The finger and palm shapes need more care, and each finger needs its own joints so he can grip.
- **Runners** — Refine. Red running shoes with white rubber soles, a white rubber toe cap that wraps up over the front, white laces and a yellow badge on the outer side. The colour scheme is locked; the shoe shape is to be explored in a few variations.

## Gear

- **Bare-headed** — Refine. He can take the helmet off, for example in a bored idle while he waits, so his hair needs a complete design on top as well as at the edges. The current top is a first draft.
- **Helmet** — Locked. A close-fitting green bicycle helmet with a white stripe along the centre rib, dark vents either side, a grey rim and a rounded tail at the back. It crowns about one unit above the skull, so it reads as a helmet rather than a cap.
- **Chin strap** — Refine. Dark webbing with a grey buckle under the chin. It must visibly meet the helmet shell in front of and behind each ear; it currently hangs clear of it.
- **Fizz Stunner** — Refine. Worn on the right hip. Ben collects cans of fizz, cream soda in Episode 1 and grape in Episode 2, and the Stunner fires that carbonated fizz to stun enemies. A shot is a floating orb in the colour of the fizz. It is a cartoon science-fiction sidearm with real punch: rounded, detailed and clearly powered by pop, without having to look like a literal bottle. The concept is locked; three shapes are under comparison, a can loader, a bubble dome and a pop bottle.
- **Fizz colour** — Locked. Everything powered by fizz takes the episode's flavour: pink cream soda in Episode 1, grape in Episode 2.
- **Wrist computer** — Refine. A small computer strapped to his left wrist with a glowing screen, two buttons and a stub aerial. It exists on the model only; the sprites do not show it. Its shape is a first draft.
- **Where the pogo stick lives** — Refine. It appears when he needs it, as tools do in action games. On the model he pulls it from a back pocket, or from the backpack when he wears one; that transition is still to be animated.
- **Pogo stick** — Locked. A yellow shaft with a red band, a yellow T handlebar with black rubber grips and red bar ends, dark footpegs with yellow end caps and a coil spring over a chrome plunger on a rubber tip.
- **Backpack** — Locked as optional gear. The model can wear it or leave it off; Ben without it is the default. It carries a can of fizz in a side pocket.
- **Telephone** — Locked as a prop. A dark slab whose screen lights his face and hands in the seated idle.

## Movement

The eleven poses follow the workshop's newest sprite sets: stand, run, pogo, Fizz Stunner, jump, fall, ladder climb, ledge hang, whistle, seated phone and the dramatic death.

- **Run, climb, whistle, phone** — Locked in character. Light, bouncy and readable.
- **Jump** — Refine. The stride and reach are exaggerated in the sprite because a small sprite needs it. In three dimensions the jump should be subtler: a shorter stride and less arm reach.
- **Pogo grip** — Refine. Each hand wraps its own handlebar grip, fingers over the front and thumb behind. The hands must not meet in the middle or clasp each other.

## Sprite shorthand

The sprites compress detail into very few pixels. These features belong to that shorthand and are not copied literally into the model:

- **White skin.** The sprite uses the palette's white for skin. The model uses a natural skin tone.
- **Light-red shoulders and sleeves.** Light falling on a single red shirt, not a second colour of cloth.
- **The bright stripe on the jeans.** Light on denim.
- **The yellow cross on the chest.** The bubble trio at the size a sprite allows.
- **The Stunner's outline.** A stand-in for a design that cannot be drawn in a four by five pixel patch.
- **The black outline.** Ink, not physical thickness on the helmet or shoes.

## Open questions

1. **The Stunner's shape.** Which of the three designs, or which parts of each?
2. **Runner shape.** High-top, low runner or chunky?
3. **Cheeks.** A soft tint, a small crease line or nothing?
4. **The wrist computer.** What does it do in the story: a map, a link to Billy, a fizz gauge? Its job decides its screen and buttons.
5. **Drawing the pogo stick.** A quick cartoon pull from the back pocket, or a simple pop into his hands?
6. **The helmet idle.** When he is bored, does he take the helmet off, tip it back or spin it on a finger?
