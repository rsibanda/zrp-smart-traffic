import 'package:flutter/material.dart';

String readable(String value) => value
    .toLowerCase()
    .split('_')
    .map((word) =>
        word.isEmpty ? '' : '${word[0].toUpperCase()}${word.substring(1)}')
    .join(' ');

String statusLabel(String value, {bool incident = false}) {
  if (incident && value == 'OPEN') return 'Submitted';
  if (incident && value == 'IN_PROGRESS') return 'Under review';
  return readable(value);
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.value, {this.incident = false, super.key});
  final String value;
  final bool incident;
  @override
  Widget build(BuildContext context) => Chip(
      label: Text(statusLabel(value, incident: incident)),
      visualDensity: VisualDensity.compact);
}
