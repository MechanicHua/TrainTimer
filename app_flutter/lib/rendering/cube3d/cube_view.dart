import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/cube/cube_move.dart';
import '../../core/cube/cube_state.dart';
import 'cube_orientation.dart';

export 'cube_orientation.dart';

/// Canvas projection candidate. Selection remains pending cross-platform
/// occlusion, DPI and profile-frame measurements; never a global page ticker.
class CubeView extends StatefulWidget {
  const CubeView({
    super.key,
    required this.state,
    this.lastMove,
    this.visible = true,
    this.yaw = -.55,
    this.pitch = .4,
    this.orientation = CubeOrientation.identity,
  });
  final CubeState state;
  final CubeMove? lastMove;
  final bool visible;
  final double yaw, pitch;

  /// Display-only rotation: layer turn, then orientation, then fixed camera.
  final CubeOrientation orientation;
  @override
  State<CubeView> createState() => _CubeViewState();
}

class _CubeViewState extends State<CubeView>
    with SingleTickerProviderStateMixin {
  late final AnimationController _animation = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 100),
    value: 1,
  );
  late CubeState _before = widget.state;
  CubeMove? _move;

  @override
  void didUpdateWidget(CubeView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.state != widget.state) {
      _before = oldWidget.state;
      _move = widget.lastMove;
      if (widget.visible &&
          _move != null &&
          !MediaQuery.disableAnimationsOf(context)) {
        _animation.forward(from: 0);
      } else {
        _animation.value = 1;
      }
    }
    if (!widget.visible) _animation.value = 1;
  }

  @override
  void dispose() {
    _animation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => !widget.visible
      ? const SizedBox(width: 300, height: 300)
      : RepaintBoundary(
          child: Semantics(
            label: '三阶魔方投影原型',
            image: true,
            child: CustomPaint(
              painter: _CubePainter(
                animation: _animation,
                before: _before,
                after: widget.state,
                move: _move,
                yaw: widget.yaw,
                pitch: widget.pitch,
                orientation: widget.orientation,
                body: Theme.of(context).brightness == Brightness.dark
                    ? const Color(0xff171b22)
                    : const Color(0xff20262b),
              ),
              size: const Size(300, 300),
            ),
          ),
        );
}

typedef _V = ({double x, double y, double z});
_V _v(double x, double y, double z) => (x: x, y: y, z: z);
_V _add(_V a, _V b) => _v(a.x + b.x, a.y + b.y, a.z + b.z);
_V _scale(_V a, double s) => _v(a.x * s, a.y * s, a.z * s);
_V _from(Int3 v) => _v(v.x.toDouble(), v.y.toDouble(), v.z.toDouble());
_V _rotate(_V p, int axis, double angle) {
  final c = math.cos(angle), s = math.sin(angle);
  return switch (axis) {
    0 => _v(p.x, p.y * c - p.z * s, p.y * s + p.z * c),
    1 => _v(p.x * c + p.z * s, p.y, -p.x * s + p.z * c),
    _ => _v(p.x * c - p.y * s, p.x * s + p.y * c, p.z),
  };
}

class _Quad {
  const _Quad(this.points, this.color, this.rounded);
  final List<_V> points;
  final Color color;
  final bool rounded;
  double get depth => points.fold(0.0, (sum, p) => sum + p.z) / points.length;
}

class _CubePainter extends CustomPainter {
  _CubePainter({
    required this.animation,
    required this.before,
    required this.after,
    required this.move,
    required this.yaw,
    required this.pitch,
    required this.orientation,
    required this.body,
  }) : super(repaint: animation);
  final Animation<double> animation;
  final CubeState before, after;
  final CubeMove? move;
  final double yaw, pitch;
  final CubeOrientation orientation;
  final Color body;
  static const _colors = {
    'U': Color(0xfff5f5ee),
    'R': Color(0xffeb4444),
    'F': Color(0xff19b477),
    'D': Color(0xffffd54a),
    'L': Color(0xffff9038),
    'B': Color(0xff388bff),
  };

  @override
  void paint(Canvas canvas, Size size) {
    final moving = animation.value < 1 && move != null;
    final facelets = moving ? before.facelets : after.facelets;
    final def = move == null ? null : moveGeometry(move!.face);
    final turns = move?.turns == 3 ? -1 : move?.turns ?? 0;
    final angle =
        (def?.sign ?? 0) *
        turns *
        math.pi /
        2 *
        Curves.easeOut.transform(animation.value);
    _V transform(_V p, bool layer) {
      if (moving && layer) p = _rotate(p, def!.axis, angle);
      p = orientation.rotate(p);
      return _rotate(_rotate(p, 1, yaw), 0, pitch);
    }

    final quads = <_Quad>[];
    // All six faces of every cubie close the cut during a turn. Internal faces
    // are black; stickers remain mapped to the immutable pre-turn state.
    for (var x = -1; x <= 1; x++) {
      for (var y = -1; y <= 1; y++) {
        for (var z = -1; z <= 1; z++) {
          final position = (x: x, y: y, z: z);
          final layer =
              def != null && component(position, def.axis) == def.layer;
          for (var f = 0; f < 6; f++) {
            final basis = stickerGeometry[f * 9 + 4];
            final n = _from(basis.normal),
                right = _from(basis.right),
                up = _from(basis.up);
            final normal = transform(n, layer);
            if (normal.z <= 0) continue;
            final center = _add(_from(position), _scale(n, .485));
            List<_V> corners(double extent, double offset) => [
              for (final signs in [(1, 1), (-1, 1), (-1, -1), (1, -1)])
                transform(
                  _add(
                    _add(
                      _add(center, _scale(n, offset)),
                      _scale(right, signs.$1 * extent),
                    ),
                    _scale(up, signs.$2 * extent),
                  ),
                  layer,
                ),
            ];
            quads.add(_Quad(corners(.485, 0), body, false));
            final index = stickerGeometry.indexWhere(
              (g) => g.position == position && g.normal == basis.normal,
            );
            if (index >= 0) {
              final color = _colors[facelets[index]]!;
              final light = .72 + .28 * normal.z;
              quads.add(
                _Quad(
                  corners(.425, .008),
                  Color.fromARGB(
                    255,
                    (color.r * 255 * light).round(),
                    (color.g * 255 * light).round(),
                    (color.b * 255 * light).round(),
                  ),
                  true,
                ),
              );
            }
          }
        }
      }
    }
    quads.sort((a, b) => a.depth.compareTo(b.depth));
    // Every turn/pose stays in the body sphere R = sqrt(3) * 1.485. At camera
    // distance 8 its projected radius is R*8/sqrt(64-R*R), about 2.716.
    // A fixed .17 scale leaves about 3.8% of minSize free on each side.
    // Never refit per-frame bounds: physical size must not breathe during turns.
    final scale = math.min(size.width, size.height) * .17;
    Offset project(_V p) {
      final perspective = 8 / (8 - p.z);
      return Offset(
        size.width / 2 + p.x * scale * perspective,
        size.height / 2 - p.y * scale * perspective,
      );
    }

    final paint = Paint()..isAntiAlias = true;
    for (final quad in quads) {
      final points = quad.points.map(project).toList(growable: false);
      final path = Path();
      if (quad.rounded) {
        for (var i = 0; i < 4; i++) {
          final prev = points[(i + 3) % 4],
              current = points[i],
              next = points[(i + 1) % 4];
          final a = Offset.lerp(current, prev, .11)!,
              b = Offset.lerp(current, next, .11)!;
          if (i == 0) {
            path.moveTo(a.dx, a.dy);
          } else {
            path.lineTo(a.dx, a.dy);
          }
          path.quadraticBezierTo(current.dx, current.dy, b.dx, b.dy);
        }
      } else {
        path.addPolygon(points, true);
      }
      path.close();
      canvas.drawPath(path, paint..color = quad.color);
    }
  }

  @override
  bool shouldRepaint(_CubePainter old) =>
      old.before != before ||
      old.after != after ||
      old.move != move ||
      old.yaw != yaw ||
      old.pitch != pitch ||
      old.orientation != orientation ||
      old.body != body;
}
