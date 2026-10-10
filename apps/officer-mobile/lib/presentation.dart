import 'package:flutter/material.dart';

const defaultCurrency = 'USD';
String formatCurrency(dynamic value, [String? currency]) {
  final amount = (num.tryParse('$value') ?? 0).toStringAsFixed(2);
  final parts = amount.split('.');
  final grouped = parts[0]
      .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
  final code = currency ?? defaultCurrency;
  return '${code == 'USD' ? r'US$' : '$code '}$grouped.${parts[1]}';
}

String paymentMethodLabel(dynamic method) =>
    const {
      'ECOCASH': 'EcoCash',
      'INNBUCKS': 'InnBucks',
      'CARD': 'Bank Card'
    }[method] ??
    'Payment';
String ticketLabel(dynamic ticket) =>
    ticket['displayReference'] ?? 'Traffic ticket';
Color paymentAccent(dynamic status) => switch (status) {
      'PAID' || 'SUCCESS' => const Color(0xff28724f),
      'OVERDUE' || 'FAILED' => const Color(0xffb74136),
      'PENDING' || 'PROCESSING' => const Color(0xffad7b16),
      _ => const Color(0xff9eacb7)
    };
String readable(String value) => value
    .toLowerCase()
    .split('_')
    .map((word) =>
        word.isEmpty ? '' : '${word[0].toUpperCase()}${word.substring(1)}')
    .join(' ');
String statusLabel(String value, {bool incident = false}) {
  if (incident && value == 'OPEN') return 'Submitted';
  if (incident && value == 'IN_PROGRESS') return 'Under review';
  return value == 'SUCCESS' ? 'Paid' : readable(value);
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.value, {this.incident = false, super.key});
  final String value;
  final bool incident;
  @override
  Widget build(BuildContext context) => Chip(
      backgroundColor: [
        'PAID',
        'SUCCESS',
        'CONFIRMED',
        'RESOLVED',
        'VERIFIED',
        'APPROVED',
        'REGISTERED'
      ].contains(value)
          ? const Color(0xffe1f0e7)
          : ['OVERDUE', 'FAILED', 'TIMED_OUT', 'CANCELLED'].contains(value)
              ? const Color(0xfffbe6e3)
              : ['PENDING', 'PROCESSING', 'SUBMITTED'].contains(value)
                  ? const Color(0xfffff1cc)
                  : const Color(0xffe8eff4),
      labelStyle: TextStyle(
          color: [
            'PAID',
            'SUCCESS',
            'CONFIRMED',
            'RESOLVED',
            'VERIFIED',
            'APPROVED',
            'REGISTERED'
          ].contains(value)
              ? const Color(0xff235c3c)
              : ['OVERDUE', 'FAILED', 'TIMED_OUT', 'CANCELLED'].contains(value)
                  ? const Color(0xff8b3026)
                  : const Color(0xff142d40),
          fontWeight: FontWeight.w600),
      label: Text(statusLabel(value, incident: incident)),
      visualDensity: VisualDensity.compact);
}
