# Workshop identity

`hero.svg` is the self-contained 1200 × 320 README banner. Its six-frame running loop uses the saved `ben_walkRight1` through `ben_walkRight6` sprites at 100 ms per frame. The flanking standing views retain their original saved pixels. A reduced-motion preference replaces the loop with its first pose.

`avatar.svg` is the editable 512 × 512 repository avatar, cropped from the saved front-facing Ben sprite. `avatar.png` is the matching raster rendition for Forgejo's project settings. Both use the same integer-aligned pixels and orange corner frame.

Run `bun run generate` to export current project saves, then `bun run branding:build` to regenerate all three identity files. The builder reads `assets.json` and never changes sprite grids or editor overrides. Upload `avatar.png` to Forgejo; keep `avatar.svg` as the source asset. The banner and avatar follow Liminal HQ's dark hero, warm accent and accessible SVG conventions used in Waypoint, Jar and Lieutenant Fizz.
