import 'package:flutter/material.dart';
import 'role_workspace.dart';

String remainingPoints(dynamic points) => points?['status'] == 'VERIFIED'
    ? '${points['remaining']} / ${points['allowance']}'
    : 'Identity pending';
String ticketPoints(Map<String, dynamic> ticket) =>
    ticket['driverIdentification'] == 'ASSESSED'
        ? '${ticket['pointsDeducted'] ?? 0} points deducted'
        : ticket['driverIdentification'] == 'LEGACY_NOT_ASSESSED'
            ? 'Historical points not reassessed'
            : 'Pending driver identification';

class DriverIdentification extends StatefulWidget {
  const DriverIdentification(
      {required this.api, required this.onChanged, super.key});
  final AccountApi api;
  final ValueChanged<String?> onChanged;
  @override
  State<DriverIdentification> createState() => _DriverIdentificationState();
}

class _DriverIdentificationState extends State<DriverIdentification> {
  final licence = TextEditingController();
  Map<String, dynamic>? driver;
  String error = '';
  bool busy = false, checked = false;
  @override
  void dispose() {
    licence.dispose();
    super.dispose();
  }

  Future<void> lookup() async {
    setState(() {
      busy = true;
      error = '';
      driver = null;
      checked = false;
    });
    widget.onChanged(null);
    try {
      final result = await widget.api(
          '/drivers/verified?licenceNumber=${Uri.encodeQueryComponent(licence.text.trim())}');
      if (mounted) {
        setState(() {
          driver = Map<String, dynamic>.from(result);
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Responsible driver',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const Text(
                'Ownership does not establish responsibility. Identify the actual driver or leave points pending.'),
            const SizedBox(height: 12),
            TextField(
                controller: licence,
                enabled: !busy,
                maxLength: 80,
                decoration:
                    const InputDecoration(labelText: 'Driver licence number'),
                onChanged: (_) {
                  setState(() {
                    checked = false;
                    driver = null;
                  });
                  widget.onChanged(null);
                }),
            OutlinedButton(
                onPressed: busy ? null : lookup,
                child: const Text('Find verified driver')),
            if (error.isNotEmpty) Text(error),
            if (driver != null) ...[
              Text('${driver!['fullName']} · ${driver!['licenceStatus']}'),
              CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: checked,
                  onChanged: (value) {
                    setState(() {
                      checked = value!;
                    });
                    widget.onChanged(checked ? driver!['id'] : null);
                  },
                  title:
                      const Text('I verified this is the responsible driver.'))
            ],
            if (!checked)
              const Text('Pending driver identification — no points deducted.'),
          ])));
}

class PointsHistory extends StatelessWidget {
  const PointsHistory({required this.balance, super.key});
  final dynamic balance;
  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(16),
          child: balance?['status'] != 'VERIFIED'
              ? const Text(
                  'Driver identity verification pending. Vehicle ownership does not assign driver points.')
              : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Points Remaining: ${remainingPoints(balance)}',
                      style: const TextStyle(
                          fontSize: 20, fontWeight: FontWeight.bold)),
                  Text(
                      '${balance['totalDeducted']} total deducted. Payment does not restore points. Historical tickets are not backfilled.'),
                  ExpansionTile(title: const Text('Points history'), children: [
                    for (final entry in balance['history'])
                      ListTile(
                          title: Text(
                              '${entry['reference']} · ${entry['delta']} points'),
                          subtitle: Text('${entry['reason']}\n${entry['at']}'))
                  ]),
                ])));
}
