import 'package:flutter/material.dart';

import '../../domain/models/team.dart';

class Scoreboard extends StatelessWidget {
  const Scoreboard({required this.teams, this.highlightTeamId, super.key});

  final List<Team> teams;
  final String? highlightTeamId;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: teams.map((team) {
        final highlighted = team.id == highlightTeamId;
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: highlighted
                ? Theme.of(context).colorScheme.primaryContainer
                : Colors.white,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  team.name,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
              ),
              Text(
                '${team.totalScore}',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}
