# TrainTimer Liquid Glass source layers

These files are flat, opaque, 1024×1024 SVG foreground layers prepared for Apple Icon Composer. They intentionally contain no rounded-rectangle mask, blur, shadow, refraction, translucency, or specular highlight.

Suggested stack and treatment:

1. Configure the canvas background in Icon Composer with a dark slate-to-blue system-compatible gradient.
2. Import `01-inactive-cubies.svg` as the lowest foreground group with restrained translucency.
3. Import `02-u-layer.svg` above it and use a brighter clear-glass treatment.
4. Import `03-m-layer.svg` above the inactive cube, with slightly lower opacity than U so the T intersection reads cleanly.
5. Import `04-registration.svg` as the highest, mostly opaque accent layer.

Tune Default, Dark, and Mono independently. Keep at least the U/M T structure white or near-white in Mono so the mark retains contrast.

`../liquid-glass-preview-v2.svg` is the current static communication preview. It demonstrates transmission and refraction by rendering shifted copies of the background through each glass shape. Do not import the preview into Icon Composer as a flattened Liquid Glass source.

`../liquid-glass-preview.svg` is retained as the first material preview for comparison.
