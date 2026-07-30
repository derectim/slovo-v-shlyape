import 'dart:async';

import 'package:flutter/material.dart';

import '../controllers/game_controller.dart';
import '../widgets/primary_button.dart';
import 'round_intro_screen.dart';
import 'round_results_screen.dart';

class TurnScreen extends StatefulWidget {
  const TurnScreen({required this.controller, super.key});

  final GameController controller;

  @override
  State<TurnScreen> createState() => _TurnScreenState();
}

class _TurnScreenState extends State<TurnScreen> {
  Timer? _timer;
  late int _secondsLeft;
  bool _finishing = false;

  @override
  void initState() {
    super.initState();
    _secondsLeft = widget.controller.session!.settings.turnSeconds;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _finishing) return;
      if (_secondsLeft <= 1) {
        _finishTurn(roundCompleted: false);
      } else {
        setState(() => _secondsLeft -= 1);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.controller.session!;
    final progress = _secondsLeft / session.settings.turnSeconds;

    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: AnimatedBuilder(
            animation: widget.controller,
            builder: (context, _) {
              final card = widget.controller.currentCard;
              return Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: LinearProgressIndicator(
                              value: progress,
                              minHeight: 12,
                            ),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Text(
                          '$_secondsLeft',
                          style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(session.activeTeam.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                        Text('Осталось: ${widget.controller.remainingCardsCount}'),
                      ],
                    ),
                    const Spacer(),
                    Container(
                      width: double.infinity,
                      constraints: const BoxConstraints(minHeight: 250),
                      padding: const EdgeInsets.all(28),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(32),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.06),
                            blurRadius: 30,
                            offset: const Offset(0, 12),
                          ),
                        ],
                      ),
                      child: Center(
                        child: Text(
                          card?.value ?? 'Раунд завершён',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 42,
                            height: 1.05,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Угадано за ход: ${widget.controller.turnGuessedCount}',
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                    ),
                    const Spacer(),
                    Row(
                      children: [
                        Expanded(
                          child: SizedBox(
                            height: 62,
                            child: OutlinedButton.icon(
                              onPressed: _finishing ? null : widget.controller.skipCurrentCard,
                              icon: const Icon(Icons.redo_rounded),
                              label: const Text('Пропустить'),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 2,
                          child: PrimaryButton(
                            label: 'Угадано',
                            icon: Icons.check_rounded,
                            onPressed: _finishing
                                ? null
                                : () {
                                    final completed = widget.controller.markCurrentCardGuessed();
                                    if (completed) {
                                      _finishTurn(roundCompleted: true);
                                    }
                                  },
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  void _finishTurn({required bool roundCompleted}) {
    if (_finishing) return;
    _finishing = true;
    _timer?.cancel();
    widget.controller.finishTurn();

    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => roundCompleted
            ? RoundResultsScreen(controller: widget.controller)
            : RoundIntroScreen(controller: widget.controller),
      ),
    );
  }
}
