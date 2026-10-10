import 'dart:async';
import 'package:flutter/material.dart';
import 'presentation.dart';
import 'role_workspace.dart';

class OfficerShell extends StatefulWidget {
  const OfficerShell(
      {required this.api,
      required this.identity,
      required this.onLogout,
      required this.onOpen,
      required this.citation,
      required this.incidentForm,
      required this.activityTools,
      required this.busy,
      required this.message,
      required this.canOpen,
      super.key});
  final AccountApi api;
  final String identity, message;
  final Widget citation, incidentForm, activityTools;
  final bool busy, canOpen;
  final Future<void> Function() onLogout;
  final Future<void> Function(Map<String, dynamic>) onOpen;
  @override
  State<OfficerShell> createState() => _OfficerShellState();
}

class _OfficerShellState extends State<OfficerShell> {
  String tab = 'Dashboard', error = '';
  List<dynamic> offences = [], incidents = [], checkpoints = [];
  bool loading = false, loaded = false;
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

  Future<List<dynamic>> all(String path) async {
    final rows = <dynamic>[];
    for (var page = 1; mounted; page++) {
      final result = await widget.api('$path?page=$page&pageSize=100');
      rows.addAll(result['items']);
      if (rows.length >= (result['total'] ?? rows.length) ||
          (result['items'] as List).length < 100) {
        break;
      }
    }
    return rows;
  }

  Future<void> refresh() async {
    if (loading) return;
    loading = true;
    try {
      final data = await Future.wait(
          [all('/offences'), all('/incidents'), all('/checkpoints')]);
      if (mounted) {
        setState(() {
          offences = data[0];
          incidents = data[1];
          checkpoints = data[2];
          loaded = true;
          error = '';
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      loading = false;
    }
  }

  void navigate(String value) => setState(() => tab = value);
  String displayDate(dynamic value) => value == null
      ? 'Time not recorded'
      : DateTime.parse(value.toString()).toLocal().toString().substring(0, 16);
  String harareDay(DateTime value) => value
      .toUtc()
      .add(const Duration(hours: 2))
      .toIso8601String()
      .substring(0, 10);
  Color accent(dynamic status) => switch (status) {
        'SUBMITTED' => const Color(0xffbe342b),
        'UNDER_REVIEW' => const Color(0xffa65a00),
        'CONFIRMED' => const Color(0xff167044),
        _ => const Color(0xff536878)
      };
  Widget panel(List<Widget> children) => Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children)));
  Widget title(String text) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(text,
          style: const TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w700,
              color: Color(0xff142d40))));
  Widget metric(String label, int value, IconData icon, Color color,
          String destination) =>
      InkWell(
          onTap: () => navigate(destination),
          child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: const Color(0xffd9e2e9)),
                  borderRadius: BorderRadius.circular(8)),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(icon, color: color),
                    const SizedBox(height: 12),
                    Text(label, style: const TextStyle(fontSize: 13)),
                    Text(loaded ? '$value' : '--',
                        style: TextStyle(
                            color: color,
                            fontSize: 30,
                            fontWeight: FontWeight.w700))
                  ])));
  Widget record(dynamic item) {
    final t = item['ticket'];
    final colour = accent(item['status']);
    return Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        foregroundDecoration: BoxDecoration(
            border: Border(left: BorderSide(color: colour, width: 4))),
        decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: const Color(0xffd9e2e9)),
            borderRadius: BorderRadius.circular(9)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(
              item['status'] == 'CONFIRMED'
                  ? Icons.check_circle_outline
                  : item['status'] == 'UNDER_REVIEW'
                      ? Icons.schedule
                      : Icons.warning_amber_rounded,
              color: colour),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(item['category']?['name'] ?? 'Traffic offence',
                    style: const TextStyle(
                        fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Container(
                    color: const Color(0xffeef2f6),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    child: Text(t == null ? 'Draft' : ticketLabel(t),
                        style: const TextStyle(fontSize: 12))),
                const SizedBox(height: 6),
                Text(
                    'Vehicle: ${item['vehicle']?['registrationNumber'] ?? 'Not recorded'}'),
                Text(
                    'Motorist: ${item['vehicle']?['motorist']?['name'] ?? (item['vehicle']?['motoristId'] != null ? 'Linked account' : 'Not linked')}'),
                Text(
                    '${displayDate(t?['issuedAt'] ?? item['observedAt'])} - ${item['location']}',
                    style: const TextStyle(
                        fontSize: 12, color: Color(0xff536878))),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text(
                            t == null
                                ? 'Not issued'
                                : formatCurrency(t['demoFineAmountSnapshot']),
                            style: const TextStyle(
                                fontSize: 21, fontWeight: FontWeight.w700)),
                        Text(statusLabel(item['status']),
                            style: TextStyle(
                                color: colour, fontWeight: FontWeight.w600)),
                        if (item['paymentStatus'] != null)
                          Text('Payment: ${readable(item['paymentStatus'])}',
                              style: const TextStyle(fontSize: 12))
                      ])),
                  OutlinedButton(
                      onPressed: widget.busy || !widget.canOpen
                          ? null
                          : () async {
                              await widget
                                  .onOpen(Map<String, dynamic>.from(item));
                              if (mounted) navigate('Issue Infringement');
                            },
                      child: const Text('View'))
                ])
              ]))
        ]));
  }

  Widget checkpoint(dynamic row) => ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.traffic_outlined, color: Color(0xff167044)),
      title: Text(row['name']),
      subtitle:
          Text('${row['location']}\nOfficer and vehicle counts not recorded'),
      trailing: StatusBadge(row['status']));
  Widget incident(dynamic row) => ListTile(
      contentPadding: EdgeInsets.zero,
      leading:
          const Icon(Icons.warning_amber_rounded, color: Color(0xffbe342b)),
      title: Text(readable(row['type'])),
      subtitle: Text(
          '${row['location']}\n${displayDate(row['createdAt'])}\nSeverity not recorded'),
      trailing: StatusBadge(row['status'], incident: true),
      onTap: () => navigate('Incidents'));
  @override
  Widget build(BuildContext context) {
    final mobile = MediaQuery.sizeOf(context).width <= 700;
    final now = DateTime.now();
    final open = checkpoints
        .where((r) =>
            r['status'] == 'ACTIVE' &&
            (r['startAt'] == null ||
                !DateTime.parse(r['startAt']).isAfter(now)) &&
            (r['endAt'] == null || DateTime.parse(r['endAt']).isAfter(now)))
        .toList();
    final active = incidents
        .where((r) => ['OPEN', 'IN_PROGRESS'].contains(r['status']))
        .toList();
    final counts = [
      offences
          .where((r) =>
              r['ticket']?['issuedAt'] != null &&
              harareDay(DateTime.parse(r['ticket']['issuedAt'])) ==
                  harareDay(now))
          .length,
      offences
          .where((r) => ['SUBMITTED', 'UNDER_REVIEW'].contains(r['status']))
          .length,
      active.length,
      open.length
    ];
    const pages = [
      'Dashboard',
      'Issue Infringement',
      'Incidents',
      'Checkpoints',
      'Profile'
    ];
    final index = pages.indexOf(tab);
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
                        const Text('TRAFFIC OPERATIONS',
                            style: TextStyle(
                                color: Color(0xffb4dce5),
                                letterSpacing: 2,
                                fontSize: 11)),
                        const SizedBox(height: 8),
                        const Text('ZRP Smart Traffic Management System',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 25,
                                fontWeight: FontWeight.w700,
                                height: 1.2)),
                        const SizedBox(height: 20),
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
                                const Text('TRAFFIC OFFICER',
                                    style: TextStyle(
                                        color: Color(0xffb4dce5),
                                        fontSize: 12,
                                        letterSpacing: 1))
                              ])),
                          OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                  foregroundColor: Colors.white,
                                  side: const BorderSide(
                                      color: Color(0xff7594a8)),
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8))),
                              onPressed: widget.busy ? null : widget.onLogout,
                              child: const Text('Sign out'))
                        ])
                      ])),
              Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (!mobile)
                          Wrap(
                              spacing: 8,
                              children: [
                                'Dashboard',
                                'Issue Infringement',
                                'Incidents',
                                'Checkpoints',
                                'My Activity'
                              ]
                                  .map((p) => TextButton(
                                      onPressed: () => navigate(p),
                                      child: Text(p,
                                          style: TextStyle(
                                              fontWeight: tab == p
                                                  ? FontWeight.bold
                                                  : FontWeight.normal))))
                                  .toList()),
                        if (widget.busy) const LinearProgressIndicator(),
                        if (widget.message.isNotEmpty)
                          Semantics(
                              liveRegion: true, child: Text(widget.message)),
                        if (error.isNotEmpty)
                          Semantics(liveRegion: true, child: Text(error)),
                        if (tab == 'Dashboard')
                          panel([
                            title('Welcome back, ${widget.identity}'),
                            const Text(
                                'Manage field enforcement, infringements and operational activity.'),
                            const SizedBox(height: 16),
                            LayoutBuilder(builder: (context, c) {
                              final columns = mobile ? 2 : 4;
                              final width =
                                  (c.maxWidth - (columns - 1) * 12) / columns;
                              final metrics = [
                                metric(
                                    'Issued Today',
                                    counts[0],
                                    Icons.receipt_long,
                                    const Color(0xff07518a),
                                    'My Activity'),
                                metric(
                                    'Pending Reviews',
                                    counts[1],
                                    Icons.schedule,
                                    const Color(0xffa65a00),
                                    'My Activity'),
                                metric(
                                    'Active Incidents',
                                    counts[2],
                                    Icons.warning_amber_rounded,
                                    const Color(0xffbe342b),
                                    'Incidents'),
                                metric(
                                    'Open Checkpoints',
                                    counts[3],
                                    Icons.traffic_outlined,
                                    const Color(0xff167044),
                                    'Checkpoints')
                              ];
                              return Wrap(
                                  spacing: 12,
                                  runSpacing: 12,
                                  children: metrics
                                      .map((m) =>
                                          SizedBox(width: width, child: m))
                                      .toList());
                            }),
                            if (mobile)
                              Padding(
                                  padding: const EdgeInsets.only(top: 16),
                                  child: FilledButton(
                                      style: FilledButton.styleFrom(
                                          backgroundColor:
                                              const Color(0xff07518a),
                                          minimumSize:
                                              const Size(double.infinity, 48),
                                          shape: RoundedRectangleBorder(
                                              borderRadius:
                                                  BorderRadius.circular(8))),
                                      onPressed: () =>
                                          navigate('Issue Infringement'),
                                      child: const Text(
                                          '+ Issue New Infringement')))
                          ]),
                        Offstage(
                            offstage: !(tab == 'Issue Infringement' ||
                                (tab == 'Dashboard' && !mobile)),
                            child: panel([
                              title('Issue Traffic Infringement'),
                              widget.citation
                            ])),
                        Offstage(
                            offstage: tab != 'Incidents',
                            child: panel(
                                [title('Incidents'), widget.incidentForm])),
                        if (tab == 'Dashboard' || tab == 'My Activity')
                          panel([
                            Row(children: [
                              Expanded(
                                  child: title(tab == 'My Activity'
                                      ? 'My Activity'
                                      : mobile
                                          ? 'Recent Infringements'
                                          : 'Recent Officer Activity')),
                              if (tab == 'Dashboard')
                                TextButton(
                                    onPressed: () => navigate('My Activity'),
                                    child: const Text('View all'))
                            ]),
                            if (!loaded)
                              const Text('Loading officer records...'),
                            if (loaded && offences.isEmpty)
                              const Text('No traffic offences found.'),
                            ...(tab == 'Dashboard'
                                    ? offences.take(3)
                                    : offences)
                                .map(record)
                          ]),
                        Offstage(
                            offstage: tab != 'My Activity',
                            child: widget.activityTools),
                        if (tab == 'Checkpoints')
                          panel([
                            title('Checkpoints'),
                            if (checkpoints.isEmpty)
                              const Text('No checkpoints found.'),
                            ...checkpoints.map(checkpoint)
                          ]),
                        if (tab == 'Dashboard' && !mobile)
                          panel([
                            title('Active Checkpoints'),
                            if (open.isEmpty)
                              const Text('No active checkpoints found.'),
                            ...open.take(2).map(checkpoint),
                            TextButton(
                                onPressed: () => navigate('Checkpoints'),
                                child: const Text('View all checkpoints')),
                            title('Incident Queue'),
                            if (active.isEmpty)
                              const Text('No active incidents found.'),
                            ...active.take(2).map(incident),
                            TextButton(
                                onPressed: () => navigate('Incidents'),
                                child: const Text('View all incidents'))
                          ]),
                        if (tab == 'Profile')
                          panel([
                            title('Officer Profile'),
                            Text(widget.identity),
                            const Text('Traffic Officer'),
                            TextButton(
                                onPressed: () => navigate('My Activity'),
                                child: const Text('My Activity'))
                          ]),
                        const Padding(
                            padding: EdgeInsets.all(16),
                            child: Text('Academic Prototype',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                    fontSize: 11, color: Color(0xff536878))))
                      ]))
            ]))),
        bottomNavigationBar: mobile
            ? NavigationBar(
                backgroundColor: Colors.white,
                indicatorColor: const Color(0xffe5eff3),
                height: 72,
                selectedIndex: index < 0 ? 4 : index,
                onDestinationSelected: (i) => navigate(pages[i]),
                destinations: const [
                    NavigationDestination(
                        icon: Icon(Icons.home_outlined), label: 'Home'),
                    NavigationDestination(
                        icon: Icon(Icons.note_add_outlined), label: 'Issue'),
                    NavigationDestination(
                        icon: Icon(Icons.warning_amber_rounded),
                        label: 'Incidents'),
                    NavigationDestination(
                        icon: Icon(Icons.traffic_outlined),
                        label: 'Checkpoints'),
                    NavigationDestination(
                        icon: Icon(Icons.person_outline), label: 'Profile')
                  ])
            : null);
  }
}
