import 'package:flutter/material.dart';

import '../controllers/game_controller.dart';
import '../widgets/app_page.dart';
import '../widgets/primary_button.dart';
import '../widgets/scoreboard.dart';
import 'turn_screen.dart';

class RoundIntroScreen extends StatelessWidget {
  const RoundIntroScreen({required this.controller, super.key});

  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final session = controller.session!;
    final round = session.currentRound;
    final team = session.activeTeam;
    final player = team.currentExplainer;

    return AppPage(
      showBackButton: false,
      bottom: PrimaryButton(
        label: 'Начать ход',
        icon: Icons.timer_rounded,
        onPressed: () {
          controller.startTurn();
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(
              builder: (_) => TurnScreen(controller: controller),
            ),
          );
        },
      ),
      child: ListView(
        children: [
          const SizedBox(height: 12),
          Text(
            'Раунд ${session.currentRoundIndex + 1} из 3',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Theme.of(context).colorScheme.primary,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            round.title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
            ),
            child: Text(
              round.description,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, height: 1.45),
            ),
          ),
          const SizedBox(height: 28),
          Text(
            'Сейчас играет',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.black.withValues(alpha: 0.5)),
          ),
          const SizedBox(height: 8),
          Text(
            team.name,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 4),
          Text(
            'Объясняет: ${player.name}',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 28),
          Scoreboard(teams: session.teams, highlightTeamId: team.id),
        ],
      ),
    );
  }
}
