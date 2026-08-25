# 顶部控制栏修改前存档

- 存档时间：2026-08-24（Asia/Shanghai）
- 完整存档：`topbar-before-reference-layout-20260824-complete.tar.gz`
- SHA-256：`725d1494b8f70f8d54b1b9eb430f30757fcfa9ef060d32ceb5913c505f65440b`
- 初始核心文件存档：`topbar-before-reference-layout-20260824.tar.gz`（保留不动）
- 说明：存档保留了本次顶部控制栏改造开始前的实际工作区版本，包括当时已有的未提交改动。

包含文件：

- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `TrainTimer.app/Contents/Resources/runtime/public/index.html`
- `TrainTimer.app/Contents/Resources/runtime/public/styles.css`
- `TrainTimer.app/Contents/Resources/runtime/public/app.js`
- `test/auto-next-scramble.test.js`
- `test/dialog-native-overscroll.test.js`
- `test/topbar-layout-stability.test.js`

在项目根目录回滚：

```bash
tar -xzf backups/topbar-before-reference-layout-20260824-complete.tar.gz -C .
```

此命令会用存档版本覆盖上面列出的文件；执行前请先保存之后产生的其他改动。
