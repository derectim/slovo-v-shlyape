import 'dart:math';

import 'package:flutter/foundation.dart';

import '../../../../core/utils/id_generator.dart';
import '../../data/game_repository.dart';
import '../../domain/models/game_session.dart';
import '../../domain/models/game_settings.dart';
import '../../domain/models/player.dart';
import '../../domain/models/team.dart';
import '../../domain/models/team_draft.dart';
import '../../domain/models/word_card.dart';

class GameController extends ChangeNotifier {
  GameController(this._repository);

  final GameRepository _repository;
  final Random _random = Random();

  GameSession? _session;
  List<WordCard> _remainingCards = [];
  WordCard? _currentCard;
  int _wordEntryPlayerIndex = 0;
  int _turnGuessedCount = 0;

  GameSession? get session => _session;
  WordCard? get currentCard => _currentCard;
  int get remainingCardsCount => _remainingCards.length + (_currentCard == null ? 0 : 1);
  int get wordEntryPlayerIndex => _wordEntryPlayerIndex;
  int get turnGuessedCount => _turnGuessedCount;

  List<Player> get allPlayers {
    final session = _requireSession();
    return session.teams.expand((team) => team.players).toList(growable: false);
  }

  Player get currentWordEntryPlayer => allPlayers[_wordEntryPlayerIndex];

  void createGame({
    required List<TeamDraft> drafts,
    required int wordsPerPlayer,
    required int turnSeconds,
  }) {
    final teams = drafts.map((draft) {
      final players = draft.playerNames
          .where((name) => name.trim().isNotEmpty)
          .map(
            (name) => Player(
              id: IdGenerator.next('player'),
              name: name.trim(),
            ),
          )
          .toList();

      return Team(
        id: IdGenerator.next('team'),
        name: draft.name.trim(),
        players: players,
      );
    }).toList();

    _session = GameSession(
      teams: teams,
      settings: GameSettings(
        wordsPerPlayer: wordsPerPlayer,
        turnSeconds: turnSeconds,
      ),
    );
    _wordEntryPlayerIndex = 0;
    _remainingCards = [];
    _currentCard = null;
    _repository.saveSession(_session!);
    notifyListeners();
  }

  bool submitWordsForCurrentPlayer(List<String> words) {
    final session = _requireSession();
    final player = currentWordEntryPlayer;
    final normalized = words
        .map((word) => word.trim())
        .where((word) => word.isNotEmpty)
        .toList();

    if (normalized.length != session.settings.wordsPerPlayer) {
      return false;
    }

    session.enteredWordsByPlayer[player.id] = normalized;
    final isLastPlayer = _wordEntryPlayerIndex == allPlayers.length - 1;

    if (isLastPlayer) {
      _buildCards();
      _prepareRoundDeck();
    } else {
      _wordEntryPlayerIndex += 1;
    }

    _repository.saveSession(session);
    notifyListeners();
    return true;
  }

  void _buildCards() {
    final session = _requireSession();
    session.allCards.clear();

    for (final entry in session.enteredWordsByPlayer.entries) {
      for (final word in entry.value) {
        session.allCards.add(
          WordCard(
            id: IdGenerator.next('card'),
            value: word,
            authorPlayerId: entry.key,
          ),
        );
      }
    }
  }

  void startTurn() {
    _turnGuessedCount = 0;
    _drawCard();
    notifyListeners();
  }

  bool markCurrentCardGuessed() {
    final session = _requireSession();
    if (_currentCard == null) return false;

    session.activeTeam.addPoint(session.currentRoundIndex);
    _turnGuessedCount += 1;
    _currentCard = null;

    final roundCompleted = _remainingCards.isEmpty;
    if (!roundCompleted) {
      _drawCard();
    }

    _repository.saveSession(session);
    notifyListeners();
    return roundCompleted;
  }

  void skipCurrentCard() {
    if (_currentCard == null) return;

    final skipped = _currentCard!;
    _currentCard = null;

    if (_remainingCards.isEmpty) {
      _remainingCards.add(skipped);
    } else {
      final insertionIndex = _random.nextInt(_remainingCards.length + 1);
      _remainingCards.insert(insertionIndex, skipped);
    }

    _drawCard();
    notifyListeners();
  }

  void finishTurn() {
    final session = _requireSession();

    if (_currentCard != null) {
      _remainingCards.add(_currentCard!);
      _currentCard = null;
      _remainingCards.shuffle(_random);
    }

    session.activeTeam.moveToNextExplainer();
    session.activeTeamIndex = (session.activeTeamIndex + 1) % session.teams.length;
    _turnGuessedCount = 0;
    _repository.saveSession(session);
    notifyListeners();
  }

  bool moveToNextRound() {
    final session = _requireSession();
    if (session.isFinalRound) return false;

    session.currentRoundIndex += 1;
    session.activeTeamIndex = 0;
    _prepareRoundDeck();
    _repository.saveSession(session);
    notifyListeners();
    return true;
  }

  Future<void> resetGame() async {
    _session = null;
    _remainingCards = [];
    _currentCard = null;
    _wordEntryPlayerIndex = 0;
    _turnGuessedCount = 0;
    await _repository.clearSession();
    notifyListeners();
  }

  List<Team> get ranking {
    final teams = [..._requireSession().teams];
    teams.sort((a, b) => b.totalScore.compareTo(a.totalScore));
    return teams;
  }

  void _prepareRoundDeck() {
    final session = _requireSession();
    _remainingCards = [...session.allCards]..shuffle(_random);
    _currentCard = null;
  }

  void _drawCard() {
    if (_remainingCards.isEmpty) {
      _currentCard = null;
      return;
    }
    _currentCard = _remainingCards.removeLast();
  }

  GameSession _requireSession() {
    final session = _session;
    if (session == null) {
      throw StateError('Игра ещё не создана.');
    }
    return session;
  }
}
