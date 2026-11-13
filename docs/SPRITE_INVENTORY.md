# Ben sprite inventory

Every pose and animation position ("slot") that Ben has, or could have, across Lieutenant Fizz 1, Fizz 2 and this lab, with the old game sprite and the new lab sprite side by side. The data is `source/sprite-inventory.json`; `src/sprite-inventory.test.ts` checks that it is well formed and that every frame it names exists. This page is the readable summary.

## Method

- Read each game's code for the place that chooses Ben's sprite and for the state that drives it: Fizz 1's `ben_sprite` and `Player` in `episodes/episode-1/game/src/`, and Fizz 2's `ben_pose` in `crates/fizz-slice-view/src/lib.rs` with `Ben` in `crates/fizz-ep2/src/ben.rs`. Their design documents (`docs/GAME_DESIGN.md`, Fizz 2's `docs/SPRITES.md`, `docs/PLATFORM.md` and `docs/FIZZ1-DIFFERENCES.md`) say what each game leaves out on purpose.
- Read this lab's `assets.json` (frames and animations), `docs/RIG.md`, `docs/BEN_CHARACTER_SHEET.md` and `git diff main` to see which frames are new in the open pull request stack.
- Give each game one state per slot. **used** means code or data actually plays the slot, and the evidence cites a file and symbol. **could-use** means the game's mechanics or design documents imply the slot but no sprite is wired, or the game borrows another pose for it. **unused** means the lab or an old sheet has art that the game never plays. **n/a** means the game deliberately lacks the mechanic.
- Give each slot a `facing` (`right`, `left`, `front`, `back` or `none`) and, for side views, a `pair` naming the opposite facing. `stunnerSide` and `mirrorForbidden` record where the Fizz Stunner sits and that the slot's frames must never be mirrored. See [Facings](#facings).
- Give each slot one lab status. **in-game**: lab art already wired into a game. **ready-in-lab**: finished lab art on `main` that no game plays yet. **new-in-pr**: art that exists only in the open pull request stack. **partial**: some directions or frames only, or a legacy study that needs checking. **missing**: a slot a game uses or could use with no lab art. **needs-pixel-art**: only rendered from the 3D model, awaiting hand-drawn pixel art.
- `old` names the sprite the games actually play (Fizz 1's `ben_*`, which Fizz 2 also draws), or, where Fizz 1 has none, Fizz 2's provisional `benA_*`. Where both exist the other is in the slot's `note`. `dos` is the 4-bit cost of the new frames: the ceiling of width × height ÷ 2 bytes per frame, before trimming transparent borders.

## Sources

| Id | Repository | Ref |
|---|---|---|
| `fizz1` | `lieutenant-fizz` | `chore/google-play-deploy@9729c07` (`main` is `94f354d`) |
| `fizz2` | `fizz-2` | `trial/lab-ben-sprites@7b948ae` (`main` is `4ae26c6`) |
| `lab` | this repository | `feat/sprite-inventory@f1baabe`, the tip of the stack `docs/ben-character-sheet` (#1) → `feat/ben-g-typescript` (#2) → `docs/ben-evolution` (#3) on `main@a43b322` |

Fizz 2's lab Ben exists only on its unmerged `trial/lab-ben-sprites` branch, which its commit message calls "a trial, not for merge": it widens Ben's body to 0.8 × 2.0 tiles, so the state hash and golden replay fail until the sprites are imported for good. On Fizz 2's `main` the slice plays Fizz 1's Ben, and `ep2-ben-a.json` is data no code reads. Slots marked **in-game** are therefore in a trial build only. The snapshots the old frame names refer to are in `source/game-sprites/` (see its README).

Every new frame in the stack arrived with PR #1; PR #2 only tunes `ben_headScratch2` and `ben_helmetSpin2`. In the tables, each new entry gives its frame size and the 4-bit DOS cost of the frames listed.

## Slots

Totals: 67 slots — 28 ready-in-lab, 18 missing, 7 in-game, 5 needs-pixel-art, 5 new-in-pr and 4 partial. For Fizz 1, 22 used, 4 unused, 34 could-use, 7 n/a; for Fizz 2, 17 used, 22 unused, 13 could-use, 15 n/a. The new art totals 184,848 bytes at 4 bits, counting each frame once even where two slots show it (the twelve-frame run contains the six-frame run, a landing beat is a frame of its jump, and the door pass reuses the six-frame run), of which 16,896 is the 24-angle turn-around.

Every slot also has a `facing` (see [Facings](#facings)); the `Facing` column repeats it.

### Standing and facing

| Slot | Facing | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|---|
| `stand-right` | right | used | used | `ben_stand` | `ben_standRight` (24x44, 528 B) | in-game |
| `stand-left` | left | used | used | `ben_stand` | `ben_stand` (24x44, 528 B) | in-game |
| `stand-front` | front | unused | unused | — | `ben_standFront` (24x44, 528 B) | ready-in-lab |
| `turn-360` | none | unused | unused | — | `ben_turn000` to `ben_turn345` (24) (32x44, 16896 B) | needs-pixel-art |

### Run and walk

| Slot | Facing | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|---|
| `run-right` | right | used | used | `ben_run1`, `ben_run2` | `ben_walkRight1` to `ben_walkRight11` (6) (24x44, 3168 B) | in-game |
| `run-left` | left | used | used | `ben_run1`, `ben_run2` | `ben_walkLeft1` to `ben_walkLeft11` (6) (24x44, 3168 B) | in-game |
| `run12-right` | right | could-use | could-use | `ben_run1`, `ben_run2` | `ben_walkRight1` to `ben_walkRight12` (12) (24x44, 6336 B) | ready-in-lab |
| `run12-left` | left | could-use | could-use | `ben_run1`, `ben_run2` | `ben_walkLeft1` to `ben_walkLeft12` (12) (24x44, 6336 B) | ready-in-lab |

### Jump, fall and land

| Slot | Facing | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|---|
| `jump-right` | right | used | used | `ben_jump` | `ben_jumpRig1` to `ben_jumpRig6` (6) (32x52, 4992 B) | ready-in-lab |
| `jump-left` | left | used | used | `ben_jump` | `ben_jumpLeft1` to `ben_jumpLeft6` (6) (32x52, 4992 B) | ready-in-lab |
| `fall-right` | right | could-use | could-use | `benA_fall` | `ben_fallRig1` to `ben_fallRig6` (6) (32x52, 4992 B) | ready-in-lab |
| `fall-left` | left | could-use | could-use | `benA_fall` | `ben_fallLeft1` to `ben_fallLeft6` (6) (32x52, 4992 B) | ready-in-lab |
| `land-right` | right | could-use | could-use | — | `ben_jumpRig5` (32x52, 832 B) | partial |
| `land-left` | left | could-use | could-use | — | `ben_jumpLeft5` (32x52, 832 B) | partial |
| `crouch-right` | right | n/a | n/a | — | — | missing |
| `crouch-left` | left | n/a | n/a | — | — | missing |

### Ladders, vines and ledges

| Slot | Facing | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|---|
| `ladder-climb` | back | used | n/a | `ben_climb1`, `ben_climb2` | `ben_ladder1` to `ben_ladder8` (8) (32x48, 6144 B) | ready-in-lab |
| `mantle-right` | right | used | n/a | `ben_mantle1`, `ben_mantle2`, `ben_mantle3` | `ben_ledge1` to `ben_ledge11` (11) (40x72, 15840 B) | ready-in-lab |
| `mantle-left` | left | used | n/a | `ben_mantle1`, `ben_mantle2`, `ben_mantle3` | `ben_ledgeLeft1` to `ben_ledgeLeft11` (11) (40x72, 15840 B) | ready-in-lab |
| `wall-kick-right` | right | could-use | n/a | — | — | missing |
| `wall-kick-left` | left | could-use | n/a | — | — | missing |

### Pogo stick

| Slot | Facing | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|---|
| `pogo-right` | right | used | used | `ben_pogo`, `ben_pogo2` | `ben_pogoRight1` to `ben_pogoRight12` (12) (24x44, 6336 B) | ready-in-lab |
| `pogo-left` | left | used | used | `ben_pogo`, `ben_pogo2` | `ben_pogoLeft1` to `ben_pogoLeft12` (12) (24x44, 6336 B) | ready-in-lab |

### Doors and exits

| Slot | Facing | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|---|
| `door-walk-in` | back | n/a | could-use | — | `ben_doorIn1` to `ben_doorIn8` (8) (24x44, 4224 B) | new-in-pr |
| `door-through-right` | right | n/a | could-use | — | `ben_walkRight1` to `ben_walkRight11` (6) (24x44, 3168 B) | ready-in-lab |
| `door-through-left` | left | n/a | could-use | — | `ben_walkLeft1` to `ben_walkLeft11` (6) (24x44, 3168 B) | ready-in-lab |

The walk-in is new art from the walking-through-doors performance (see [Walking through doors](RIG.md#walking-through-doors)). The two side-on slots point at the existing six-frame run, because a keyed door is passable at once and drawn behind Ben, so no dedicated pose is needed. Their frames are the run's, counted once under `run-right` and `run-left`. Fizz 1 is recorded n/a without having been checked for an exit or keyed doors.

### Fizz Stunner

| Slot | Facing | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|---|
| `shoot-right` | right | used | used | `ben_shoot` | `ben_fireRight1` to `ben_fireRight6` (6) (32x44, 4224 B) | in-game |
| `shoot-left` | left | used | used | `ben_shoot` | — | missing |
| `shoot-recoil-right` | right | unused | unused | — | `ben_shootRecoil` (24x44, 528 B) | ready-in-lab |
| `shoot-recoil-left` | left | unused | unused | — | — | missing |
| `aim-up-right` | right | used | used | `ben_aimUp` | `ben_aimUp` (24x44, 528 B) | partial |
| `aim-up-left` | left | used | used | `ben_aimUp` | — | missing |
| `aim-down-right` | right | used | used | `ben_aimDown` | `ben_aimDown` (24x44, 528 B) | partial |
| `aim-down-left` | left | used | used | `ben_aimDown` | — | missing |

### Hurt and death

| Slot | Facing | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|---|
| `death` | front | used | used | `ben_jump` | `ben_death1` to `ben_death7` (7) (40x56, 7840 B) | ready-in-lab |
| `hurt-right` | right | n/a | unused | `benA_hurt` | — | missing |
| `hurt-left` | left | n/a | unused | `benA_hurt` | — | missing |

### Looking up and down

| Slot | Facing | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|---|
| `look-up` | front | used | used | `ben_lookUp` | `ben_frontLookUp` (24x44, 528 B) | in-game |
| `look-down` | front | used | used | `ben_lookDown` | `ben_frontBendHalf`, `ben_frontBendFull` (24x44, 1056 B) | in-game |

### Overworld map

| Slot | Facing | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|---|
| `overworld-n` | none | could-use | n/a | — | `benMap_N0`, `benMap_N1` (24x24, 576 B) | ready-in-lab |
| `overworld-ne` | none | could-use | n/a | — | `benMap_NE0`, `benMap_NE1` (24x24, 576 B) | ready-in-lab |
| `overworld-e` | none | used | n/a | `benMap0`, `benMap1` | `benMap_E0`, `benMap_E1` (24x24, 576 B) | ready-in-lab |
| `overworld-se` | none | could-use | n/a | — | `benMap_SE0`, `benMap_SE1` (24x24, 576 B) | ready-in-lab |
| `overworld-s` | none | could-use | n/a | — | `benMap_S0`, `benMap_S1` (24x24, 576 B) | ready-in-lab |
| `overworld-sw` | none | could-use | n/a | — | `benMap_SW0`, `benMap_SW1` (24x24, 576 B) | ready-in-lab |
| `overworld-w` | none | used | n/a | `benMap0`, `benMap1` | `benMap_W0`, `benMap_W1` (24x24, 576 B) | ready-in-lab |
| `overworld-nw` | none | could-use | n/a | — | `benMap_NW0`, `benMap_NW1` (24x24, 576 B) | ready-in-lab |

### Idles and performances

| Slot | Facing | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|---|
| `idle-wrist-check-right` | right | could-use | unused | — | `ben_wristCheck1` to `ben_wristCheck4` (4) (32x44, 2816 B) | new-in-pr |
| `idle-wrist-check-left` | left | could-use | unused | — | — | missing |
| `idle-wrist-aerial-right` | right | could-use | unused | — | `ben_aerial1` to `ben_aerial7` (7) (32x44, 4928 B) | new-in-pr |
| `idle-wrist-aerial-left` | left | could-use | unused | — | — | missing |
| `idle-helmet-tip-right` | right | could-use | unused | — | `ben_helmetTip1` to `ben_helmetTip8` (8) (32x44, 5632 B) | new-in-pr |
| `idle-helmet-tip-left` | left | could-use | unused | — | — | missing |
| `idle-rock-right` | right | could-use | unused | — | `ben_rock1` to `ben_rock4` (4) (32x44, 2816 B) | new-in-pr |
| `idle-rock-left` | left | could-use | unused | — | — | missing |
| `idle-whistle-right` | right | could-use | unused | — | `ben_whistleRight1` to `ben_whistleRight6` (6) (32x44, 4224 B) | ready-in-lab |
| `idle-whistle-left` | left | could-use | unused | — | `ben_whistleLeft1` to `ben_whistleLeft6` (6) (32x44, 4224 B) | ready-in-lab |
| `idle-phone-sit` | front | could-use | unused | — | `ben_phone1` to `ben_phone9` (9) (40x56, 10080 B) | ready-in-lab |
| `idle-phone-type` | front | could-use | unused | — | `ben_phoneType1` to `ben_phoneType8` (8) (40x56, 8960 B) | ready-in-lab |

### Model-only poses awaiting pixel art

| Slot | Facing | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|---|
| `reload-right` | right | could-use | could-use | — | `ben_reload1` to `ben_reload8` (8) (32x44, 5632 B) | needs-pixel-art |
| `reload-left` | left | could-use | could-use | — | — | missing |
| `head-scratch-right` | right | could-use | unused | — | `ben_headScratch1`, `ben_headScratch2` (32x44, 1408 B) | needs-pixel-art |
| `head-scratch-left` | left | could-use | unused | — | — | missing |
| `helmet-spin-right` | right | could-use | unused | — | `ben_helmetSpin1` to `ben_helmetSpin4` (4) (32x44, 2816 B) | needs-pixel-art |
| `helmet-spin-left` | left | could-use | unused | — | — | missing |
| `pogo-draw-right` | right | could-use | could-use | — | `ben_pogoDraw1` to `ben_pogoDraw8` (8) (32x44, 5632 B) | needs-pixel-art |
| `pogo-draw-left` | left | could-use | could-use | — | — | missing |

## Gaps, in priority order

These are the slots that block finishing the initial sprite work, ordered by how much of a game they affect. Every missing side of a pose is its own slot, so the left-facing gaps appear here under their slot ids. The `crouch-*` slots are n/a in both games and are not a gap.

1. **`shoot-left`** (missing; both games). The lab only has right-facing fire frames, and Fizz 2's trial flips them for left, which puts the Stunner on the wrong hip. The character sheet fixes it on the right hip, so a left-facing fire needs a designed pose, not a mirror.
2. **`aim-up-right`, `aim-down-right`, `aim-up-left` and `aim-down-left`** (partial on the right, missing on the left; both games). Both games play these every time Ben fires straight up or down, including on ladders. The lab has only the legacy 24 × 44 right-facing studies from before the rig redraw and the Stunner design. They need redrawing at the rig's proportions, in both facings, and the left pair needs the same far-hand weapon work as `shoot-left`.
3. **`land-right` and `land-left`** (partial; both games could use it). Neither game has a landing pose; the lab jump rig's fifth beat (`ben_jumpRig5`, `ben_jumpLeft5`) is a landing frame, but there is no dedicated landing animation.
4. **`jump-right` and `fall-right` wiring** (ready-in-lab; both games). The art is done in both facings, but each game shows one frame for the whole air time. Deciding how six frames map to rise, apex and fall is a game decision that unblocks the biggest visible upgrade.
5. **Six-frame run re-import** (in-game on the trial only). Fizz 2's lab run is the earlier six-frame run; it should be re-imported from `walk-run-6` and `walk-run-left-6` before the trial is merged. The twelve-frame cuts are their own slots, `run12-right` and `run12-left`.
6. **`pogo-draw-right` and `pogo-draw-left`** (needs-pixel-art on the right, missing on the left; both could use it). Wait on a hand-held pogo stick in the sprite skin. A plain toggle works until then.
7. **`reload-right` and `reload-left`** (needs-pixel-art on the right, missing on the left; both could use it). Wait on a loose fizz can in the skin, and on whether either game gets a reload action at all.
8. **Left-facing idles** (`idle-wrist-check-left`, `idle-wrist-aerial-left`, `idle-helmet-tip-left`, `idle-rock-left`; missing; Fizz 1 could use them, Fizz 2 has no stand-still counter). These are sprite-rig performances, so each likely needs only a `facing: "left"` entry in `src/rig/catalogue.ts`.
9. **`head-scratch-*` and `helmet-spin-*`** (needs-pixel-art on the right, missing on the left; Fizz 1 could use them as idles). Both wait on a bare head with a full hairline and a helmet held in the hand.
10. **`wall-kick-right` and `wall-kick-left`** (missing; Fizz 1 only). It shows the jump frame today. Fizz 2 has dropped the mechanic, so this matters only if Fizz 1 gets the new Ben.
11. **`hurt-right` and `hurt-left`** (missing; Fizz 2 only, and only if it adopts non-fatal damage). `benA_hurt` is unplayed provisional art, and any hit is fatal in both games today.
12. **`shoot-recoil-left`** (missing; neither game plays it). The right-facing `ben_shootRecoil` is a legacy study that the fire loop supersedes, so the left-facing fire loop would cover it.
13. **`turn-360`** (needs-pixel-art; no game plays it). The in-between angles are still converter output; see `docs/TURNTABLE_REVIEW.md`.

## Facings

Each slot has a `facing`: `right`, `left`, `front`, `back` or `none` (the overworld and the 360° turntable). Every right- or left-facing slot has a `pair`, the id of its opposite, and the pair points back. `mirrorForbidden` is true wherever Ben carries the Fizz Stunner, which is every pose except the tiny overworld sprites. `stunnerSide` says where it is: `right-hip` for right-facing, front and back views (the camera-left hip in a front view), and `far-hip-left-facing` for left-facing poses, where Ben's right hip is the far one and the holster is mostly hidden. A left-facing pose is therefore drawn on its own, never flipped from the right-facing one. `src/sprite-inventory.test.ts` checks that no Stunner-bearing frame is a pixel flip of a frame in its pair.

Facing is decided from `assets.json`. A side exists when the lab has a frame set for it: `ben_walkLeft1`–`12` (`walk-run-left`, `walk-run-left-6`), `ben_jumpLeft1`–`6` (`jump-left`), `ben_fallLeft1`–`6` (`fall-left`), `ben_ledgeLeft1`–`11` (`mantle-left`), `ben_pogoLeft1`–`12` (`pogo-left`), `ben_whistleLeft1`–`6` (`whistle-left`) and the saved `ben_stand`, which faces left. There is no `ben_fireLeft`, no left-facing aim, no left-facing ledge-hang or climb beyond `mantle-left`, no left-facing hurt, and none of the new idles or model-only poses have a left set. The model-only poses are rendered at a right three-quarter yaw (`modelPoseYaw` in `scripts/draw-model-poses.ts`).

### Right and left matrix

Status of each side, from the slot statuses above.

| Pose | Right | Left | Games that play it |
|---|---|---|---|
| `stand` | `stand-right`: in-game | `stand-left`: in-game | Fizz 1 used, Fizz 2 used |
| `run` | `run-right`: in-game | `run-left`: in-game | Fizz 1 used, Fizz 2 used |
| `run12` | `run12-right`: ready-in-lab | `run12-left`: ready-in-lab | Fizz 1 could-use, Fizz 2 could-use |
| `jump` | `jump-right`: ready-in-lab | `jump-left`: ready-in-lab | Fizz 1 used, Fizz 2 used |
| `fall` | `fall-right`: ready-in-lab | `fall-left`: ready-in-lab | Fizz 1 could-use, Fizz 2 could-use |
| `land` | `land-right`: partial | `land-left`: partial | Fizz 1 could-use, Fizz 2 could-use |
| `crouch` | `crouch-right`: missing | `crouch-left`: missing | Fizz 1 n/a, Fizz 2 n/a |
| `mantle` | `mantle-right`: ready-in-lab | `mantle-left`: ready-in-lab | Fizz 1 used, Fizz 2 n/a |
| `wall-kick` | `wall-kick-right`: missing | `wall-kick-left`: missing | Fizz 1 could-use, Fizz 2 n/a |
| `door-through` | `door-through-right`: ready-in-lab | `door-through-left`: ready-in-lab | Fizz 1 n/a, Fizz 2 could-use |
| `pogo` | `pogo-right`: ready-in-lab | `pogo-left`: ready-in-lab | Fizz 1 used, Fizz 2 used |
| `shoot` | `shoot-right`: in-game | `shoot-left`: missing | Fizz 1 used, Fizz 2 used |
| `shoot-recoil` | `shoot-recoil-right`: ready-in-lab | `shoot-recoil-left`: missing | Fizz 1 unused, Fizz 2 unused |
| `aim-up` | `aim-up-right`: partial | `aim-up-left`: missing | Fizz 1 used, Fizz 2 used |
| `aim-down` | `aim-down-right`: partial | `aim-down-left`: missing | Fizz 1 used, Fizz 2 used |
| `hurt` | `hurt-right`: missing | `hurt-left`: missing | Fizz 1 n/a, Fizz 2 unused |
| `idle-wrist-check` | `idle-wrist-check-right`: new-in-pr | `idle-wrist-check-left`: missing | Fizz 1 could-use, Fizz 2 unused |
| `idle-wrist-aerial` | `idle-wrist-aerial-right`: new-in-pr | `idle-wrist-aerial-left`: missing | Fizz 1 could-use, Fizz 2 unused |
| `idle-helmet-tip` | `idle-helmet-tip-right`: new-in-pr | `idle-helmet-tip-left`: missing | Fizz 1 could-use, Fizz 2 unused |
| `idle-rock` | `idle-rock-right`: new-in-pr | `idle-rock-left`: missing | Fizz 1 could-use, Fizz 2 unused |
| `idle-whistle` | `idle-whistle-right`: ready-in-lab | `idle-whistle-left`: ready-in-lab | Fizz 1 could-use, Fizz 2 unused |
| `reload` | `reload-right`: needs-pixel-art | `reload-left`: missing | Fizz 1 could-use, Fizz 2 could-use |
| `head-scratch` | `head-scratch-right`: needs-pixel-art | `head-scratch-left`: missing | Fizz 1 could-use, Fizz 2 unused |
| `helmet-spin` | `helmet-spin-right`: needs-pixel-art | `helmet-spin-left`: missing | Fizz 1 could-use, Fizz 2 unused |
| `pogo-draw` | `pogo-draw-right`: needs-pixel-art | `pogo-draw-left`: missing | Fizz 1 could-use, Fizz 2 could-use |

Front, back and unfacing slots need no pair: `stand-front`, `look-up`, `look-down`, `death`, `idle-phone-sit` and `idle-phone-type` are camera-facing, `ladder-climb` is drawn from behind (its holster hangs on the viewer's right), and `turn-360` and the eight `overworld-*` slots are not facing-specific.

### Missing sides, in priority order for Fizz 2

1. `shoot-left`: used by Fizz 2 and the most visible. `ben_fireRight1`–`6` come from `bun run draw:actions` (`scripts/draw-action-rigs.ts`, rig `source/ben-fire-rig.json`, `motion: "fire"` sampled by `src/rig/actions.ts`). The left-facing rigs for the run, jump, fall, ledge and pogo are made by adding a `facing: "left"` entry beside the right-facing one, and a fire entry could be added the same way, but `docs/RIG.md` says the held weapon must first move to the far hand, so the option does not yet work for firing. Described only; nothing was run.
2. `aim-up-left` and `aim-down-left`, with the right-facing redraws `aim-up-right` and `aim-down-right`: used by Fizz 2 whenever Ben fires up or down. The fire rig has no aim-angle key, so both facings need new keys for `draw:actions`.
3. `land-left` and `land-right`: could-use. The landing beat exists in both facings as a frame of the jump rig; a dedicated animation would be a new key set on `source/ben-jump-rig.json`, turned round with `facing: "left"` as `jumpLeft` is.
4. `reload-left` (after `reload-right`) and `pogo-draw-left` (after `pogo-draw-right`): could-use. Both are model-only; the model would be rendered at a left yaw and redrawn as pixel art, after the skin gains a loose can and a hand-held stick.
5. `idle-wrist-check-left`, `idle-wrist-aerial-left`, `idle-helmet-tip-left` and `idle-rock-left`: unused by Fizz 2 today. Each is a performance rig in `src/rig/catalogue.ts` drawn by `bun run draw:performances`, so a left-facing set is likely one `facing: "left"` entry each. Not verified: which wrist carries the computer, and whether the rig keys use the near arm.
6. `head-scratch-left` and `helmet-spin-left` (after their right-facing pixel art).
7. `hurt-right` and `hurt-left`: only if Fizz 2 adopts non-fatal damage.
8. `shoot-recoil-left`: covered by `shoot-left`.
9. `crouch-right`, `crouch-left`, `wall-kick-right` and `wall-kick-left`: no Fizz 2 mechanic.

## Open questions

- Is the new Ben meant to replace Fizz 1's Ben as well as Fizz 2's, or only Fizz 2's? It decides whether the Fizz 1-only slots (`ladder-climb`, `mantle-*`, `wall-kick`, the overworld) are gaps or backlog.
- The lab frames are 24 × 44 to 40 × 72 against Fizz 1's 16 × 24 body and the Fizz 2 trial's 33-pixel crops. Which scale is the target, and does the overworld Ben (24 × 24 against 16 × 16) change size with it?
- The Fizz 1 mantle plays three poses in 0.30 s and the lab pull has eleven frames. Does the game slow the mantle, or are three frames chosen from the eleven?
- Should the bored idles (wrist computer, aerial, helmet tip, head scratch, helmet spin, rocking, whistling and the telephone) be driven by Fizz 1's twenty-second stand-still counter? Fizz 2 keeps no such counter, so they are marked unused there.
- Which of the 24 `ben_turn*` angles have been redrawn since the turntable review? The inventory marks the whole set needs-pixel-art because the review does not list which are done.
- The overworld could-use states rest on Fizz 1 moving Ben with both `vx` and `vy` on the map while drawing one sideways sprite. Whether the map should face all eight directions is a design call.
- Should `look-up` and `look-down` also get right and left side views? The games' old `ben_lookUp` and `ben_lookDown` are side views, but the lab replaces them with camera-facing frames, so they are recorded as `front`.
- Do the Fizz 2 games need both the six- and twelve-frame runs? `run12-*` records the twelve-frame cut separately so its cost is visible, but the games play only one.
- The `old` sprite is Fizz 1's wherever one exists. If the target for Episode 2 is the `benA_*` sheet instead, the `old` column for the shared slots would change.
