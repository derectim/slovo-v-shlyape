import 'package:flutter/material.dart';

import '../features/game/data/memory_game_repository.dart';
import '../features/game/presentation/controllers/game_controller.dart';
import '../features/game/presentation/screens/home_screen.dart';
import 'theme.dart';

class WordInHatApp extends StatefulWidget {
  const WordInHatApp({super.key});

  @override
  State<WordInHatApp> createState() => _WordInHatAppState();
}

class _WordInHatAppState extends State<WordInHatApp> {
  late final GameController _controller;

  @override
  void initState() {
    super.initState();
    _controller = GameController(MemoryGameRepository());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Слово в шляпе',
      theme: buildAppTheme(),
      home: HomeScreen(controller: _controller),
    );
  }
}
