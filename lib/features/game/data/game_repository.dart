import '../domain/models/game_session.dart';

abstract interface class GameRepository {
  Future<void> saveSession(GameSession session);
  Future<GameSession?> loadSession();
  Future<void> clearSession();
}
