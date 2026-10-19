import 'dart:collection';
import 'dart:typed_data';

final class DiagnosticEntry {
  DiagnosticEntry({required this.at, required String message, Uint8List? bytes})
    : message = message.length <= 512 ? message : message.substring(0, 512),
      packetPrefix = bytes == null
          ? null
          : Uint8List.fromList(bytes.take(64).toList()).asUnmodifiableView();

  final Duration at;
  final String message;
  final Uint8List? packetPrefix;
}

/// Opt-in ring buffer. It is never the source of persistent replay evidence.
final class DiagnosticBuffer {
  DiagnosticBuffer({this.capacity = 128, this.enabled = false}) {
    if (capacity < 1) throw ArgumentError.value(capacity, 'capacity');
  }

  final int capacity;
  bool enabled;
  final ListQueue<DiagnosticEntry> _entries = ListQueue();

  int get length => _entries.length;
  List<DiagnosticEntry> get entries => List.unmodifiable(_entries);

  void add(DiagnosticEntry entry) {
    if (!enabled) return;
    if (_entries.length == capacity) _entries.removeFirst();
    _entries.addLast(entry);
  }

  void clear() => _entries.clear();
}
