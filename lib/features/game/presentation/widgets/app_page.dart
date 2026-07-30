import 'package:flutter/material.dart';

class AppPage extends StatelessWidget {
  const AppPage({
    required this.child,
    this.title,
    this.bottom,
    this.showBackButton = true,
    super.key,
  });

  final Widget child;
  final String? title;
  final Widget? bottom;
  final bool showBackButton;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: title == null
          ? null
          : AppBar(
              automaticallyImplyLeading: showBackButton,
              title: Text(title!),
            ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: child,
        ),
      ),
      bottomNavigationBar: bottom == null
          ? null
          : SafeArea(
              minimum: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: bottom!,
            ),
    );
  }
}
