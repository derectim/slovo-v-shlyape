import 'package:flutter/material.dart';

import '../controllers/game_controller.dart';
import '../widgets/app_page.dart';
import '../widgets/primary_button.dart';
import 'round_intro_screen.dart';

class WordEntryScreen extends StatefulWidget {
  const WordEntryScreen({required this.controller, super.key});

  final GameController controller;

  @override
  State<WordEntryScreen> createState() => _WordEntryScreenState();
}

class _WordEntryScreenState extends State<WordEntryScreen> {
  final List<TextEditingController> _wordControllers = [];

  @override
  void initState() {
    super.initState();
    _rebuildControllers();
  }

  @override
  void dispose() {
    for (final controller in _wordControllers) {
      controller.dispose();
    }
    super.dispose();
  }

  void _rebuildControllers() {
    for (final controller in _wordControllers) {
      controller.dispose();
    }
    _wordControllers
      ..clear()
      ..addAll(
        List.generate(
          widget.controller.session!.settings.wordsPerPlayer,
          (_) => TextEditingController(),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final player = widget.controller.currentWordEntryPlayer;
    final totalPlayers = widget.controller.allPlayers.length;
    final currentNumber = widget.controller.wordEntryPlayerIndex + 1;

    return AppPage(
      title: 'Слова игроков',
      bottom: PrimaryButton(
        label: currentNumber == totalPlayers ? 'Перемешать слова' : 'Передать телефон',
        icon: currentNumber == totalPlayers
            ? Icons.shuffle_rounded
            : Icons.arrow_forward_rounded,
        onPressed: _submit,
      ),
      child: ListView(
        children: [
          LinearProgressIndicator(value: currentNumber / totalPlayers),
          const SizedBox(height: 28),
          Text(
            '${player.name}, ваш ход',
            style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          Text(
            'Введите слова так, чтобы остальные участники их не увидели.',
            style: TextStyle(color: Colors.black.withValues(alpha: 0.58), fontSize: 16),
          ),
          const SizedBox(height: 24),
          ...List.generate(_wordControllers.length, (index) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: TextField(
                controller: _wordControllers[index],
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  labelText: 'Слово ${index + 1}',
                  prefixIcon: const Icon(Icons.style_rounded),
                ),
              ),
            );
          }),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.secondaryContainer,
              borderRadius: BorderRadius.circular(18),
            ),
            child: const Text(
              'Лучше использовать существительные, персонажей, места, профессии или смешные понятия.',
            ),
          ),
        ],
      ),
    );
  }

  void _submit() {
    final words = _wordControllers.map((controller) => controller.text).toList();
    final accepted = widget.controller.submitWordsForCurrentPlayer(words);

    if (!accepted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Заполните все слова.')),
      );
      return;
    }

    final allWordsEntered = widget.controller.session!.allCards.isNotEmpty;
    if (allWordsEntered) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => RoundIntroScreen(controller: widget.controller),
        ),
      );
      return;
    }

    setState(_rebuildControllers);
  }
}
