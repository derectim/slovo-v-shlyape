import '../enums/game_round_type.dart';
import 'game_settings.dart';
import 'team.dart';
import 'word_card.dart';

class GameSession {
  GameSession({
    required this.teams,
    required this.settings,
  });

  final List<Team> teams;
  final GameSettings settings;
  final List<WordCard> allCards = [];
  final Map<String, List<String>> enteredWordsByPlayer = {};

  int currentRoundIndex = 0;
  int activeTeamIndex = 0;

  GameRoundType get currentRound => GameRoundType.values[currentRoundIndex];
  Team get activeTeam => teams[activeTeamIndex];
  bool get isFinalRound => currentRoundIndex == GameRoundType.values.length - 1;
}
