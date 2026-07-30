import '../domain/models/game_session.dart';
import 'game_repository.dart';

class MemoryGameRepository implements GameRepository {
  GameSession? _session;

  @override
  Future<void> saveSession(GameSession session) async {
    _session = session;
  }

  @override
  Future<GameSession?> loadSession() async => _session;

  @override
  Future<void> clearSession() async {
    _session = null;
  }
}
