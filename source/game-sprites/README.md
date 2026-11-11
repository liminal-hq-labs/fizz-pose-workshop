# Game sprite snapshots

These are read-only snapshots of the Ben sprites that the two games hold, kept so the sprite inventory (`source/sprite-inventory.json`) can name the old frames it compares against. Do not edit them, redraw them or feed them to any `draw:*` or `generate` command; refresh them by copying again from the source repositories.

| File | Source | Ref | Copied |
|---|---|---|---|
| `fizz1-ben.json` | Lieutenant Fizz 1, `episodes/episode-1/src/sprites/catalog.ts` | `chore/google-play-deploy@9729c07` (`main` is `94f354d`) | 2026-11-11 |
| `ep2-ben-a.json` | Fizz 2, `assets/sprites/ep2-ben-a.json` | `trial/lab-ben-sprites@7b948ae` | 2026-11-11 |
| `ep2-ben-lab.json` | Fizz 2, `assets/sprites/ep2-ben-lab.json` | `trial/lab-ben-sprites@7b948ae` | 2026-11-11 |

`ep2-ben-a.json` and `ep2-ben-lab.json` are byte-for-byte copies. Fizz 2's Fizz 1 slice (`fizz1-slice.json`) is not copied because every Ben frame in it is also in `fizz1-ben.json`.

`fizz1-ben.json` is not a copy: Fizz 1 draws Ben in code, so the file was written by importing Fizz 1's own sprite catalogue (`defineSprites()`) and saving every `ben_*` and `benMap*` grid unchanged as rows of palette letters in the same layout as the Fizz 2 files (`name`, `w`, `h`, `anchor`, `source`, `rows`). Nothing in the Fizz 1 checkout was modified. The sprites face right; the game flips them for left.

Frame names in the inventory's `old.frames` refer to the `name` of a sprite in the file named by `old.set`. The Fizz 2 lab file (`lab_*`) holds crops of this workshop's own frames, so the inventory lists those by their workshop names in `new.frames` and treats `ep2-ben-lab.json` only as evidence of what Fizz 2 plays.
