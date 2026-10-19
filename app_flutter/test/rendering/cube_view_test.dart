import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show RenderRepaintBoundary;
import 'package:flutter_test/flutter_test.dart';
import 'package:traintimer/core/cube/cube_move.dart';
import 'package:traintimer/core/cube/cube_state.dart';
import 'package:traintimer/rendering/cube3d/cube_view.dart';

const _capture = Key('cube-capture');

Widget _scene(
  CubeState state, {
  CubeMove? move,
  CubeOrientation orientation = CubeOrientation.identity,
  bool visible = true,
  Size viewport = const Size(320, 320),
}) => MaterialApp(
  theme: ThemeData(brightness: Brightness.light),
  home: Scaffold(
    body: Center(
      child: RepaintBoundary(
        key: _capture,
        child: ColoredBox(
          color: const Color(0xffeef2f6),
          child: SizedBox(
            width: viewport.width,
            height: viewport.height,
            child: CubeView(
              state: state,
              lastMove: move,
              orientation: orientation,
              visible: visible,
            ),
          ),
        ),
      ),
    ),
  ),
);

Finder get _paint => find.descendant(
  of: find.byType(CubeView),
  matching: find.byType(CustomPaint),
);

Future<void> _expectClearEdges(WidgetTester tester, String sample) async {
  final boundary = tester.renderObject<RenderRepaintBoundary>(
    find.byKey(_capture),
  );
  final counts = await tester.runAsync(() async {
    final image = await boundary.toImage();
    try {
      final pixels = (await image.toByteData(
        format: ui.ImageByteFormat.rawRgba,
      ))!;
      var colored = 0, coloredAtEdge = 0;
      for (var y = 0; y < image.height; y++) {
        for (var x = 0; x < image.width; x++) {
          final offset = (y * image.width + x) * 4;
          if (pixels.getUint8(offset) == 0xee &&
              pixels.getUint8(offset + 1) == 0xf2 &&
              pixels.getUint8(offset + 2) == 0xf6 &&
              pixels.getUint8(offset + 3) == 255) {
            continue;
          }
          colored++;
          if (x < 8 || y < 8 || x >= image.width - 8 || y >= image.height - 8) {
            coloredAtEdge++;
          }
        }
      }
      return (colored: colored, edge: coloredAtEdge);
    } finally {
      image.dispose();
    }
  });
  expect(counts, isNotNull);
  expect(
    counts!.colored,
    greaterThan(2000),
    reason: '$sample must actually draw a cube',
  );
  expect(counts.edge, 0, reason: '$sample must leave an 8px background border');
}

void main() {
  testWidgets(
    'pose updates repaint without a ticker or logical-state changes',
    (tester) async {
      final state = CubeState.solved();
      final original = state.facelets;
      await tester.pumpWidget(_scene(state));
      await tester.pumpAndSettle();
      final previous = tester.widget<CustomPaint>(_paint).painter!;
      expect(tester.binding.transientCallbackCount, 0);
      expect(tester.binding.hasScheduledFrame, isFalse);
      final tiny = CubeOrientation(x: 1e-15, y: 0, z: 0, w: 1);
      await tester.pumpWidget(_scene(state, orientation: tiny));
      final next = tester.widget<CustomPaint>(_paint).painter!;
      expect(
        next.shouldRepaint(previous),
        isTrue,
        reason: 'No minimum angle may swallow slow, valid pose changes',
      );
      expect(tester.binding.transientCallbackCount, 0);
      await tester.pump(const Duration(seconds: 2));
      expect(tester.binding.hasScheduledFrame, isFalse);
      expect(state.facelets, original);
      final equivalent = CubeOrientation(
        x: -tiny.x,
        y: -tiny.y,
        z: -tiny.z,
        w: -tiny.w,
      );
      await tester.pumpWidget(_scene(state, orientation: equivalent));
      expect(
        tester.widget<CustomPaint>(_paint).painter!.shouldRepaint(next),
        isFalse,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'hidden cube cancels a layer ticker and does not create a painter',
    (tester) async {
      final before = CubeState.solved();
      const move = CubeMove(CubeFace.r, 1);
      final after = before.apply(move);
      await tester.pumpWidget(_scene(before));
      await tester.pumpWidget(_scene(after, move: move));
      await tester.pump(const Duration(milliseconds: 25));
      expect(tester.binding.transientCallbackCount, greaterThan(0));
      final pose = CubeOrientation(
        x: 0,
        y: math.sqrt(.5),
        z: 0,
        w: math.sqrt(.5),
      );
      await tester.pumpWidget(
        _scene(after, move: move, orientation: pose, visible: false),
      );
      expect(_paint, findsNothing);
      expect(tester.binding.transientCallbackCount, 0);
      await tester.pump(const Duration(seconds: 2));
      expect(tester.binding.hasScheduledFrame, isFalse);
      await tester.pumpWidget(_scene(after, move: move, orientation: pose));
      expect(_paint, findsOneWidget);
      expect(tester.binding.transientCallbackCount, 0);
      expect(after, before.apply(move));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('posed cube and representative layer turn raster regressions', (
    tester,
  ) async {
    final before = CubeState.solved();
    const move = CubeMove(CubeFace.r, 1);
    final after = before.apply(move);
    final pose = CubeOrientation(x: .15, y: -.12, z: .08, w: .97);
    await tester.pumpWidget(_scene(before, orientation: pose));
    await expectLater(
      find.byKey(_capture),
      matchesGoldenFile('goldens/cube_pose.png'),
    );
    await tester.pumpWidget(_scene(after, move: move, orientation: pose));
    await tester.pump(const Duration(milliseconds: 50));
    await expectLater(
      find.byKey(_capture),
      matchesGoldenFile('goldens/cube_pose_r_midturn.png'),
    );
    await tester.pumpAndSettle();
    await expectLater(
      find.byKey(_capture),
      matchesGoldenFile('goldens/cube_pose_r_finished.png'),
    );
    expect(tester.binding.transientCallbackCount, 0);
    expect(tester.binding.hasScheduledFrame, isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'rotated cubes and moving layers leave the viewport edges clear',
    (tester) async {
      final random = math.Random(20261019);
      final poses = [
        CubeOrientation.identity,
        CubeOrientation(x: 1, y: 0, z: 0, w: 1),
        CubeOrientation(x: 0, y: 1, z: 0, w: 1),
        CubeOrientation(x: 0, y: 0, z: 1, w: 1),
        CubeOrientation(x: .15, y: -.12, z: .08, w: .97),
        CubeOrientation(x: 1, y: 1, z: 1, w: 1),
        for (var i = 0; i < 6; i++)
          CubeOrientation(
            x: random.nextDouble() - .5,
            y: random.nextDouble() - .5,
            z: random.nextDouble() - .5,
            w: random.nextDouble() - .5,
          ),
      ];
      final before = CubeState.solved();
      for (var index = 0; index < poses.length; index++) {
        final pose = poses[index];
        await tester.pumpWidget(_scene(before, orientation: pose));
        await tester.pumpAndSettle();
        await _expectClearEdges(tester, 'static pose $index');
        for (final face in CubeFace.values) {
          await tester.pumpWidget(_scene(before, orientation: pose));
          final move = CubeMove(face, index % 3 + 1);
          await tester.pumpWidget(
            _scene(before.apply(move), move: move, orientation: pose),
          );
          await tester.pump(const Duration(milliseconds: 50));
          await _expectClearEdges(
            tester,
            'pose $index / ${move.token} midturn',
          );
          await tester.pumpAndSettle();
        }
      }
      for (final viewport in [const Size(320, 240), const Size(240, 320)]) {
        await tester.pumpWidget(
          _scene(before, orientation: poses[4], viewport: viewport),
        );
        await tester.pumpAndSettle();
        await _expectClearEdges(tester, 'rectangular $viewport');
      }
      expect(tester.takeException(), isNull);
      expect(tester.binding.transientCallbackCount, 0);
    },
  );
}
