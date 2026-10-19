/// Observes already displayed turns. It neither delays nor consumes the turn
/// stream; a failed candidate leaves normal cube/timer processing untouched.
final class NextAttemptGesture {
  NextAttemptGesture({
    this.enabled = true,
    this.window = const Duration(milliseconds: 600),
  }) {
    if (window.isNegative) throw ArgumentError.value(window, 'window');
  }

  bool enabled;
  final Duration window;
  String? _candidate;
  Duration? _candidateAt;

  bool observe({
    required String notation,
    required Duration at,
    required bool wasSolved,
    required bool isSolved,
    bool isLive = true,
  }) {
    if (!enabled || !isLive) {
      reset();
      return false;
    }
    final candidate = _candidate;
    final candidateAt = _candidateAt;
    reset();
    if (candidate != null &&
        candidateAt != null &&
        at >= candidateAt &&
        at - candidateAt <= window &&
        notation == _inverse(candidate) &&
        isSolved) {
      return true;
    }
    if (wasSolved && RegExp(r"^[URFDLB]'?$").hasMatch(notation)) {
      _candidate = notation;
      _candidateAt = at;
    }
    return false;
  }

  void reset() {
    _candidate = null;
    _candidateAt = null;
  }

  static String _inverse(String notation) => notation.endsWith("'")
      ? notation.substring(0, notation.length - 1)
      : "$notation'";
}
