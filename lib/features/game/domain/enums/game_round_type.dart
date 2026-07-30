enum GameRoundType {
  explain,
  mime,
  oneWord,
}

extension GameRoundTypeX on GameRoundType {
  String get title => switch (this) {
        GameRoundType.explain => 'Объяснение словами',
        GameRoundType.mime => 'Пантомима',
        GameRoundType.oneWord => 'Одно слово',
      };

  String get shortTitle => switch (this) {
        GameRoundType.explain => 'Словами',
        GameRoundType.mime => 'Жестами',
        GameRoundType.oneWord => 'Одним словом',
      };

  String get description => switch (this) {
        GameRoundType.explain =>
          'Объясняйте значение любыми словами, но не называйте само слово и однокоренные слова.',
        GameRoundType.mime =>
          'Показывайте слово движениями и мимикой. Разговаривать и издавать звуки нельзя.',
        GameRoundType.oneWord =>
          'Разрешена только одна короткая подсказка. После неё добавлять слова нельзя.',
      };
}
