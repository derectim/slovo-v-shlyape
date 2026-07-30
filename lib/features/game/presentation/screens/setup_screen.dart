import 'package:flutter/material.dart';

import '../../../../core/constants/game_rules.dart';
import '../../domain/models/team_draft.dart';
import '../controllers/game_controller.dart';
import '../widgets/app_page.dart';
import '../widgets/primary_button.dart';
import 'word_entry_screen.dart';

class SetupScreen extends StatefulWidget {
  const SetupScreen({required this.controller, super.key});

  final GameController controller;

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final List<TeamDraft> _teams = [
    TeamDraft(name: 'Команда 1', playerNames: ['Игрок 1', 'Игрок 2']),
    TeamDraft(name: 'Команда 2', playerNames: ['Игрок 3', 'Игрок 4']),
  ];

  int _wordsPerPlayer = GameRules.defaultWordsPerPlayer;
  int _turnSeconds = GameRules.defaultTurnSeconds;

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: 'Настройка игры',
      bottom: PrimaryButton(
        label: 'Перейти к словам',
        icon: Icons.arrow_forward_rounded,
        onPressed: _continue,
      ),
      child: Form(
        key: _formKey,
        child: ListView(
          children: [
            const Text(
              'Команды и игроки',
              style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            Text(
              'Минимум две команды и по два игрока в каждой.',
              style: TextStyle(color: Colors.black.withValues(alpha: 0.56)),
            ),
            const SizedBox(height: 18),
            ...List.generate(_teams.length, _buildTeamCard),
            if (_teams.length < GameRules.maxTeams)
              OutlinedButton.icon(
                onPressed: _addTeam,
                icon: const Icon(Icons.add_rounded),
                label: const Text('Добавить команду'),
              ),
            const SizedBox(height: 28),
            const Text(
              'Правила партии',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 14),
            _NumberSetting(
              title: 'Слов от каждого игрока',
              value: _wordsPerPlayer,
              min: 3,
              max: 10,
              onChanged: (value) => setState(() => _wordsPerPlayer = value),
            ),
            const SizedBox(height: 12),
            _NumberSetting(
              title: 'Длительность хода',
              value: _turnSeconds,
              min: 30,
              max: 120,
              step: 15,
              suffix: ' сек.',
              onChanged: (value) => setState(() => _turnSeconds = value),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTeamCard(int index) {
    final team = _teams[index];
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    initialValue: team.name,
                    decoration: const InputDecoration(labelText: 'Название команды'),
                    validator: _requiredValidator,
                    onChanged: (value) => team.name = value,
                  ),
                ),
                if (_teams.length > GameRules.minTeams)
                  IconButton(
                    tooltip: 'Удалить команду',
                    onPressed: () => setState(() => _teams.removeAt(index)),
                    icon: const Icon(Icons.delete_outline_rounded),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            ...List.generate(team.playerNames.length, (playerIndex) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        initialValue: team.playerNames[playerIndex],
                        decoration: InputDecoration(labelText: 'Игрок ${playerIndex + 1}'),
                        validator: _requiredValidator,
                        onChanged: (value) => team.playerNames[playerIndex] = value,
                      ),
                    ),
                    if (team.playerNames.length > GameRules.minPlayersPerTeam)
                      IconButton(
                        onPressed: () => setState(() => team.playerNames.removeAt(playerIndex)),
                        icon: const Icon(Icons.remove_circle_outline_rounded),
                      ),
                  ],
                ),
              );
            }),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => setState(
                  () => team.playerNames.add('Игрок ${_nextPlayerNumber()}'),
                ),
                icon: const Icon(Icons.person_add_alt_1_rounded),
                label: const Text('Добавить игрока'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String? _requiredValidator(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Заполните поле';
    }
    return null;
  }

  int _nextPlayerNumber() {
    return _teams.fold<int>(0, (sum, team) => sum + team.playerNames.length) + 1;
  }

  void _addTeam() {
    setState(() {
      final number = _teams.length + 1;
      final firstPlayer = _nextPlayerNumber();
      _teams.add(
        TeamDraft(
          name: 'Команда $number',
          playerNames: ['Игрок $firstPlayer', 'Игрок ${firstPlayer + 1}'],
        ),
      );
    });
  }

  void _continue() {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    widget.controller.createGame(
      drafts: _teams,
      wordsPerPlayer: _wordsPerPlayer,
      turnSeconds: _turnSeconds,
    );

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => WordEntryScreen(controller: widget.controller),
      ),
    );
  }
}

class _NumberSetting extends StatelessWidget {
  const _NumberSetting({
    required this.title,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
    this.step = 1,
    this.suffix = '',
  });

  final String title;
  final int value;
  final int min;
  final int max;
  final int step;
  final String suffix;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700))),
          IconButton(
            onPressed: value - step >= min ? () => onChanged(value - step) : null,
            icon: const Icon(Icons.remove_circle_outline_rounded),
          ),
          SizedBox(
            width: 72,
            child: Text(
              '$value$suffix',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
            ),
          ),
          IconButton(
            onPressed: value + step <= max ? () => onChanged(value + step) : null,
            icon: const Icon(Icons.add_circle_outline_rounded),
          ),
        ],
      ),
    );
  }
}
