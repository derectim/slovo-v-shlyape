class GameSettings {
  const GameSettings({
    required this.wordsPerPlayer,
    required this.turnSeconds,
    this.skipPenalty = false,
  });

  final int wordsPerPlayer;
  final int turnSeconds;
  final bool skipPenalty;
}
