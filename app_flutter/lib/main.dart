import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'app/app_model.dart';
import 'app/desktop_app.dart';
import 'core/cube/native_solver.dart';
import 'data/data.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    final override = Platform.environment['TRAIN_TIMER_FLUTTER_DATA'];
    final directory = Directory(
      override ??
          p.join(
            (await getApplicationSupportDirectory()).path,
            'TrainTimerFlutter',
            'v1',
          ),
    );
    final database = await TrainDatabase.open(directory: directory);
    final model = AppModel(
      database: database,
      repository: SolveRepository(database),
      solver: NativeSolver(
        libraryPath: Platform.environment['TRAIN_TIMER_SOLVER'],
      ),
      dataDirectory: directory,
    );
    runApp(_LoadingApp(model: model));
  } catch (e) {
    runApp(
      MaterialApp(
        home: Scaffold(body: Center(child: SelectableText('启动失败，未打开旧版数据：$e'))),
      ),
    );
  }
}

class _LoadingApp extends StatefulWidget {
  const _LoadingApp({required this.model});
  final AppModel model;
  @override
  State<_LoadingApp> createState() => _LoadingAppState();
}

class _LoadingAppState extends State<_LoadingApp> {
  late final Future<void> _initialization = widget.model.initialize();
  @override
  Widget build(BuildContext context) => FutureBuilder<void>(
    future: _initialization,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return MaterialApp(
          home: Scaffold(
            body: Center(child: SelectableText('本地数据初始化失败：${snapshot.error}')),
          ),
        );
      }
      if (snapshot.connectionState != ConnectionState.done) {
        return const MaterialApp(
          home: Scaffold(body: Center(child: CircularProgressIndicator())),
        );
      }
      return TrainTimerApp(model: widget.model);
    },
  );
}
