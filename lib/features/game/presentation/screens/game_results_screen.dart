import 'package:flutter/material.dart';

import '../controllers/game_controller.dart';
import '../widgets/app_page.dart';
import '../widgets/primary_button.dart';
import 'home_screen.dart';

class GameResultsScreen extends StatelessWidget {
  const GameResultsScreen({required this.controller, super.key});

  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final ranking = controller.ranking;
    final winner = ranking.first;

    return AppPage(
      showBackButton: false,
      bottom: PrimaryButton(
        label: 'На главный экран',
        icon: Icons.home_rounded,
        onPressed: () async {
          await controller.resetGame();
          if (!context.mounted) return;
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(builder: (_) => HomeScreen(controller: controller)),
            (_) => false,
          );
        },
      ),
      child: ListView(
        children: [
          const SizedBox(height: 20),
          const Text(
            '🏆',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 88),
          ),
          const SizedBox(height: 10),
          const Text(
            'Победители',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 34, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          Text(
            winner.name,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 30,
              fontWeight: FontWeight.w900,
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '${winner.totalScore} очков',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 30),
          ...List.generate(ranking.length, (index) {
            final team = ranking[index];
            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    Text(
                      '${index + 1}',
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            team.name,
                            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            team.roundScores.join(' + '),
                            style: TextStyle(color: Colors.black.withValues(alpha: 0.5)),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      '${team.totalScore}',
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
