import 'dart:async';
import 'package:flutter/material.dart';
import 'presentation.dart';
import 'role_workspace.dart';

class VehicleApprovals extends StatefulWidget {
  const VehicleApprovals({required this.api, this.onChanged, super.key});
  final AccountApi api;
  final VoidCallback? onChanged;
  @override
  State<VehicleApprovals> createState() => _VehicleApprovalsState();
}

class _VehicleApprovalsState extends State<VehicleApprovals> {
  List<dynamic> rows = [];
  int page = 1, total = 0;
  String error = '';
  bool busy = false, viewing = false;
  Timer? timer;
  static const base = '/supervisor/vehicle-link-requests';
  @override
  void initState() {
    super.initState();
    unawaited(load());
    timer =
        Timer.periodic(const Duration(seconds: 10), (_) => unawaited(load()));
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    if (busy || viewing) return;
    busy = true;
    try {
      final result = await widget.api('$base?page=$page&pageSize=10');
      if (mounted) {
        setState(() {
          rows = result['items'];
          total = result['total'];
          error = '';
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> open(Map<String, dynamic> request) async {
    if (busy || viewing) return;
    setState(() {
      busy = true;
      viewing = true;
      error = '';
    });
    try {
      final detail = await widget.api('$base/${request['id']}');
      if (!mounted) return;
      setState(() => busy = false);
      final changed = await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (_) => _ApprovalDialog(
              api: widget.api, detail: Map<String, dynamic>.from(detail)));
      if (changed == true && mounted) widget.onChanged?.call();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
          viewing = false;
        });
        await load();
      }
    }
  }

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Pending Vehicle Approvals',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        const Text('Requests and decisions',
            style: TextStyle(color: Color(0xff52677b))),
        if (busy) const LinearProgressIndicator(),
        if (error.isNotEmpty) Semantics(liveRegion: true, child: Text(error)),
        if (rows.isEmpty && !busy)
          const Padding(
              padding: EdgeInsets.all(16),
              child: Text('No vehicle requests found.')),
        for (final row in rows)
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(row['registration'],
                            style: const TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 17)),
                        const SizedBox(height: 6),
                        Text(row['motorist']['name']),
                        if (row['vehicle'] != null)
                          Text(
                              '${row['vehicle']['make']} ${row['vehicle']['model']}'),
                        Text(
                            '${readable(row['kind'])} request · ${_date(row['submittedAt'])}'),
                        const SizedBox(height: 8),
                        StatusBadge(row['status'] == 'VERIFIED'
                            ? 'APPROVED'
                            : row['status']),
                        Align(
                            alignment: Alignment.centerRight,
                            child: OutlinedButton(
                                onPressed: busy
                                    ? null
                                    : () =>
                                        open(Map<String, dynamic>.from(row)),
                                child: const Text('View Request'))),
                      ]))),
        if (total > 10)
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            TextButton(
                onPressed: page == 1 || busy
                    ? null
                    : () {
                        page--;
                        unawaited(load());
                      },
                child: const Text('Previous requests')),
            Text('Page $page'),
            TextButton(
                onPressed: page * 10 >= total || busy
                    ? null
                    : () {
                        page++;
                        unawaited(load());
                      },
                child: const Text('Next requests')),
          ]),
      ]);
}

String _date(dynamic value) => value == null
    ? 'Not recorded'
    : DateTime.tryParse(value.toString())
            ?.toLocal()
            .toString()
            .split('.')
            .first ??
        'Not recorded';

class _ApprovalDialog extends StatefulWidget {
  const _ApprovalDialog({required this.api, required this.detail});
  final AccountApi api;
  final Map<String, dynamic> detail;
  @override
  State<_ApprovalDialog> createState() => _ApprovalDialogState();
}

class _ApprovalDialogState extends State<_ApprovalDialog> {
  final note = TextEditingController();
  final form = GlobalKey<FormState>();
  bool checked = false, saving = false;
  String decision = '', error = '';
  @override
  void dispose() {
    note.dispose();
    super.dispose();
  }

  void choose(String value) {
    if (!form.currentState!.validate()) return;
    if (!checked) {
      setState(() => error = 'Confirm that you have checked the request.');
      return;
    }
    setState(() {
      decision = value;
      error = '';
    });
  }

  Future<void> save() async {
    if (saving) return;
    setState(() {
      saving = true;
      error = '';
    });
    try {
      await widget.api(
          '/supervisor/vehicle-link-requests/${widget.detail['id']}/review',
          {'status': decision, 'note': note.text.trim(), 'checked': checked});
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          decision = '';
        });
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.detail, v = widget.detail['vehicle'];
    final conflict = d['linkedToAnotherMotorist'] == true;
    return PopScope(
        canPop: !saving,
        child: AlertDialog(
          title: Text(decision.isEmpty
              ? 'Vehicle Request Details'
              : decision == 'VERIFIED'
                  ? 'Approve Vehicle Request?'
                  : 'Reject Vehicle Request?'),
          content: SizedBox(
              width: 440,
              child: SingleChildScrollView(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text('${d['registration']} · ${d['motorist']['name']}',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (error.isNotEmpty)
                      Semantics(
                          liveRegion: true,
                          child: Text(error,
                              style:
                                  const TextStyle(color: Color(0xffad2929)))),
                    const SizedBox(height: 12),
                    if (decision.isNotEmpty) ...[
                      Text(decision == 'REJECTED'
                          ? 'This will reject the request without changing the vehicle account link.'
                          : d['kind'] == 'LINK'
                              ? 'This will link the vehicle to the motorist account.'
                              : 'This will remove the vehicle link from the motorist account.'),
                      Text('Decision note: ${note.text}'),
                    ] else ...[
                      Text('Account reference: ${d['motorist']['email']}'),
                      Text('Submitted: ${_date(d['submittedAt'])}'),
                      Text('Request: ${readable(d['kind'])}'),
                      StatusBadge(
                          d['status'] == 'VERIFIED' ? 'APPROVED' : d['status']),
                      const Divider(),
                      Text(v == null
                          ? 'No internal vehicle record'
                          : '${v['make']} ${v['model']} · ${v['colour']}'),
                      Text(
                          'Registration status: ${v?['registrationStatus'] ?? 'Not recorded'}'),
                      Text(
                          'Ownership verification: ${readable(d['ownershipStatus'] ?? 'PENDING')}'),
                      Text(
                          'Linked to another motorist: ${conflict ? 'Yes — approval unavailable' : 'No'}'),
                      const SizedBox(height: 12),
                      const Text('Request history',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                      for (final h in d['history'] ?? [])
                        Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Text(
                                '${_date(h['submittedAt'])} · ${readable(h['status'] == 'VERIFIED' ? 'APPROVED' : h['status'])}\n${h['reviewer']?['name'] ?? ''} ${h['reviewNote'] ?? ''}')),
                      if (d['status'] == 'PENDING')
                        Form(
                            key: form,
                            child: Column(children: [
                              TextFormField(
                                  controller: note,
                                  minLines: 2,
                                  maxLines: 3,
                                  maxLength: 500,
                                  decoration: const InputDecoration(
                                      labelText: 'Review note',
                                      hintText:
                                          'Record ownership checks and your decision'),
                                  validator: (s) => (s?.trim().length ?? 0) < 3
                                      ? 'Enter at least 3 characters.'
                                      : null),
                              CheckboxListTile(
                                  contentPadding: EdgeInsets.zero,
                                  value: checked,
                                  onChanged: (v) =>
                                      setState(() => checked = v ?? false),
                                  title: const Text(
                                      'I have checked this request and supporting account information.')),
                              Wrap(spacing: 8, children: [
                                OutlinedButton(
                                    onPressed: () => choose('REJECTED'),
                                    child: const Text('Reject')),
                                FilledButton(
                                    onPressed: v == null || conflict
                                        ? null
                                        : () => choose('VERIFIED'),
                                    child: Text(d['kind'] == 'LINK'
                                        ? 'Approve Vehicle'
                                        : 'Approve Unlink'))
                              ]),
                            ])),
                    ],
                  ]))),
          actions: [
            TextButton(
                onPressed: saving ? null : () => Navigator.pop(context),
                child: const Text('Close request')),
            if (decision.isNotEmpty) ...[
              TextButton(
                  onPressed:
                      saving ? null : () => setState(() => decision = ''),
                  child: const Text('Back')),
              FilledButton(
                  onPressed: saving ? null : save,
                  child: Text(saving
                      ? 'Saving…'
                      : decision == 'VERIFIED'
                          ? 'Approve'
                          : 'Confirm Rejection'))
            ]
          ],
        ));
  }
}
