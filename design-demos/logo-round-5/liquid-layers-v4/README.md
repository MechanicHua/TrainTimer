# TrainTimer — Icon Composer source layers v4

These SVGs preserve the production icon's original 1024 × 1024 geometry. They intentionally contain no blur, bevel, glow, reflection, shadow, transparency, or outer rounded-rectangle mask. Apple recommends keeping source art flat and allowing Icon Composer to render Liquid Glass dynamically.

Import order:

1. `01-base-structure.svg` — glass off; includes the full-bleed opaque neutral background, dark cube tray, and inactive cubies.
2. `02-u-layer.svg` — Liquid Glass on; clearer and brighter than the M slice.
3. `03-m-layer.svg` — Liquid Glass on; slightly denser than the U layer.
4. `04-movement-marker.svg` — glass off, or minimal translucency if it remains legible at 16–32 px.

Canvas background:

- `01-base-structure.svg` contains the production icon's neutral dark gradient: `#27333C` → `#151C22` → `#090D11` as its full-bleed background.
- Do not import a custom illustrated background.
- Do not add a rounded-rectangle mask; Icon Composer applies the platform enclosure.

Material intent:

- U layer: high translucency, low-to-medium refraction, crisp automatic/inside specular.
- M layer: medium translucency, slightly stronger refraction, weaker specular than U.
- Shadows: minimal separation only; no large floating-card shadow.
- Test Default, Dark, and Mono at 1024, 128, 64, 32, and 16 px before export.

The previous `liquid-glass-preview-v3.svg` remains a rejected static simulation and is not a production source.
