import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:traintimer/app/app_model.dart';
import 'package:traintimer/app/desktop_app.dart';
import 'package:traintimer/core/cube/native_solver.dart';
import 'package:traintimer/data/data.dart';

void main() {
  testWidgets('desktop keyboard timing, persistence, text input, and themes', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(1280, 960));
    final database = TrainDatabase.memory();
    final directory = Directory.systemTemp.createTempSync('traintimer-ui-');
    final model = AppModel(
      database: database,
      repository: SolveRepository(database),
      solver: NativeSolver(
        libraryPath:
            '${Directory.current.path}/native/min2phase/build/libtraintimer_min2phase.dylib',
      ),
      dataDirectory: directory,
    );
    await tester.runAsync(model.initialize);
    expect(model.scramble, isNotEmpty);
    await tester.pumpWidget(TrainTimerApp(model: model));
    await tester.pumpAndSettle();
    expect(find.text('三阶 · 键盘计时'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.space);
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 520)),
    );
    await tester.sendKeyUpEvent(LogicalKeyboardKey.space);
    await tester.pump();
    expect(model.timer.phase.name, 'running');
    await tester.sendKeyEvent(LogicalKeyboardKey.keyA);
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 100)),
    );
    await tester.pumpAndSettle();
    expect(model.timer.phase.name, 'completed');
    expect(model.aggregate.count, 1);
    expect(model.recent.length, 1);
    await tester.tap(find.text('历史'));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pumpAndSettle();
    expect(find.text('历史成绩'), findsOneWidget);
    await tester.tap(find.byType(ListTile).first);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '备注含空格');
    expect(model.timer.phase.name, 'completed');
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('设置'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('深色'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('深色'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.binding.setSurfaceSize(const Size(720, 740));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    model.dispose();
    await tester.runAsync(database.close);
    directory.deleteSync(recursive: true);
    await tester.binding.setSurfaceSize(null);
  });
}
