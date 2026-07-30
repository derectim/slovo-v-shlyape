class IdGenerator {
  static int _counter = 0;

  static String next(String prefix) {
    _counter += 1;
    return '${prefix}_${DateTime.now().microsecondsSinceEpoch}_$_counter';
  }
}
