import 'package:flutter/material.dart';
import '../../app/app_model.dart';
import '../../data/data.dart';
import '../timer/timer_page.dart' show formatTime;

class HistoryPage extends StatefulWidget {
  const HistoryPage({super.key, required this.model});
  final AppModel model;
  @override
  State<HistoryPage> createState() => _HistoryPageState();
}

class _HistoryPageState extends State<HistoryPage> {
  final _rows = <SolveSummary>[];
  bool _loading = false, _hasMore = true;
  String? _error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_loading || !_hasMore) return;
    setState(() => _loading = true);
    try {
      final page = await widget.model.repository.list(
        sessionId: widget.model.sessionId,
        before: _rows.isEmpty ? null : _rows.last.cursor,
        limit: 50,
      );
      if (!mounted) return;
      setState(() {
        _rows.addAll(page);
        _hasMore = page.length == 50;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _edit(SolveSummary solve) async {
    var note = solve.note;
    var penalty = solve.penalty;
    final save = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('成绩详情'),
          content: SizedBox(
            width: 420,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    formatTime(solve.durationUs),
                    style: Theme.of(context).textTheme.displaySmall,
                  ),
                  const SizedBox(height: 16),
                  SelectableText(solve.scramble),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<SolvePenalty>(
                    initialValue: penalty,
                    decoration: const InputDecoration(labelText: '罚时'),
                    items: const [
                      DropdownMenuItem(
                        value: SolvePenalty.none,
                        child: Text('正常'),
                      ),
                      DropdownMenuItem(
                        value: SolvePenalty.plusTwo,
                        child: Text('+2'),
                      ),
                      DropdownMenuItem(
                        value: SolvePenalty.dnf,
                        child: Text('DNF'),
                      ),
                    ],
                    onChanged: (value) =>
                        setDialogState(() => penalty = value!),
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    initialValue: note,
                    onChanged: (value) => note = value,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: '备注'),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('保存'),
            ),
          ],
        ),
      ),
    );
    if (save != true) return;
    try {
      await widget.model.repository.update(
        solve.id,
        note: note,
        penalty: penalty,
      );
      await widget.model.refresh();
      if (mounted) {
        setState(() {
          _rows.clear();
          _hasMore = true;
        });
        await _load();
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Padding(
        padding: const EdgeInsets.all(24),
        child: Row(
          children: [
            Text('历史成绩', style: Theme.of(context).textTheme.headlineSmall),
            const Spacer(),
            Text(
              '按时间浏览 · 每页 50 条',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
      if (_error != null)
        Padding(padding: const EdgeInsets.all(16), child: Text(_error!)),
      Expanded(
        child: ListView.builder(
          itemCount: _rows.length + 1,
          itemBuilder: (context, index) {
            if (index == _rows.length) {
              return Padding(
                padding: const EdgeInsets.all(24),
                child: Center(
                  child: _loading
                      ? const CircularProgressIndicator()
                      : _hasMore
                      ? OutlinedButton(
                          onPressed: _load,
                          child: const Text('加载下一页'),
                        )
                      : Text(_rows.isEmpty ? '当前会话还没有成绩' : '已到达最早的成绩'),
                ),
              );
            }
            final solve = _rows[index];
            return ListTile(
              leading: const Icon(Icons.timer_outlined),
              title: Text(
                formatTime(solve.effectiveDurationUs),
                style: const TextStyle(fontSize: 24),
              ),
              subtitle: Text(
                '${DateTime.fromMicrosecondsSinceEpoch(solve.startedAtUs, isUtc: true).toLocal().toString().substring(0, 19)}${solve.note.isEmpty ? '' : ' · ${solve.note}'}',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _edit(solve),
            );
          },
        ),
      ),
    ],
  );
}
