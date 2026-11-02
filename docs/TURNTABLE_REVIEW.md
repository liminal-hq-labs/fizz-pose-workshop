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
