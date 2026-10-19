# Canvas姿态候选原型

`CubeOrientation` 是纯 Dart 的归一化展示四元数，不修改 `CubeState`。GAN
四元数先经 `fromGan(x:,y:,z:,w:)` 映射为 `(x,z,-y,w)`，与冻结旧版
`public/gyro-orientation.js` 的基变换一致。非有限值和零四元数会抛出参数错误。

`current.relativeTo(reference)` 使用 `reference.inverse * current`；当前样本和
参考样本都必须先映射到展示基。默认参考 `CubeOrientation.identity` 保留绝对
姿态，显式将当前样本设为参考才归零。乘法 `left * right` 表示先应用 right，
再应用 left。`q` 与 `-q` 采用相同规范表示，重绘比较不设角度阈值。

Canvas变换顺序为转层动画、整体姿态、固定相机yaw/pitch、透视投影。姿态直接
跟随新样本，没有独立姿态动画ticker或平滑循环。Flutter可合并同帧更新，慢小
变化仍会触发重绘判定；可辨认的像素变化仍受实际分辨率限制。

数学测试覆盖90度向量、复合顺序、逆、归一化、q/-q、GAN轴映射、参考归零、
极小变化、非法值和逻辑状态不变。widget测试检查静止无持续ticker、隐藏时
移除CustomPaint并终止转层ticker，以及重新可见后的最新状态。截图基线位于
`goldens/`，包含整体姿态、R转层50ms处和转层完成。

固定比例现为`.17 * minSize`。外包球半径`R=√3×1.485≈2.572`，固定相机
距离8时，其投影半径上界为`R×8/√(64−R²)≈2.716`，因此每侧保留约3.8%
的短边空白。转层和整体旋转保持顶点距离，不按逐帧包围盒缩放，避免呼吸感。
独立像素测试覆盖12种整体姿态、六面正转/半转/逆转的中间帧及横竖视口；
所有86张栅格样本都要求8px边缘保持纯背景，同时要求内部确实绘制模型。

执行 `flutter test test/rendering`。截图基线来自当前Flutter测试栅格环境，仅为
本候选原型的回归检查，不是Profile/Release或真实显示器帧率验收。

仍待验证：深度排序沿用面平均z的painter方法；转层全角度
遮挡、高DPI、双端性能及Flutter GPU对比尚未验收。姿态平滑、参考姿态手感和
真实GAN i4慢转/快转连续性仍需实机调优，不能据此确定最终3D后端。
