import 'package:flutter/material.dart';

import '../controllers/game_controller.dart';
import '../widgets/app_page.dart';
import '../widgets/primary_button.dart';
import 'game_results_screen.dart';
import 'round_intro_screen.dart';

class RoundResultsScreen extends StatelessWidget {
  const RoundResultsScreen({required this.controller, super.key});

  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final session = controller.session!;
    final roundIndex = session.currentRoundIndex;
    final sorted = [...session.teams]
      ..sort((a, b) => b.roundScores[roundIndex].compareTo(a.roundScores[roundIndex]));

    return AppPage(
      showBackButton: false,
      bottom: PrimaryButton(
        label: session.isFinalRound ? 'Показать победителей' : 'Следующий раунд',
        icon: session.isFinalRound ? Icons.emoji_events_rounded : Icons.arrow_forward_rounded,
        onPressed: () {
          if (session.isFinalRound) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(
                builder: (_) => GameResultsScreen(controller: controller),
              ),
            );
          } else {
            controller.moveToNextRound();
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(
                builder: (_) => RoundIntroScreen(controller: controller),
              ),
            );
          }
        },
      ),
      child: ListView(
        children: [
          const SizedBox(height: 26),
          Icon(
            Icons.flag_circle_rounded,
            size: 86,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(height: 18),
          Text(
            'Раунд ${roundIndex + 1} завершён',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          Text(
            session.currentRound.title,
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.black.withValues(alpha: 0.55), fontSize: 17),
          ),
          const SizedBox(height: 28),
          ...List.generate(sorted.length, (index) {
            final team = sorted[index];
            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
                child: Row(
                  children: [
                    SizedBox(
                      width: 38,
                      child: Text(
                        '${index + 1}',
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        team.name,
                        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                      ),
                    ),
                    Text(
                      '${team.roundScores[roundIndex]}',
                      style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}
