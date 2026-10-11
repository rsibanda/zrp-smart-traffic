import 'dart:async';
import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import 'presentation.dart';
import 'motorist_ledger.dart';
import 'supervisor_shell.dart';

typedef AccountApi = Future<dynamic> Function(String path,
    [Map<String, dynamic>? body, String method, String? accessToken]);

class RoleWorkspace extends StatefulWidget {
  const RoleWorkspace(
      {required this.role,
      required this.identity,
      required this.accountId,
      required this.api,
      required this.onLogout,
      super.key});
  final String role, identity, accountId;
  final AccountApi api;
  final Future<void> Function() onLogout;
  @override
  State<RoleWorkspace> createState() => _RoleWorkspaceState();
}

class _RoleWorkspaceState extends State<RoleWorkspace> {
  bool busy = false;
  String message = '', tab = 'Overview', reportType = 'HAZARD';
  String paymentFilter = '';
  String motoristTab = 'Dashboard';
  int page = 1, total = 0;
  Map<String, dynamic>? notices, overview, ticket, selected, pendingReport;
  String? ticketToken;
  List<dynamic> rows = [];
  final reference = TextEditingController(), code = TextEditingController();
  final location = TextEditingController(),
      description = TextEditingController(),
      reviewNotes = TextEditingController();
  Timer? timer;
  bool get motorist => widget.role == 'USER';

  @override
  void initState() {
    super.initState();
    unawaited(perform(refresh));
    timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!busy) {
        unawaited(perform(refresh, silent: true));
      }
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    for (final controller in [
      reference,
      code,
      location,
      description,
      reviewNotes
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> perform(Future<void> Function() action,
      {bool silent = false}) async {
    if (busy) return;
    setState(() {
      busy = true;
      if (!silent) message = '';
    });
    try {
      await action();
    } catch (error) {
      if (mounted) message = error.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) {
        setState(() {
          busy = false;
        });
      }
    }
  }

  Future<void> refresh() async {
    if (motorist) {
      final result = await widget.api('/public/notices');
      if (mounted) notices = Map<String, dynamic>.from(result);
    } else if (tab == 'Overview') {
      final result = await widget.api('/analytics/overview');
      if (mounted) overview = Map<String, dynamic>.from(result);
    } else {
      final result = await widget.api(
          '/${tab.toLowerCase()}?page=$page&pageSize=20${tab == 'Offences' && paymentFilter.isNotEmpty ? '&paymentStatus=$paymentFilter' : ''}');
      if (mounted) {
        rows = result['items'];
        total = result['total'];
      }
    }
  }

  Future<void> verify() async {
    if (reference.text.trim().length < 10 ||
        !RegExp(r'^[a-f0-9]{16}$').hasMatch(code.text.trim())) {
      throw Exception(
          'Enter the ticket reference and 16-character verification code.');
    }
    final result = await widget.api('/public/tickets/verify', {
      'reference': reference.text.trim(),
      'verificationCode': code.text.trim()
    });
    if (!mounted) return;
    ticketToken = result['token'];
    ticket = Map<String, dynamic>.from(result['ticket']);
    code.clear();
  }

  Future<void> ticketAction(String path, {bool get = false}) async {
    try {
      final result =
          await widget.api(path, get ? null : {}, 'POST', ticketToken);
      if (mounted) ticket = Map<String, dynamic>.from(result);
    } catch (_) {
      // A ticket session can expire or be revoked independently of the account.
      // Retain the account and let the motorist verify again; payments are idempotent.
      ticket = null;
      ticketToken = null;
      rethrow;
    }
  }

  Future<void> report() async {
    if (pendingReport == null) {
      if (location.text.trim().length < 3 ||
          description.text.trim().length < 3) {
        throw Exception(
            'Enter an incident location and description (at least 3 characters).');
      }
      pendingReport = {
        'requestKey': const Uuid().v4(),
        'type': reportType,
        'location': location.text.trim(),
        'description': description.text.trim()
      };
    }
    final result = await widget.api('/public/incidents', pendingReport);
    if (!mounted) return;
    pendingReport = null;
    location.clear();
    description.clear();
    message = result['message'];
  }

  Future<void> openRecord(Map<String, dynamic> row) async {
    final result =
        tab == 'Offences' ? await widget.api('/offences/${row['id']}') : row;
    if (mounted) {
      selected = Map<String, dynamic>.from(result);
      reviewNotes.clear();
    }
  }

  Future<void> review(String status) async {
    if (reviewNotes.text.trim().length < 3) {
      throw Exception('Enter review notes (at least 3 characters).');
    }
    final record = selected!;
    if (tab == 'Offences') {
      await widget.api('/offences/${record['id']}/review',
          {'status': status, 'notes': reviewNotes.text.trim()});
    } else {
      await widget.api('/incidents/${record['id']}',
          {'status': status, 'notes': reviewNotes.text.trim()}, 'PATCH');
    }
    if (!mounted) return;
    selected = null;
    reviewNotes.clear();
    await refresh();
    message = 'Review saved.';
  }

  Widget heading(String text) => Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 10),
      child: Text(text, style: Theme.of(context).textTheme.titleLarge));
  Widget input(String label, TextEditingController controller,
          {int maxLength = 200,
          bool secret = false,
          bool enabled = true,
          int lines = 1}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: TextField(
            controller: controller,
            enabled: !busy && enabled,
            obscureText: secret,
            maxLength: maxLength,
            maxLines: lines,
            decoration: InputDecoration(
                labelText: label, border: const OutlineInputBorder())),
      );
  Widget action(String label, Future<void> Function() callback,
          {bool enabled = true}) =>
      Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: FilledButton(
              onPressed: busy || !enabled ? null : () => perform(callback),
              child: Text(label)));

  List<Widget> motoristView() => [
        heading('Motorist Services'),
        heading('Traffic Notices'),
        Text(notices?['notice'] ?? 'Loading notices…'),
        for (final alert in (notices?['alerts'] ?? []))
          Card(
              child: ListTile(
                  title: Text(alert['title']),
                  subtitle: Text(alert['message']))),
        if (notices != null && (notices!['alerts'] as List).isEmpty)
          const Text('No traffic notices available.'),
        if (ticket == null) ...[
          heading('Find Your Traffic Ticket'),
          const Text(
              'Enter the ticket reference and verification code provided on your traffic ticket.'),
          input('Ticket reference', reference, maxLength: 100),
          input('Verification code', code, secret: true, maxLength: 16),
          action('Verify Ticket', verify),
        ] else ...[
          heading('Verified Traffic Ticket'),
          SelectableText('Reference: ${ticketLabel(ticket!)}'),
          Text(
              '${ticket!['category']} · Amount: ${formatCurrency(ticket!['demoAmount'], ticket!['currency'])}'),
          Align(
              alignment: Alignment.centerLeft,
              child: StatusBadge(ticket!['status'])),
          Text(
              'Payment status: ${ticket!['paymentStatus'] == 'SIMULATED_PAID' ? 'Paid' : 'Pending'}'),
          if (ticket!['receiptReference'] != null)
            SelectableText('Receipt: ${ticket!['receiptReference']}'),
          const Text(
              'Payments are simulated. No money is collected. Ticket access expires after 10 minutes.'),
          action('Simulate payment',
              () => ticketAction('/public/tickets/payment-simulation'),
              enabled: ticket!['status'] != 'CANCELLED' &&
                  ticket!['paymentStatus'] != 'SIMULATED_PAID'),
          action('Refresh ticket status',
              () => ticketAction('/public/tickets/current', get: true)),
          action('Close ticket access', () async {
            await widget.api('/public/tickets/logout', {}, 'POST', ticketToken);
            ticketToken = null;
            ticket = null;
          }),
        ],
        heading('Report a Road Incident'),
        const Text(
            'For emergencies requiring immediate assistance, contact the appropriate emergency service.'),
        DropdownButtonFormField<String>(
            initialValue: reportType,
            decoration: const InputDecoration(labelText: 'Incident type'),
            items: ['ACCIDENT', 'HAZARD', 'CONGESTION', 'OTHER']
                .map((value) => DropdownMenuItem(
                    value: value, child: Text(readable(value))))
                .toList(),
            onChanged: busy || pendingReport != null
                ? null
                : (value) => setState(() {
                      reportType = value!;
                    })),
        input('Incident location', location, enabled: pendingReport == null),
        input('Incident description', description,
            maxLength: 2000, lines: 3, enabled: pendingReport == null),
        action(
            pendingReport == null
                ? 'Submit Incident Report'
                : 'Retry same report',
            report),
      ];

  List<Widget> supervisorView() => [
        heading('Command centre'),
        action('Refresh records', refresh),
        if (tab == 'Offences')
          DropdownButtonFormField<String>(
              initialValue: paymentFilter,
              decoration: const InputDecoration(labelText: 'Payment status'),
              items: ['', 'PENDING', 'PAID', 'OVERDUE', 'FAILED']
                  .map((value) => DropdownMenuItem(
                      value: value,
                      child: Text(
                          value.isEmpty ? 'All payments' : readable(value))))
                  .toList(),
              onChanged: busy
                  ? null
                  : (value) => perform(() async {
                        paymentFilter = value!;
                        page = 1;
                        await refresh();
                      })),
        if (tab == 'Overview' && overview != null) ...[
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Open incidents: ${overview!['openIncidents']}'),
                        Text(
                            'Offences awaiting review: ${overview!['submittedOffences']}'),
                        Text(
                            'Active checkpoints: ${overview!['activeCheckpoints']}')
                      ]))),
          heading('Assigned officer activity'),
          for (final officer in overview!['officers'])
            ListTile(
                title: Text(officer['name']),
                subtitle: Text(
                    '${officer['_count']['offences']} offences · ${officer['_count']['incidents']} incidents')),
        ],
        if (tab != 'Overview') ...[
          heading(tab == 'Offences' ? 'Assigned offences' : tab),
          if (rows.isEmpty && !busy) const Text('No matching records.'),
          for (final row in rows)
            Card(
                child: ListTile(
              title: Text(tab == 'Offences'
                  ? '${row['vehicle']['registrationNumber']} · ${row['category']['name']}'
                  : tab == 'Incidents'
                      ? readable(row['type'])
                      : row['name']),
              subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(row['location']),
                    if (row['paymentStatus'] != null)
                      StatusBadge(row['paymentStatus'])
                  ]),
              trailing:
                  StatusBadge(row['status'], incident: tab == 'Incidents'),
              onTap: busy
                  ? null
                  : () =>
                      perform(() => openRecord(Map<String, dynamic>.from(row))),
            )),
          Wrap(
              spacing: 12,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                OutlinedButton(
                    onPressed: busy || page <= 1
                        ? null
                        : () => perform(() async {
                              page--;
                              selected = null;
                              await refresh();
                            }),
                    child: const Text('Previous')),
                Text('Page $page · $total records'),
                OutlinedButton(
                    onPressed: busy || page * 20 >= total
                        ? null
                        : () => perform(() async {
                              page++;
                              selected = null;
                              await refresh();
                            }),
                    child: const Text('Next')),
              ]),
        ],
        if (selected != null) ...[
          heading('Record details'),
          Text(selected!['location']),
          Text(selected!['notes'] ?? selected!['description'] ?? ''),
          if (selected!['paymentStatus'] != null)
            StatusBadge(selected!['paymentStatus']),
          if (selected!['ticket'] != null)
            SelectableText(
                'Ticket reference: ${ticketLabel(selected!['ticket'])}'),
          if (tab == 'Offences' &&
              ['SUBMITTED', 'UNDER_REVIEW'].contains(selected!['status'])) ...[
            input('Review notes', reviewNotes, maxLength: 1000, lines: 3),
            if (selected!['status'] == 'SUBMITTED')
              action('Start review', () => review('UNDER_REVIEW')),
            if (selected!['status'] == 'UNDER_REVIEW') ...[
              action('Confirm offence', () => review('CONFIRMED')),
              action('Cancel offence', () => review('CANCELLED'))
            ],
          ],
          if (tab == 'Incidents' &&
              ['OPEN', 'IN_PROGRESS'].contains(selected!['status'])) ...[
            input('Review notes', reviewNotes, maxLength: 1000, lines: 3),
            if (selected!['status'] == 'OPEN')
              action('Start incident review', () => review('IN_PROGRESS')),
            if (selected!['status'] == 'IN_PROGRESS')
              action('Resolve incident', () => review('RESOLVED')),
            action('Cancel incident', () => review('CANCELLED')),
          ],
          if (tab == 'Checkpoints' &&
              selected!['createdBy'] == widget.accountId &&
              selected!['status'] != 'CLOSED') ...[
            if (selected!['status'] == 'PLANNED')
              action('Activate checkpoint', () => checkpoint('ACTIVE')),
            action('Close checkpoint', () => checkpoint('CLOSED')),
          ],
        ],
      ];
  Future<void> checkpoint(String status) async {
    await widget.api(
        '/checkpoints/${selected!['id']}', {'status': status}, 'PATCH');
    if (!mounted) return;
    selected = null;
    await refresh();
    message = 'Checkpoint updated.';
  }

  Widget motoristShell() {
    const pages = [
      'Dashboard',
      'Infringements',
      'Payments',
      'Vehicles',
      'Profile'
    ];
    final current =
        pages.contains(motoristTab) ? pages.indexOf(motoristTab) : 4;
    void navigate(String value) => setState(() {
          motoristTab = value;
        });
    return Scaffold(
      backgroundColor: const Color(0xfff1f4f7),
      body: SafeArea(
          child: SingleChildScrollView(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
            Container(
                padding: const EdgeInsets.fromLTRB(22, 26, 22, 22),
                decoration: const BoxDecoration(
                    color: Color(0xff142d40),
                    border: Border(
                        bottom:
                            BorderSide(color: Color(0xff246e7b), width: 4))),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const ProductBrand(),
                      const SizedBox(height: 22),
                      Row(children: [
                        Expanded(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                              Text(widget.identity,
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 19,
                                      fontWeight: FontWeight.w600)),
                              const Text('MOTORIST',
                                  style: TextStyle(
                                      color: Color(0xffb4dce5),
                                      letterSpacing: 1.2,
                                      fontSize: 12))
                            ])),
                        OutlinedButton(
                            onPressed: busy ? null : widget.onLogout,
                            style: OutlinedButton.styleFrom(
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(8)),
                                side:
                                    const BorderSide(color: Color(0xff7594a8)),
                                minimumSize: const Size(80, 44)),
                            child: const Text('Sign out'))
                      ]),
                    ])),
            Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (message.isNotEmpty)
                        Semantics(liveRegion: true, child: Text(message)),
                      if (motoristTab == 'Profile')
                        Card(
                            child: Padding(
                                padding: const EdgeInsets.all(20),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      heading('My Profile'),
                                      Text(widget.identity),
                                      const Text('Motorist'),
                                      heading('More services'),
                                      TextButton(
                                          onPressed: () => navigate('Services'),
                                          child: const Text(
                                              'Traffic Notices & Reports')),
                                      TextButton(
                                          onPressed: () =>
                                              navigate('My Reports'),
                                          child: const Text('My Reports'))
                                    ])))
                      else if (motoristTab == 'Services')
                        ...motoristView()
                      else
                        MotoristLedger(
                            key: const ValueKey('motorist-ledger'),
                            api: widget.api,
                            page: motoristTab,
                            onNavigate: navigate),
                      const Padding(
                          padding: EdgeInsets.all(16),
                          child: Text('Academic Prototype',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                  fontSize: 11, color: Color(0xff536878)))),
                    ])),
          ]))),
      bottomNavigationBar: NavigationBar(
          backgroundColor: Colors.white,
          indicatorColor: const Color(0xffe5eff3),
          selectedIndex: current,
          height: 72,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          onDestinationSelected: (index) => navigate(pages[index]),
          destinations: const [
            NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home),
                label: 'Home'),
            NavigationDestination(
                icon: Icon(Icons.warning_amber_rounded), label: 'Fines'),
            NavigationDestination(
                icon: Icon(Icons.credit_card), label: 'Payments'),
            NavigationDestination(
                icon: Icon(Icons.directions_car_outlined), label: 'Vehicles'),
            NavigationDestination(
                icon: Icon(Icons.person_outline), label: 'Profile'),
          ]),
    );
  }

  @override
  Widget build(BuildContext context) => motorist
      ? motoristShell()
      : SupervisorShell(
          api: widget.api,
          identity: widget.identity,
          onLogout: widget.onLogout,
          busy: busy,
          message: message,
          onNavigate: (value) => perform(() async {
            tab = value;
            page = 1;
            selected = null;
            rows = [];
            await refresh();
          }),
          onOpen: (row) => perform(() async {
            tab = 'Offences';
            page = 1;
            await refresh();
            await openRecord(row);
          }),
          tools: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: supervisorView()),
        );
}
