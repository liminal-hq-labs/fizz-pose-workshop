# Ben sprite inventory

Every pose and animation position ("slot") that Ben has, or could have, across Lieutenant Fizz 1, Fizz 2 and this lab, with the old game sprite and the new lab sprite side by side. The data is `source/sprite-inventory.json`; `src/sprite-inventory.test.ts` checks that it is well formed and that every frame it names exists. This page is the readable summary.

## Method

- Read each game's code for the place that chooses Ben's sprite and for the state that drives it: Fizz 1's `ben_sprite` and `Player` in `episodes/episode-1/game/src/`, and Fizz 2's `ben_pose` in `crates/fizz-slice-view/src/lib.rs` with `Ben` in `crates/fizz-ep2/src/ben.rs`. Their design documents (`docs/GAME_DESIGN.md`, Fizz 2's `docs/SPRITES.md`, `docs/PLATFORM.md` and `docs/FIZZ1-DIFFERENCES.md`) say what each game leaves out on purpose.
- Read this lab's `assets.json` (frames and animations), `docs/RIG.md`, `docs/BEN_CHARACTER_SHEET.md` and `git diff main` to see which frames are new in the open pull request stack.
- Give each game one state per slot. **used** means code or data actually plays the slot, and the evidence cites a file and symbol. **could-use** means the game's mechanics or design documents imply the slot but no sprite is wired, or the game borrows another pose for it. **unused** means the lab or an old sheet has art that the game never plays. **n/a** means the game deliberately lacks the mechanic.
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

Totals: 47 slots — 24 ready-in-lab, 7 in-game, 4 new-in-pr, 5 needs-pixel-art, 2 partial and 5 missing. For Fizz 1, 20 are used, 22 could-use, 3 unused and 2 n/a; for Fizz 2, 15 are used, 5 could-use, 14 unused and 13 n/a. The new art totals 174,288 bytes at 4 bits, of which 16,896 is the 24-angle turn-around.

### Standing and facing

| Slot | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|
| `stand-right` | used | used | `ben_stand` | `ben_standRight` (24x44, 528 B) | in-game |
| `stand-left` | used | used | `ben_stand` | `ben_stand` (24x44, 528 B) | in-game |
| `stand-front` | unused | unused | — | `ben_standFront` (24x44, 528 B) | ready-in-lab |
| `turn-360` | unused | unused | — | `ben_turn000` to `ben_turn345` (24) (32x44, 16896 B) | needs-pixel-art |

### Run and walk

| Slot | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|
| `run-right` | used | used | `ben_run1`, `ben_run2` | `ben_walkRight1` to `ben_walkRight11` (6) (24x44, 3168 B) | in-game |
| `run-left` | used | used | `ben_run1`, `ben_run2` | `ben_walkLeft1` to `ben_walkLeft11` (6) (24x44, 3168 B) | in-game |

### Jump, fall and land

| Slot | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|
| `jump-right` | used | used | `ben_jump` | `ben_jumpRig1` to `ben_jumpRig6` (6) (32x52, 4992 B) | ready-in-lab |
| `jump-left` | used | used | `ben_jump` | `ben_jumpLeft1` to `ben_jumpLeft6` (6) (32x52, 4992 B) | ready-in-lab |
| `fall-right` | could-use | could-use | `benA_fall` | `ben_fallRig1` to `ben_fallRig6` (6) (32x52, 4992 B) | ready-in-lab |
| `fall-left` | could-use | could-use | `benA_fall` | `ben_fallLeft1` to `ben_fallLeft6` (6) (32x52, 4992 B) | ready-in-lab |
| `land` | could-use | could-use | — | — | missing |
| `crouch` | n/a | n/a | — | — | missing |

### Ladders, vines and ledges

| Slot | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|
| `ladder-climb` | used | n/a | `ben_climb1`, `ben_climb2` | `ben_ladder1` to `ben_ladder8` (8) (32x48, 6144 B) | ready-in-lab |
| `mantle-right` | used | n/a | `ben_mantle1`, `ben_mantle2`, `ben_mantle3` | `ben_ledge1` to `ben_ledge11` (11) (40x72, 15840 B) | ready-in-lab |
| `mantle-left` | used | n/a | `ben_mantle1`, `ben_mantle2`, `ben_mantle3` | `ben_ledgeLeft1` to `ben_ledgeLeft11` (11) (40x72, 15840 B) | ready-in-lab |
| `wall-kick` | could-use | n/a | — | — | missing |

### Pogo stick

| Slot | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|
| `pogo-right` | used | used | `ben_pogo`, `ben_pogo2` | `ben_pogoRight1` to `ben_pogoRight12` (12) (24x44, 6336 B) | ready-in-lab |
| `pogo-left` | used | used | `ben_pogo`, `ben_pogo2` | `ben_pogoLeft1` to `ben_pogoLeft12` (12) (24x44, 6336 B) | ready-in-lab |

### Fizz Stunner

| Slot | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|
| `shoot-right` | used | used | `ben_shoot` | `ben_fireRight1` to `ben_fireRight6` (6) (32x44, 4224 B) | in-game |
| `shoot-left` | used | used | `ben_shoot` | — | missing |
| `shoot-recoil` | unused | unused | — | `ben_shootRecoil` (24x44, 528 B) | ready-in-lab |
| `aim-up` | used | used | `ben_aimUp` | `ben_aimUp` (24x44, 528 B) | partial |
| `aim-down` | used | used | `ben_aimDown` | `ben_aimDown` (24x44, 528 B) | partial |

### Hurt and death

| Slot | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|
| `death` | used | used | `ben_jump` | `ben_death1` to `ben_death7` (7) (40x56, 7840 B) | ready-in-lab |
| `hurt` | n/a | unused | `benA_hurt` | — | missing |

### Looking up and down

| Slot | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|
| `look-up` | used | used | `ben_lookUp` | `ben_frontLookUp` (24x44, 528 B) | in-game |
| `look-down` | used | used | `ben_lookDown` | `ben_frontBendHalf`, `ben_frontBendFull` (24x44, 1056 B) | in-game |

### Overworld map

| Slot | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|
| `overworld-n` | could-use | n/a | — | `benMap_N0`, `benMap_N1` (24x24, 576 B) | ready-in-lab |
| `overworld-ne` | could-use | n/a | — | `benMap_NE0`, `benMap_NE1` (24x24, 576 B) | ready-in-lab |
| `overworld-e` | used | n/a | `benMap0`, `benMap1` | `benMap_E0`, `benMap_E1` (24x24, 576 B) | ready-in-lab |
| `overworld-se` | could-use | n/a | — | `benMap_SE0`, `benMap_SE1` (24x24, 576 B) | ready-in-lab |
| `overworld-s` | could-use | n/a | — | `benMap_S0`, `benMap_S1` (24x24, 576 B) | ready-in-lab |
| `overworld-sw` | could-use | n/a | — | `benMap_SW0`, `benMap_SW1` (24x24, 576 B) | ready-in-lab |
| `overworld-w` | used | n/a | `benMap0`, `benMap1` | `benMap_W0`, `benMap_W1` (24x24, 576 B) | ready-in-lab |
| `overworld-nw` | could-use | n/a | — | `benMap_NW0`, `benMap_NW1` (24x24, 576 B) | ready-in-lab |

### Idles and performances

| Slot | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|
| `idle-wrist-check` | could-use | unused | — | `ben_wristCheck1` to `ben_wristCheck4` (4) (32x44, 2816 B) | new-in-pr |
| `idle-wrist-aerial` | could-use | unused | — | `ben_aerial1` to `ben_aerial7` (7) (32x44, 4928 B) | new-in-pr |
| `idle-helmet-tip` | could-use | unused | — | `ben_helmetTip1` to `ben_helmetTip8` (8) (32x44, 5632 B) | new-in-pr |
| `idle-rock` | could-use | unused | — | `ben_rock1` to `ben_rock4` (4) (32x44, 2816 B) | new-in-pr |
| `idle-whistle-right` | could-use | unused | — | `ben_whistleRight1` to `ben_whistleRight6` (6) (32x44, 4224 B) | ready-in-lab |
| `idle-whistle-left` | could-use | unused | — | `ben_whistleLeft1` to `ben_whistleLeft6` (6) (32x44, 4224 B) | ready-in-lab |
| `idle-phone-sit` | could-use | unused | — | `ben_phone1` to `ben_phone9` (9) (40x56, 10080 B) | ready-in-lab |
| `idle-phone-type` | could-use | unused | — | `ben_phoneType1` to `ben_phoneType8` (8) (40x56, 8960 B) | ready-in-lab |

### Model-only poses awaiting pixel art

| Slot | Fizz 1 | Fizz 2 | Old | New | Status |
|---|---|---|---|---|---|
| `reload` | could-use | could-use | — | `ben_reload1` to `ben_reload8` (8) (32x44, 5632 B) | needs-pixel-art |
| `head-scratch` | could-use | unused | — | `ben_headScratch1`, `ben_headScratch2` (32x44, 1408 B) | needs-pixel-art |
| `helmet-spin` | could-use | unused | — | `ben_helmetSpin1` to `ben_helmetSpin4` (4) (32x44, 2816 B) | needs-pixel-art |
| `pogo-draw` | could-use | could-use | — | `ben_pogoDraw1` to `ben_pogoDraw8` (8) (32x44, 5632 B) | needs-pixel-art |

## Gaps, in priority order

These are the slots that block finishing the initial sprite work, ordered by how much of a game they affect. The `crouch` slot is n/a in both games and is not a gap.

1. **`shoot-left`** (missing; both games). The lab only has right-facing fire frames, and Fizz 2's trial flips them for left, which puts the Stunner on the wrong hip. The character sheet fixes it on the right hip, so a left-facing fire needs a designed pose, not a mirror.
2. **`aim-up` and `aim-down`** (partial; both games). Both games play these every time Ben fires straight up or down, including on ladders, and the lab has only the legacy 24 × 44 studies from before the rig redraw and the Stunner design. They need redrawing at the rig's proportions, in both facings.
3. **`land`** (missing; both games could use it). Neither game has a landing pose; the lab jump loop starts with a crouch that may double as one.
4. **`jump-right` and `fall-right` wiring** (ready-in-lab; both games). The art is done, but each game shows one frame for the whole air time. Deciding how six frames map to rise, apex and fall is a game decision that unblocks the biggest visible upgrade.
5. **Six-frame run re-import** (in-game on the trial only). Fizz 2's lab run is the earlier six-frame run; it should be re-imported from `walk-run-6` and `walk-run-left-6` before the trial is merged.
6. **`pogo-draw`** (needs-pixel-art; both could use it). Waits on a hand-held pogo stick in the sprite skin. A plain toggle works until then.
7. **`reload`** (needs-pixel-art; both could use it). Waits on a loose fizz can in the skin, and on whether either game gets a reload action at all.
8. **`head-scratch` and `helmet-spin`** (needs-pixel-art; Fizz 1 could use them as idles). Both wait on a bare head with a full hairline and a helmet held in the hand.
9. **`wall-kick`** (missing; Fizz 1 only). It shows the jump frame today. Fizz 2 has dropped the mechanic, so this matters only if Fizz 1 gets the new Ben.
10. **`hurt`** (missing; Fizz 2 only, and only if it adopts non-fatal damage). `benA_hurt` is unplayed provisional art, and any hit is fatal in both games today.
11. **`turn-360`** (needs-pixel-art; no game plays it). The in-between angles are still converter output; see `docs/TURNTABLE_REVIEW.md`.

## Open questions

- Is the new Ben meant to replace Fizz 1's Ben as well as Fizz 2's, or only Fizz 2's? It decides whether the Fizz 1-only slots (`ladder-climb`, `mantle-*`, `wall-kick`, the overworld) are gaps or backlog.
- The lab frames are 24 × 44 to 40 × 72 against Fizz 1's 16 × 24 body and the Fizz 2 trial's 33-pixel crops. Which scale is the target, and does the overworld Ben (24 × 24 against 16 × 16) change size with it?
- The Fizz 1 mantle plays three poses in 0.30 s and the lab pull has eleven frames. Does the game slow the mantle, or are three frames chosen from the eleven?
- Should the bored idles (wrist computer, aerial, helmet tip, head scratch, helmet spin, rocking, whistling and the telephone) be driven by Fizz 1's twenty-second stand-still counter? Fizz 2 keeps no such counter, so they are marked unused there.
- Which of the 24 `ben_turn*` angles have been redrawn since the turntable review? The inventory marks the whole set needs-pixel-art because the review does not list which are done.
- The overworld could-use states rest on Fizz 1 moving Ben with both `vx` and `vy` on the map while drawing one sideways sprite. Whether the map should face all eight directions is a design call.
- The `old` sprite is Fizz 1's wherever one exists. If the target for Episode 2 is the `benA_*` sheet instead, the `old` column for the shared slots would change.
