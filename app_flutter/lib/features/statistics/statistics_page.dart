import 'package:flutter/material.dart';
import '../../app/app_model.dart';
import '../timer/timer_page.dart' show formatTime;

class StatisticsPage extends StatelessWidget {
  const StatisticsPage({super.key, required this.model});
  final AppModel model;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(32),
    children: [
      Text('统计', style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: 24),
      Wrap(
        spacing: 16,
        runSpacing: 16,
        children: [
          _metric(context, '完成成绩', '${model.aggregate.count}'),
          _metric(context, '有效成绩', '${model.aggregate.validCount}'),
          _metric(
            context,
            '有效成绩均值',
            model.aggregate.meanUs == null
                ? '—'
                : formatTime(model.aggregate.meanUs!.round()),
          ),
        ],
      ),
      const SizedBox(height: 24),
      const Text('原型阶段验证增量聚合。滚动平均、CFOP、OLL/PLL 和历史曲线按计划在完整功能阶段接入。'),
    ],
  );
  Widget _metric(BuildContext context, String label, String value) => SizedBox(
    width: 220,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label),
            const SizedBox(height: 16),
            Text(value, style: Theme.of(context).textTheme.headlineMedium),
          ],
        ),
      ),
    ),
  );
}
