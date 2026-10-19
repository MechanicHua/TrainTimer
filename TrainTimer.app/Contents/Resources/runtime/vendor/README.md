# Vendored Dependencies

## Three.js r165

`public/vendor/three.module.js` is the self-contained, minified browser build of
the pinned `three@0.165.0` dependency. It exports only the symbols referenced by
`public/app.js` and `public/cube3d-material.js` (plus `REVISION`). Run
`npm ci` followed by `npm run build:three` after adding a `THREE.*` reference.
The build also updates the bundled macOS runtime's vendor files. After changing
these assets, bump the Three.js import URL and the app script URL to invalidate
the immutable browser cache.

License: MIT; the full notice is in `public/vendor/three.LICENSE.txt`.

The cube uses 54 instanced procedural stickers and one inner shell, with no
textures or realtime lights. Rounded edges use alpha-to-coverage with canvas
antialiasing, at a pixel ratio capped at 1. The browser chooses its default GPU;
the existing demand-driven rendering and gyro/turn frame limits remain in use.
Bundle size and draw-call reductions do not imply a measured reduction in total
GPU power: antialiasing and the satin shader add work per pixel.

## tnoodle-cli-1.1.1.jar

Source: https://github.com/SpeedcuberOSS/tnoodle-cli/releases/tag/v1.1.1

Download URL:

```text
https://github.com/SpeedcuberOSS/tnoodle-cli/releases/download/v1.1.1/tnoodle-cli-1.1.1.jar
```

SHA-256:

```text
bfd3b51ee5448116e7f7bcf968b541e3e2db0952cdf97794b427fcfbe4e43178
```

License: GPL-3.0. The CLI depends on WCA `tnoodle-lib`, also GPL-3.0.

### TNoodle 常驻适配器

`TnoodleServer.java` 复用本目录 TNoodle 1.1.1 的 `PuzzleRegistry`、`generateScrambles(1)` 和 `drawScramble`，没有修改其随机状态生成算法。Node 通过带请求 ID 的行协议调用；最多 8 个未完成请求，60 秒空闲后退出，超时或异常会释放进程。自定义 `TNOODLE_CMD` / `TNOODLE_JAR` 的优先级保持不变。
