import 'player.dart';

class Team {
  Team({
    required this.id,
    required this.name,
    required this.players,
  });

  final String id;
  final String name;
  final List<Player> players;
  final List<int> roundScores = [0, 0, 0];
  int explainerCursor = 0;

  Player get currentExplainer => players[explainerCursor % players.length];

  int get totalScore => roundScores.fold(0, (sum, score) => sum + score);

  void addPoint(int roundIndex) {
    roundScores[roundIndex] += 1;
  }

  void moveToNextExplainer() {
    explainerCursor = (explainerCursor + 1) % players.length;
  }
}
