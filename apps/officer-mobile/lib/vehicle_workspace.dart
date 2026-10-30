import 'dart:async';
import 'package:flutter/material.dart';
import 'presentation.dart';
import 'role_workspace.dart';
import 'vehicle_applications.dart';

class VehicleWorkspace extends StatefulWidget {
  const VehicleWorkspace(
      {required this.api, required this.onTicket, super.key});
  final AccountApi api;
  final Future<void> Function(String) onTicket;
  @override
  State<VehicleWorkspace> createState() => _VehicleWorkspaceState();
}

class _VehicleWorkspaceState extends State<VehicleWorkspace> {
  Map<String, dynamic>? data;
  List<dynamic> requests = [];
  String error = '';
  int page = 1, requestPage = 1, requestTotal = 0;
  bool busy = false;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    unawaited(load());
    timer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (!busy) unawaited(load());
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    if (busy) return;
    setState(() => busy = true);
    try {
      final values = await Future.wait([
        widget.api('/motorist/vehicles?page=$page&pageSize=10'),
        widget.api('/motorist/vehicles/requests?page=$requestPage&pageSize=10')
      ]);
      if (mounted) {
        setState(() {
          data = Map<String, dynamic>.from(values[0]);
          requests = values[1]['items'];
          requestTotal = values[1]['total'];
          error = '';
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> register() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => VehicleRegistration(api: widget.api)));
    if (mounted) await load();
  }

  Future<void> status(String registration) async {
    try {
      final v = await widget.api('/motorist/vehicles/$registration/status');
      if (!mounted) return;
      await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
                  title: Text('$registration · Status'),
                  content: SingleChildScrollView(
                      child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text(v['statusSource']),
                        StatusBadge(v['registrationStatus']),
                        const Text('Account link: Verified'),
                        Text(
                            '${v['activeInfringements']} outstanding infringements'),
                        Text(formatCurrency(v['totalPayable'], v['currency']))
                      ])),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Close'))
                  ]));
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        VehicleApplicationsButton(api: widget.api),
        const SizedBox(height: 16),
        Text('My Vehicles', style: Theme.of(context).textTheme.headlineSmall),
        const Text('Manage vehicles linked to your motorist account.'),
        FilledButton(
            onPressed: register, child: const Text('+ Register Vehicle')),
        if (error.isNotEmpty) Text(error),
        if (busy) const LinearProgressIndicator(),
        if (data != null) ...[
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                            'Registered Vehicles: ${data!['summary']['registeredVehicles']}'),
                        Text(
                            'Active Infringements: ${data!['summary']['activeInfringements']}'),
                        Text(
                            'Outstanding Vehicle Fines: ${formatCurrency(data!['summary']['totalPayable'], data!['summary']['currency'])}',
                            style: Theme.of(context).textTheme.titleMedium),
                        Text(
                            'Vehicles Requiring Attention: ${data!['summary']['vehiclesRequiringAttention']}'),
                      ]))),
          if ((data!['items'] as List).isEmpty)
            const Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                    'No vehicles are linked to your account yet.\nRegister a vehicle to track infringements, payments and vehicle status.')),
          for (final v in data!['items'])
            Card(
                child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(v['registrationNumber'],
                              style: Theme.of(context).textTheme.titleLarge),
                          Text('${v['make']} ${v['model']} · ${v['colour']}'),
                          if (v['nickname'] != null) Text(v['nickname']),
                          Wrap(spacing: 8, children: [
                            StatusBadge(v['registrationStatus']),
                            const StatusBadge('VERIFIED')
                          ]),
                          Text(
                              '${v['linkedInfringements']} linked infringements · ${v['activeInfringements']} active'),
                          Text(
                              'Outstanding: ${formatCurrency(v['totalPayable'], v['currency'])}',
                              style: Theme.of(context).textTheme.titleMedium),
                          Wrap(spacing: 8, children: [
                            FilledButton(
                                onPressed: () async {
                                  await Navigator.of(context).push(
                                      MaterialPageRoute<void>(
                                          builder: (_) => VehicleDetail(
                                              api: widget.api,
                                              registration:
                                                  v['registrationNumber'],
                                              onTicket: widget.onTicket)));
                                  if (mounted) await load();
                                },
                                child: const Text('View Details')),
                            OutlinedButton(
                                onPressed: () =>
                                    status(v['registrationNumber']),
                                child: const Text('Check Status'))
                          ]),
                        ]))),
          Wrap(spacing: 8, children: [
            TextButton(
                onPressed: page == 1 || busy
                    ? null
                    : () {
                        page--;
                        unawaited(load());
                      },
                child: const Text('Previous vehicles')),
            Text('Page $page'),
            TextButton(
                onPressed: page * 10 >= data!['total'] || busy
                    ? null
                    : () {
                        page++;
                        unawaited(load());
                      },
                child: const Text('Next vehicles'))
          ]),
        ],
        Text('Vehicle Link Requests',
            style: Theme.of(context).textTheme.titleLarge),
        const Text(
            'Administrator approval is required. Pending requests do not grant vehicle access.'),
        if (requests.isEmpty) const Text('No vehicle link requests.'),
        for (final r in requests)
          Card(
              child: ListTile(
                  title: Text('${r['registration']} · ${readable(r['kind'])}'),
                  subtitle: Text(
                      'Submitted ${r['submittedAt'].toString().substring(0, 10)}'),
                  trailing: StatusBadge(r['status']))),
        Wrap(spacing: 8, children: [
          TextButton(
              onPressed: requestPage == 1 || busy
                  ? null
                  : () {
                      requestPage--;
                      unawaited(load());
                    },
              child: const Text('Previous requests')),
          TextButton(
              onPressed: requestPage * 10 >= requestTotal || busy
                  ? null
                  : () {
                      requestPage++;
                      unawaited(load());
                    },
              child: const Text('Next requests'))
        ]),
      ]);
}

class VehicleRegistration extends StatefulWidget {
  const VehicleRegistration({required this.api, super.key});
  final AccountApi api;
  @override
  State<VehicleRegistration> createState() => _VehicleRegistrationState();
}

class _VehicleRegistrationState extends State<VehicleRegistration> {
  final plate = TextEditingController();
  Map<String, dynamic>? check;
  bool busy = false;
  String error = '';
  @override
  void dispose() {
    plate.dispose();
    super.dispose();
  }

  Future<void> act(bool submit) async {
    setState(() {
      busy = true;
      error = '';
    });
    try {
      if (submit) {
        await widget.api('/motorist/vehicles/link-request',
            {'registration': check!['registration']});
        if (mounted) Navigator.pop(context);
      } else {
        final result = await widget.api(
            '/motorist/vehicles/check', {'registration': plate.text.trim()});
        if (mounted) setState(() => check = Map<String, dynamic>.from(result));
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Register Vehicle')),
      body: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text(
                'Add a vehicle to your Smart Traffic account for infringement and payment tracking.'),
            const Text(
                'Internal account registration only. Ownership requires administrator verification.'),
            const SizedBox(height: 16),
            TextField(
                controller: plate,
                enabled: !busy,
                maxLength: 20,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                    labelText: 'Vehicle Registration Number',
                    hintText: 'ABC1234'),
                onChanged: (_) => setState(() => check = null)),
            if (error.isNotEmpty) Text(error),
            FilledButton(
                onPressed: busy ? null : () => act(false),
                child: const Text('Check Vehicle')),
            if (check != null) ...[
              Text(check!['registration'],
                  style: Theme.of(context).textTheme.titleLarge),
              StatusBadge(check!['ownershipStatus']),
              Text(check!['message']),
              if (check!['ownershipStatus'] != 'VERIFIED')
                FilledButton(
                    onPressed: busy ? null : () => act(true),
                    child: const Text('Submit Link Request'))
            ],
            if (busy) const LinearProgressIndicator(),
            const Text(prototypeNotice, textAlign: TextAlign.center),
          ])));
}

class VehicleDetail extends StatefulWidget {
  const VehicleDetail(
      {required this.api,
      required this.registration,
      required this.onTicket,
      super.key});
  final AccountApi api;
  final String registration;
  final Future<void> Function(String) onTicket;
  @override
  State<VehicleDetail> createState() => _VehicleDetailState();
}

class _VehicleDetailState extends State<VehicleDetail> {
  Map<String, dynamic>? data;
  final nickname = TextEditingController();
  String error = '', message = '';
  bool busy = false;
  int page = 1;
  String get path => '/motorist/vehicles/${widget.registration}';
  @override
  void initState() {
    super.initState();
    unawaited(load());
  }

  @override
  void dispose() {
    nickname.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() => busy = true);
    try {
      final result = await widget.api('$path?page=$page&pageSize=10');
      if (mounted) {
        setState(() {
          if (data == null) nickname.text = result['nickname'] ?? '';
          data = Map<String, dynamic>.from(result);
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> save(bool unlink) async {
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await widget.api(
          unlink ? '$path/unlink-request' : path,
          unlink ? <String, dynamic>{} : {'nickname': nickname.text},
          unlink ? 'POST' : 'PATCH');
      if (mounted) {
        setState(() => message = unlink
            ? 'Unlink request submitted for supervisor or administrator review.'
            : 'Nickname saved.');
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: Text(widget.registration)),
      body: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (busy) const LinearProgressIndicator(),
            if (error.isNotEmpty) Text(error),
            if (message.isNotEmpty) Text(message),
            if (data != null) ...[
              Text('Vehicle Overview',
                  style: Theme.of(context).textTheme.headlineSmall),
              Text('${data!['make']} ${data!['model']} · ${data!['colour']}'),
              Text(data!['statusSource']),
              Wrap(spacing: 8, children: [
                StatusBadge(data!['registrationStatus']),
                const StatusBadge('VERIFIED')
              ]),
              Text(
                  'Last link verification: ${data!['linkVerifiedAt'] ?? 'Not recorded'}'),
              Text(
                  '${data!['activeInfringements']} active infringements · ${data!['paidInfringements']} paid'),
              Text(
                  'Outstanding: ${formatCurrency(data!['totalPayable'], data!['currency'])}',
                  style: Theme.of(context).textTheme.titleLarge),
              Text(
                  'Paid amount: ${formatCurrency(data!['paidAmount'], data!['currency'])}'),
              OutlinedButton(
                  onPressed: busy ? null : load,
                  child: const Text('Check Registration Status')),
              Text('Traffic Infringements',
                  style: Theme.of(context).textTheme.titleLarge),
              const Text(
                  'Only infringements assigned to your account are shown.'),
              if ((data!['infringements']['items'] as List).isEmpty)
                const Text('No linked infringements found.'),
              for (final t in data!['infringements']['items'])
                Card(
                    child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(t['category']),
                              Text(ticketLabel(t)),
                              Text(
                                  '${formatCurrency(t['amount'], t['currency'])} · ${t['demeritPoints']} points'),
                              StatusBadge(t['paymentStatus']),
                              TextButton(
                                  onPressed: () =>
                                      widget.onTicket(t['reference']),
                                  child: const Text('View Ticket'))
                            ]))),
              Wrap(children: [
                TextButton(
                    onPressed: page == 1 || busy
                        ? null
                        : () {
                            page--;
                            unawaited(load());
                          },
                    child: const Text('Previous infringements')),
                TextButton(
                    onPressed:
                        page * 10 >= data!['infringements']['total'] || busy
                            ? null
                            : () {
                                page++;
                                unawaited(load());
                              },
                    child: const Text('Next infringements'))
              ]),
              Text('Manage Vehicle',
                  style: Theme.of(context).textTheme.titleLarge),
              TextField(
                  controller: nickname,
                  maxLength: 60,
                  decoration: const InputDecoration(
                      labelText: 'Nickname (optional)',
                      hintText: 'Family car')),
              FilledButton(
                  onPressed: busy ? null : () => save(false),
                  child: const Text('Save nickname')),
              const Text(
                  'Unlinking requires supervisor or administrator review and no outstanding infringements. Existing tickets remain on your account.'),
              OutlinedButton(
                  onPressed: busy || data!['activeInfringements'] > 0
                      ? null
                      : () => save(true),
                  child: const Text('Request Unlink')),
              Text('Vehicle History',
                  style: Theme.of(context).textTheme.titleLarge),
              if ((data!['history'] as List).isEmpty)
                const Text('No account-link events recorded.'),
              for (final r in data!['history'])
                Text(
                    '${readable(r['kind'])} request · ${readable(r['status'])} · ${r['submittedAt'].toString().substring(0, 10)}'),
            ],
            const Text(prototypeNotice, textAlign: TextAlign.center),
          ])));
}
