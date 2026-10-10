import 'dart:async';
import 'package:flutter/material.dart';
import 'presentation.dart';
import 'role_workspace.dart';
import 'vehicle_approvals.dart';

class SupervisorShell extends StatefulWidget {
  const SupervisorShell(
      {required this.api,
      required this.identity,
      required this.onLogout,
      required this.onNavigate,
      required this.onOpen,
      required this.tools,
      required this.busy,
      required this.message,
      super.key});
  final AccountApi api;
  final String identity, message;
  final bool busy;
  final Widget tools;
  final Future<void> Function() onLogout;
  final Future<void> Function(String) onNavigate;
  final Future<void> Function(Map<String, dynamic>) onOpen;
  @override
  State<SupervisorShell> createState() => _SupervisorShellState();
}

class _SupervisorShellState extends State<SupervisorShell> {
  String tab = 'Dashboard', error = '';
  Map<String, dynamic>? overview, summary;
  List<dynamic> reviews = [],
      incidents = [],
      checkpoints = [],
      payments = [],
      activity = [];
  int paymentPage = 1, paymentTotal = 0;
  bool loading = false;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    unawaited(refresh());
    timer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (!widget.busy) unawaited(refresh());
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> refresh() async {
    if (loading) return;
    setState(() => loading = true);
    try {
      final data = await Future.wait([
        widget.api('/analytics/overview'),
        widget.api('/supervisor/summary'),
        widget.api('/offences?status=SUBMITTED&pageSize=5'),
        widget.api('/offences?status=UNDER_REVIEW&pageSize=5'),
        widget.api('/incidents?pageSize=5'),
        widget.api('/checkpoints?pageSize=5'),
        widget.api('/supervisor/payments?page=$paymentPage&pageSize=10'),
        widget.api('/offences?pageSize=5'),
      ]);
      if (mounted) {
        setState(() {
          overview = Map<String, dynamic>.from(data[0]);
          summary = Map<String, dynamic>.from(data[1]);
          final pending = <String, dynamic>{};
          for (final r in [...data[2]['items'], ...data[3]['items']]) {
            pending[r['id']] = r;
          }
          reviews = pending.values.toList()
            ..sort((a, b) =>
                (b['createdAt'] ?? '').compareTo(a['createdAt'] ?? ''));
          reviews = reviews.take(5).toList();
          incidents = data[4]['items'];
          checkpoints = data[5]['items'];
          payments = data[6]['items'];
          paymentTotal = data[6]['total'];
          activity = data[7]['items'];
          error = '';
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> navigate(String value) async {
    if (widget.busy) return;
    setState(() => tab = value);
    if (['Reviews', 'Incidents', 'Checkpoints', 'Reports'].contains(value)) {
      await widget.onNavigate(value == 'Reviews'
          ? 'Offences'
          : value == 'Reports'
              ? 'Overview'
              : value);
    }
  }

  Widget panel(List<Widget> children) => Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children)));
  Widget heading(String title, String destination) => Row(children: [
        Expanded(
            child: Text(title,
                style: const TextStyle(
                    fontSize: 19, fontWeight: FontWeight.w700))),
        TextButton(
            onPressed: () => navigate(destination),
            child: const Text('View all'))
      ]);
  String date(dynamic value) => value == null
      ? 'Not recorded'
      : DateTime.tryParse(value.toString())
              ?.toLocal()
              .toString()
              .split('.')
              .first ??
          'Not recorded';
  Widget offence(dynamic r, {bool officer = false}) {
    final t = r['ticket'];
    final colour = r['status'] == 'CONFIRMED'
        ? const Color(0xff21815c)
        : r['status'] == 'UNDER_REVIEW'
            ? const Color(0xff186b9c)
            : const Color(0xffb56c08);
    return Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: Colors.white,
            border: Border(
                left: BorderSide(color: colour, width: 4),
                top: BorderSide(color: colour),
                right: BorderSide(color: colour),
                bottom: BorderSide(color: colour)),
            borderRadius: BorderRadius.circular(8)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.warning_amber_rounded, color: colour),
            const SizedBox(width: 10),
            Expanded(
                child: Text(
                    officer
                        ? (r['officer']?['name'] ?? 'Not recorded')
                        : (r['category']?['name'] ?? 'Traffic offence'),
                    style: const TextStyle(
                        fontSize: 17, fontWeight: FontWeight.w700)))
          ]),
          const SizedBox(height: 8),
          Text(ticketLabel(t ?? {}),
              style: const TextStyle(color: Color(0xff41617c))),
          if (officer) const Text('Issued infringement'),
          Text(
              'Vehicle: ${r['vehicle']?['registrationNumber'] ?? 'Not recorded'}'),
          Text('Motorist: ${t?['motorist']?['name'] ?? 'No linked motorist'}'),
          if (!officer)
            Text('Officer: ${r['officer']?['name'] ?? 'Not recorded'}'),
          Text('${date(r['observedAt'] ?? r['createdAt'])} · ${r['location']}'),
          const SizedBox(height: 10),
          Text(
              '${t == null ? 'Not issued' : formatCurrency(t['demoFineAmountSnapshot'])} · ${t?['demeritPointsSnapshot'] ?? 0} demerit points',
              style: const TextStyle(fontWeight: FontWeight.w700)),
          Wrap(spacing: 6, children: [
            StatusBadge(r['status']),
            if (r['paymentStatus'] != null) StatusBadge(r['paymentStatus'])
          ]),
          Align(
              alignment: Alignment.centerRight,
              child: OutlinedButton(
                  onPressed: widget.busy
                      ? null
                      : () async {
                          setState(() => tab = 'Reviews');
                          await widget.onOpen(Map<String, dynamic>.from(r));
                        },
                  child: Text(
                      ['SUBMITTED', 'UNDER_REVIEW'].contains(r['status'])
                          ? 'Review'
                          : 'View'))),
        ]));
  }

  Widget metrics() {
    final values = [
      (
        'Pending Reviews',
        overview?['submittedOffences']?.toString() ?? '—',
        Icons.receipt_long_outlined,
        const Color(0xff9b5a06),
        'Reviews'
      ),
      (
        'Active Incidents',
        overview?['openIncidents']?.toString() ?? '—',
        Icons.warning_amber_rounded,
        const Color(0xffbd3030),
        'Incidents'
      ),
      (
        'Active Checkpoints',
        overview?['activeCheckpoints']?.toString() ?? '—',
        Icons.verified_user_outlined,
        const Color(0xff168053),
        'Checkpoints'
      ),
      (
        'Payments Today',
        summary == null
            ? '—'
            : formatCurrency(
                summary!['paymentsToday'], summary!['currency'] ?? 'USD'),
        Icons.credit_card,
        const Color(0xff174e82),
        'Payments'
      ),
      (
        'Officers Active',
        overview == null
            ? '—'
            : (overview!['officers'] as List)
                .where((o) => o['active'] == true)
                .length
                .toString(),
        Icons.groups_outlined,
        const Color(0xff174e82),
        'Reports'
      ),
      (
        'Pending Vehicle Approvals',
        summary?['pendingVehicleApprovals']?.toString() ?? '—',
        Icons.directions_car_outlined,
        const Color(0xff9b5a06),
        'Vehicles'
      ),
    ];
    return LayoutBuilder(builder: (context, box) {
      final columns = box.maxWidth >= 850
          ? 6
          : box.maxWidth >= 600
              ? 3
              : 2;
      return Wrap(
          spacing: 10,
          runSpacing: 10,
          children: values
              .map((v) => SizedBox(
                  width: (box.maxWidth - 10 * (columns - 1)) / columns,
                  child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.all(12),
                          foregroundColor: const Color(0xff344f68),
                          side: const BorderSide(color: Color(0xffdce5ee)),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8))),
                      onPressed: () => navigate(v.$5),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Icon(v.$3, color: v.$4),
                                  const Icon(Icons.chevron_right, size: 18)
                                ]),
                            const SizedBox(height: 12),
                            ConstrainedBox(
                                constraints:
                                    const BoxConstraints(minHeight: 36),
                                child: Text(v.$1,
                                    style: const TextStyle(fontSize: 13))),
                            const SizedBox(height: 10),
                            Text(v.$2,
                                style: TextStyle(
                                    fontSize: 23,
                                    fontWeight: FontWeight.w700,
                                    color: v.$4))
                          ]))))
              .toList());
    });
  }

  Widget paymentPanel() => panel([
        heading(tab == 'Dashboard' ? 'Recent Payments' : 'Payment History',
            'Payments'),
        if (payments.isEmpty) const Text('No payments found.'),
        for (final p in payments.take(tab == 'Dashboard' ? 5 : 10))
          Container(
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: Color(0xffe3eaf1)))),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        '${formatCurrency(p['amount'], p['currency'])} · ${paymentMethodLabel(p['method'])}',
                        style: const TextStyle(
                            fontSize: 17, fontWeight: FontWeight.w700)),
                    Text('Ticket: ${ticketLabel(p['ticket'])}'),
                    Text(p['motorist']['name']),
                    Text(date(p['paidAt'] ?? p['createdAt'])),
                    StatusBadge(p['status']),
                  ])),
        if (tab == 'Payments')
          Wrap(
              spacing: 12,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                OutlinedButton(
                    onPressed: loading || paymentPage == 1
                        ? null
                        : () {
                            paymentPage--;
                            unawaited(refresh());
                          },
                    child: const Text('Previous payments')),
                Text('Page $paymentPage'),
                OutlinedButton(
                    onPressed: loading || paymentPage * 10 >= paymentTotal
                        ? null
                        : () {
                            paymentPage++;
                            unawaited(refresh());
                          },
                    child: const Text('Next payments'))
              ]),
      ]);
  @override
  Widget build(BuildContext context) {
    const tabs = ['Dashboard', 'Reviews', 'Incidents', 'Checkpoints', 'More'];
    final index = tabs.contains(tab) ? tabs.indexOf(tab) : 4;
    return Scaffold(
        backgroundColor: const Color(0xfff1f4f7),
        body: SafeArea(
            child: SingleChildScrollView(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
              Container(
                  padding: const EdgeInsets.fromLTRB(22, 24, 22, 22),
                  decoration: const BoxDecoration(
                      color: Color(0xff142d40),
                      border: Border(
                          bottom:
                              BorderSide(color: Color(0xff246e7b), width: 4))),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('TRAFFIC OPERATIONS',
                            style: TextStyle(
                                color: Color(0xffb4dce5),
                                letterSpacing: 2,
                                fontSize: 11)),
                        const SizedBox(height: 10),
                        const Text('ZRP Smart Traffic Management System',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 25,
                                fontWeight: FontWeight.w700,
                                height: 1.2)),
                        const SizedBox(height: 22),
                        Row(children: [
                          Expanded(
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                Text(widget.identity,
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 18,
                                        fontWeight: FontWeight.w600)),
                                const SizedBox(height: 4),
                                const Text('COMMAND CENTRE',
                                    style: TextStyle(
                                        color: Color(0xffb4dce5),
                                        letterSpacing: 1,
                                        fontSize: 11))
                              ])),
                          OutlinedButton(
                              onPressed: widget.busy ? null : widget.onLogout,
                              style: OutlinedButton.styleFrom(
                                  foregroundColor: Colors.white,
                                  side: const BorderSide(
                                      color: Color(0xff7594a8))),
                              child: const Text('Sign out'))
                        ]),
                      ])),
              Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (loading || widget.busy)
                          const LinearProgressIndicator(),
                        if (error.isNotEmpty)
                          Semantics(liveRegion: true, child: Text(error)),
                        if (widget.message.isNotEmpty)
                          Semantics(
                              liveRegion: true, child: Text(widget.message)),
                        if (tab == 'Dashboard') ...[
                          panel([
                            Text('Welcome back, ${widget.identity}',
                                style: const TextStyle(
                                    fontSize: 22, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 8),
                            const Text('Here is your command centre overview.'),
                            const SizedBox(height: 20),
                            metrics(),
                            const SizedBox(height: 12),
                            const Text(
                                'Refreshes every 10 seconds. Payments today use Harare time. Active officers are enabled assigned accounts.',
                                style: TextStyle(
                                    fontSize: 11, color: Color(0xff52677b)))
                          ]),
                          panel([
                            heading('Pending Offence Reviews', 'Reviews'),
                            if (reviews.isEmpty)
                              const Text('No offences awaiting review.'),
                            ...reviews.map((r) => offence(r))
                          ]),
                          panel([
                            VehicleApprovals(
                                api: widget.api,
                                onChanged: () => unawaited(refresh()))
                          ]),
                          panel([
                            heading('Recent Incidents', 'Incidents'),
                            if (incidents.isEmpty)
                              const Text('No incidents found.'),
                            for (final r in incidents)
                              ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  leading: const Icon(
                                      Icons.warning_amber_rounded,
                                      color: Color(0xffbd3030)),
                                  title: Text(readable(r['type'])),
                                  subtitle: Text(
                                      '${r['location']} · ${date(r['createdAt'])}\nReported by ${r['reporter']?['name'] ?? 'Not recorded'}\nSeverity / team: Not recorded'),
                                  trailing: const Icon(Icons.chevron_right),
                                  onTap: () => navigate('Incidents'))
                          ]),
                          panel([
                            heading('Checkpoints', 'Checkpoints'),
                            if (checkpoints.isEmpty)
                              const Text('No checkpoints found.'),
                            for (final r in checkpoints)
                              ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  title: Text(r['name']),
                                  subtitle: Text(
                                      '${r['location']}\n${date(r['startAt'])} – ${date(r['endAt'])}\nAssigned officers / vehicles checked: Not recorded'),
                                  trailing: StatusBadge(r['status']),
                                  onTap: () => navigate('Checkpoints'))
                          ]),
                          paymentPanel(),
                          panel([
                            heading('Officer Activity', 'Reviews'),
                            if (activity.isEmpty)
                              const Text('No matching records.'),
                            ...activity.map((r) => offence(r, officer: true))
                          ]),
                        ],
                        Offstage(
                            offstage: ![
                              'Reviews',
                              'Incidents',
                              'Checkpoints',
                              'Reports'
                            ].contains(tab),
                            child: widget.tools),
                        if (tab == 'Payments') paymentPanel(),
                        if (tab == 'Vehicles')
                          panel([
                            VehicleApprovals(
                                api: widget.api,
                                onChanged: () => unawaited(refresh()))
                          ]),
                        if (tab == 'More')
                          panel([
                            const Text('Command Centre Services',
                                style: TextStyle(
                                    fontSize: 21, fontWeight: FontWeight.w700)),
                            for (final d in [
                              'Payments',
                              'Reports',
                              'Vehicles',
                              'Profile'
                            ])
                              ListTile(
                                  title: Text(d == 'Vehicles'
                                      ? 'Vehicle Approvals'
                                      : d),
                                  trailing: const Icon(Icons.chevron_right),
                                  onTap: () => navigate(d))
                          ]),
                        if (tab == 'Profile')
                          panel([
                            const Text('My Profile',
                                style: TextStyle(
                                    fontSize: 21, fontWeight: FontWeight.w700)),
                            Text(widget.identity),
                            const Text('Supervisor')
                          ]),
                        const Padding(
                            padding: EdgeInsets.all(16),
                            child: Text('Academic Prototype',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                    fontSize: 11, color: Color(0xff52677b)))),
                      ])),
            ]))),
        bottomNavigationBar: NavigationBar(
            selectedIndex: index,
            height: 72,
            backgroundColor: Colors.white,
            indicatorColor: const Color(0xffe5eff3),
            labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
            onDestinationSelected: (i) => navigate(tabs[i]),
            destinations: const [
              NavigationDestination(
                  icon: Icon(Icons.home_outlined), label: 'Home'),
              NavigationDestination(
                  icon: Icon(Icons.receipt_long_outlined), label: 'Reviews'),
              NavigationDestination(
                  icon: Icon(Icons.warning_amber_rounded), label: 'Incidents'),
              NavigationDestination(
                  icon: Icon(Icons.traffic_outlined), label: 'Checkpoints'),
              NavigationDestination(icon: Icon(Icons.menu), label: 'More')
            ]));
  }
}
