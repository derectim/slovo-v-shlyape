import 'package:flutter/material.dart';

import '../controllers/game_controller.dart';
import '../widgets/primary_button.dart';
import 'setup_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({required this.controller, super.key});

  final GameController controller;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 142,
                height: 142,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.theater_comedy_rounded,
                  size: 78,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
              const SizedBox(height: 28),
              const Text(
                'Слово\nв шляпе',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 44,
                  height: 0.95,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Объясняй, показывай и угадывай вместе с друзьями',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 17,
                  height: 1.35,
                  color: Colors.black.withValues(alpha: 0.58),
                ),
              ),
              const Spacer(),
              PrimaryButton(
                label: 'Новая игра',
                icon: Icons.play_arrow_rounded,
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => SetupScreen(controller: controller),
                    ),
                  );
                },
              ),
              const SizedBox(height: 12),
              TextButton.icon(
                onPressed: () => _showRules(context),
                icon: const Icon(Icons.menu_book_rounded),
                label: const Text('Как играть'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showRules(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => const Padding(
        padding: EdgeInsets.fromLTRB(24, 8, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Три раунда', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
            SizedBox(height: 18),
            Text('1. Объясняйте слова, не называя их.'),
            SizedBox(height: 10),
            Text('2. Показывайте те же слова жестами.'),
            SizedBox(height: 10),
            Text('3. Давайте только одну словесную подсказку.'),
          ],
        ),
      ),
    );
  }
}
