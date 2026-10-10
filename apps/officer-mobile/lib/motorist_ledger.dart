import 'vehicle_workspace.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:uuid/uuid.dart';
import 'role_workspace.dart';
import 'presentation.dart';

String ledgerMoney(dynamic value, [String? currency]) =>
    formatCurrency(value, currency);
String ledgerDate(dynamic value) => value == null
    ? 'Not specified'
    : DateTime.parse(value.toString()).toLocal().toString().substring(0, 16);

class MotoristLedger extends StatefulWidget {
  const MotoristLedger(
      {required this.api, this.page = 'Dashboard', this.onNavigate, super.key});
  final String page;
  final ValueChanged<String>? onNavigate;
  final AccountApi api;
  @override
  State<MotoristLedger> createState() => _MotoristLedgerState();
}

class _MotoristLedgerState extends State<MotoristLedger> {
  String get tab => widget.page;
  String error = '';
  Map<String, dynamic>? summary;
  List<dynamic> rows = [];
  int page = 1, total = 0;
  bool busy = false;
  int loadGeneration = 0;
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
  void didUpdateWidget(covariant MotoristLedger oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.page != widget.page) {
      page = 1;
      rows = [];
      unawaited(load());
    }
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    final generation = ++loadGeneration;
    if (tab == 'Vehicles') {
      setState(() {
        busy = false;
        error = '';
      });
      return;
    }
    final requestedTab = tab;
    final requestedPage = page;
    setState(() {
      busy = true;
    });
    try {
      final overview = await widget.api('/motorist/dashboard');
      final endpoint = {
        'Dashboard': 'infringements',
        'Infringements': 'infringements',
        'Payments': 'payments',
        'Vehicles': 'vehicles',
        'My Reports': 'incidents'
      }[requestedTab];
      final result = await widget
          .api('/motorist/$endpoint?page=$requestedPage&pageSize=10');
      if (mounted && generation == loadGeneration) {
        setState(() {
          summary = Map<String, dynamic>.from(overview);
          rows = result['items'];
          total = result['total'];
          error = '';
        });
      }
    } catch (e) {
      if (mounted && generation == loadGeneration) {
        setState(() {
          error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    } finally {
      if (mounted && generation == loadGeneration) {
        setState(() {
          busy = false;
        });
      }
    }
  }

  Future<void> pay(
      {Map<String, dynamic>? ticket, Map<String, dynamic>? payment}) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) =>
            PaymentScreen(api: widget.api, ticket: ticket, payment: payment)));
    if (mounted) await load();
  }

  Future<void> detail(String reference) async {
    try {
      final data = await widget.api('/motorist/infringements/$reference');
      if (!mounted) return;
      await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
                  title: Text(data['category']),
                  content: SingleChildScrollView(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                        SelectableText(ticketLabel(data)),
                        Text('${data['registration']} • ${data['location']}'),
                        Text(data['description']),
                        Text(
                            'Officer: ${data['officer']} ${data['serviceNumber'] ?? ''}'),
                        Text('Due: ${ledgerDate(data['dueAt'])}'),
                        Text(
                            '${ledgerMoney(data['amount'], data['currency'])} • ${data['demeritPoints']} points'),
                        StatusBadge(data['paymentStatus']),
                        const SizedBox(height: 16),
                        const Text('Status timeline'),
                        for (final event in data['timeline'])
                          Text(
                              '${readable(event['status'])} • ${ledgerDate(event['at'])}'),
                        const SizedBox(height: 16),
                        const Text('Payment history'),
                        if ((data['payments'] as List).isEmpty)
                          const Text('No payment history available.'),
                        for (final payment in data['payments'])
                          ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                  '${paymentMethodLabel(payment['method'])} • ${statusLabel(payment['status'])}'),
                              subtitle: Text(ledgerDate(payment['createdAt'])),
                              trailing: payment['status'] == 'SUCCESS'
                                  ? TextButton(
                                      onPressed: () => showReceipt(context,
                                          widget.api, payment['reference']),
                                      child: const Text('Receipt'))
                                  : null),
                      ])),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Back'))
                  ]));
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
        });
      }
    }
  }

  Widget metric(String label, dynamic value, IconData icon, Color color,
          String destination) =>
      InkWell(
          onTap: () => widget.onNavigate?.call(destination),
          borderRadius: BorderRadius.circular(9),
          child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: const Color(0xffd9e2e9)),
                  borderRadius: BorderRadius.circular(9)),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(icon, color: color, size: 27),
                    const SizedBox(height: 12),
                    Text(label,
                        style: const TextStyle(
                            fontSize: 13, color: Color(0xff536878))),
                    const SizedBox(height: 6),
                    Text('$value',
                        style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w700,
                            color: color))
                  ])));
  Widget fine(dynamic row) {
    final accent = paymentAccent(row['paymentStatus']);
    return Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        foregroundDecoration: BoxDecoration(
            border: Border(left: BorderSide(color: accent, width: 4))),
        decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: const Color(0xffd9e2e9)),
            borderRadius: BorderRadius.circular(9)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(
              row['paymentStatus'] == 'PAID'
                  ? Icons.check_circle_outline
                  : row['paymentStatus'] == 'PENDING'
                      ? Icons.schedule
                      : Icons.error_outline,
              color: accent,
              size: 24),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                InkWell(
                    onTap: () => detail(row['reference']),
                    child: Text(row['category'] ?? 'Traffic offence',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 17))),
                const SizedBox(height: 5),
                Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                        color: const Color(0xffeef2f6),
                        borderRadius: BorderRadius.circular(4)),
                    child: Text(ticketLabel(row),
                        style: const TextStyle(
                            fontSize: 12, color: Color(0xff40556b)))),
                const SizedBox(height: 6),
                Text('Vehicle: ${row['registration']}',
                    style: const TextStyle(
                        color: Color(0xff536878), fontSize: 13)),
                Text(ledgerDate(row['issuedAt']),
                    style: const TextStyle(
                        color: Color(0xff536878), fontSize: 12)),
                Text(row['location'] ?? '',
                    style: const TextStyle(
                        color: Color(0xff536878), fontSize: 12)),
                const SizedBox(height: 6),
                Text('${row['demeritPoints']} Demerit Points',
                    style: const TextStyle(
                        color: Color(0xff945300),
                        fontSize: 13,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 18),
                SizedBox(
                    width: double.infinity,
                    child: Wrap(
                        alignment: WrapAlignment.spaceBetween,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 16,
                        runSpacing: 8,
                        children: [
                          Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                    ledgerMoney(row['amount'], row['currency']),
                                    style: const TextStyle(
                                        fontSize: 21,
                                        fontWeight: FontWeight.w700,
                                        color: Color(0xff142d40))),
                                Text(statusLabel(row['paymentStatus']),
                                    style: TextStyle(
                                        color: accent,
                                        fontWeight: FontWeight.w600))
                              ]),
                          if (['PENDING', 'OVERDUE']
                              .contains(row['paymentStatus']))
                            FilledButton(
                                style: FilledButton.styleFrom(
                                    backgroundColor: const Color(0xff07518a),
                                    shape: RoundedRectangleBorder(
                                        borderRadius:
                                            BorderRadius.circular(9))),
                                onPressed: busy
                                    ? null
                                    : () => pay(
                                        ticket: Map<String, dynamic>.from(row)),
                                child: const Text('Pay Now')),
                          if (row['paymentStatus'] == 'PAID' &&
                              row['receiptPaymentReference'] != null)
                            OutlinedButton(
                                onPressed: () => showReceipt(context,
                                    widget.api, row['receiptPaymentReference']),
                                child: const Text('View Receipt'))
                        ])),
              ]))
        ]));
  }

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (tab == 'Dashboard')
          Card(
              margin: const EdgeInsets.only(bottom: 16),
              child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Welcome back',
                            style: TextStyle(
                                fontSize: 24, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        const Text('Here is your traffic account overview.',
                            style: TextStyle(color: Color(0xff536878))),
                        const SizedBox(height: 22),
                        if (summary != null)
                          LayoutBuilder(builder: (context, constraints) {
                            final columns = constraints.maxWidth > 650 ? 4 : 2;
                            final width =
                                (constraints.maxWidth - (columns - 1) * 12) /
                                    columns;
                            final metrics = [
                              metric(
                                  'Total Payable',
                                  ledgerMoney(summary!['totalPayable'],
                                      summary!['currency']),
                                  Icons.receipt_long,
                                  const Color(0xffbe342b),
                                  'Infringements'),
                              metric(
                                  'Pending Fines',
                                  summary!['pendingFines'],
                                  Icons.schedule,
                                  const Color(0xffa65a00),
                                  'Infringements'),
                              metric(
                                  'Demerit Points',
                                  '${summary!['demeritPoints']} pts',
                                  Icons.shield_outlined,
                                  const Color(0xff142d40),
                                  'Infringements'),
                              metric(
                                  'Registered Vehicles',
                                  summary!['registeredVehicles'],
                                  Icons.directions_car_outlined,
                                  const Color(0xff167044),
                                  'Vehicles')
                            ];
                            return Wrap(
                                spacing: 12,
                                runSpacing: 12,
                                children: metrics
                                    .map(
                                        (m) => SizedBox(width: width, child: m))
                                    .toList());
                          })
                      ])))
        else if (tab != 'Vehicles')
          Padding(
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: Text(tab == 'Infringements' ? 'My Infringements' : tab,
                  style: const TextStyle(
                      fontSize: 24, fontWeight: FontWeight.w700))),
        if (tab == 'Dashboard')
          Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(children: [
                const Expanded(
                    child: Text('Recent Infringements',
                        style: TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w700))),
                TextButton(
                    onPressed: () => widget.onNavigate?.call('Infringements'),
                    child: const Text('View all'))
              ])),
        if (busy) const LinearProgressIndicator(),
        if (error.isNotEmpty) Semantics(liveRegion: true, child: Text(error)),
        if (tab == 'Vehicles')
          VehicleWorkspace(api: widget.api, onTicket: detail)
        else ...[
          if (!busy && rows.isEmpty)
            Padding(
                padding: const EdgeInsets.all(20),
                child: Text(tab == 'Payments'
                    ? 'No payment history available.'
                    : tab == 'My Reports'
                        ? 'No incidents found.'
                        : 'No traffic infringements found.')),
          for (final row in tab == 'Dashboard' ? rows.take(3) : rows)
            if (tab == 'Dashboard' || tab == 'Infringements')
              fine(row)
            else
              Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (tab == 'Payments') ...[
                              Text(
                                  '${ledgerMoney(row['amount'], row['currency'])} \u00b7 ${paymentMethodLabel(row['method'])}',
                                  style: const TextStyle(
                                      fontSize: 17,
                                      fontWeight: FontWeight.w700)),
                              StatusBadge(row['status']),
                              Text(
                                  'Ticket: ${row['ticketDisplayReference'] ?? 'Traffic ticket'}'),
                              Text('Transaction: ${row['reference']}'),
                              Text(ledgerDate(row['createdAt'])),
                              if (row['failureReason'] != null)
                                Text(row['failureReason']),
                              if (row['status'] == 'SUCCESS')
                                OutlinedButton(
                                    onPressed: () => showReceipt(
                                        context, widget.api, row['reference']),
                                    child: const Text('View Receipt')),
                              if (row['status'] == 'PROCESSING')
                                FilledButton(
                                    onPressed: () => pay(
                                        payment:
                                            Map<String, dynamic>.from(row)),
                                    child: const Text('Resume payment')),
                            ] else ...[
                              Text(readable(row['type'])),
                              Text(row['location']),
                              Text(ledgerDate(row['createdAt'])),
                              StatusBadge(row['status'])
                            ]
                          ]))),
          if (tab != 'Dashboard')
            Wrap(
                spacing: 12,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  OutlinedButton(
                      onPressed: busy || page == 1
                          ? null
                          : () {
                              page--;
                              unawaited(load());
                            },
                      child: const Text('Previous')),
                  Text('Page $page - $total records'),
                  OutlinedButton(
                      onPressed: busy || page * 10 >= total
                          ? null
                          : () {
                              page++;
                              unawaited(load());
                            },
                      child: const Text('Next'))
                ])
        ]
      ]);
}

class PaymentScreen extends StatefulWidget {
  const PaymentScreen(
      {required this.api, this.ticket, this.payment, super.key});
  final AccountApi api;
  final Map<String, dynamic>? ticket, payment;
  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  final form = GlobalKey<FormState>();
  final requestKey = const Uuid().v4();
  String method = 'ECOCASH', error = '';
  Map<String, dynamic>? payment;
  bool busy = false, uncertain = false;
  @override
  void initState() {
    super.initState();
    payment = widget.payment;
  }

  Future<void> perform(Future<dynamic> Function() work) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final result = await work();
      if (mounted) {
        setState(() {
          payment = Map<String, dynamic>.from(result);
          uncertain = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString().replaceFirst('Exception: ', '');
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

  Widget testField(String label, String value, {bool secret = false}) =>
      Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: TextFormField(
              key: ValueKey(label),
              initialValue: value,
              enabled: !busy && !uncertain,
              obscureText: secret,
              decoration: InputDecoration(
                  labelText: label, border: const OutlineInputBorder()),
              validator: (text) =>
                  text == value ? null : 'Use the supplied test value: $value',
              keyboardType: label.contains('name')
                  ? TextInputType.text
                  : TextInputType.number));
  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Pay Traffic Fine')),
      body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(20), children: [
        const Text('Payment simulation. No money is collected.',
            style: TextStyle(fontWeight: FontWeight.w600)),
        if (busy) const LinearProgressIndicator(),
        if (error.isNotEmpty) Semantics(liveRegion: true, child: Text(error)),
        if (payment == null)
          Form(
              key: form,
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(widget.ticket!['category'],
                        style: Theme.of(context).textTheme.titleLarge),
                    Text(widget.ticket!['registration']),
                    SelectableText(ticketLabel(widget.ticket!)),
                    Text(ledgerMoney(widget.ticket!['amount'])),
                    DropdownButtonFormField<String>(
                        initialValue: method,
                        decoration:
                            const InputDecoration(labelText: 'Payment method'),
                        items: const [
                          DropdownMenuItem(
                              value: 'ECOCASH', child: Text('EcoCash')),
                          DropdownMenuItem(
                              value: 'INNBUCKS', child: Text('InnBucks')),
                          DropdownMenuItem(
                              value: 'CARD', child: Text('Bank Card'))
                        ],
                        onChanged: busy || uncertain
                            ? null
                            : (value) => setState(() {
                                  method = value!;
                                })),
                    if (method == 'CARD') ...[
                      const Text(
                          'Use test details only. Card fields stay on this device.'),
                      testField('Cardholder name', 'Test Motorist'),
                      testField('Test card number', '4242 4242 4242 4242'),
                      testField('Test expiry', '12/30'),
                      testField('Test CVV', '123', secret: true)
                    ] else ...[
                      testField('Test mobile number', '0770000000'),
                      const Text('No SMS or provider request is sent.')
                    ],
                    FilledButton(
                        onPressed: busy
                            ? null
                            : () {
                                if (!uncertain &&
                                    !form.currentState!.validate()) {
                                  return;
                                }
                                setState(() {
                                  uncertain = true;
                                });
                                unawaited(perform(
                                    () => widget.api('/motorist/payments', {
                                          'reference':
                                              widget.ticket!['reference'],
                                          'requestKey': requestKey,
                                          'method': method,
                                          if (method == 'CARD') 'last4': '4242'
                                        })));
                              },
                        child: Text(uncertain
                            ? 'Retry same payment request'
                            : 'Continue')),
                  ]))
        else ...[
          SelectableText(payment!['reference']),
          Text(
              '${ledgerMoney(payment!['amount'], payment!['currency'])} • ${paymentMethodLabel(payment!['method'])}'),
          StatusBadge(payment!['status']),
          if (payment!['failureReason'] != null)
            Text(payment!['failureReason']),
          if (payment!['status'] == 'PROCESSING') ...[
            const Text(
                'Choose a simulated outcome. No funds will be deducted.'),
            Wrap(
                spacing: 8,
                children: ['APPROVE', 'DECLINE', 'TIMEOUT', 'ERROR', 'CANCEL']
                    .map((outcome) => OutlinedButton(
                        onPressed: busy
                            ? null
                            : () => perform(() => widget.api(
                                '/motorist/payments/${payment!['reference']}/outcome',
                                {'outcome': outcome})),
                        child: Text('Simulate ${readable(outcome)}')))
                    .toList())
          ],
          if (payment!['status'] == 'SUCCESS')
            FilledButton(
                onPressed: () =>
                    showReceipt(context, widget.api, payment!['reference']),
                child: const Text('View Receipt')),
        ],
        TextButton(
            onPressed: busy ? null : () => Navigator.pop(context),
            child: const Text('Return to Dashboard')),
        const Center(
            child: Text('Academic Prototype', style: TextStyle(fontSize: 11))),
      ])));
}

Future<void> showReceipt(
    BuildContext context, AccountApi api, String reference) async {
  try {
    final r = await api('/motorist/payments/$reference/receipt');
    if (!context.mounted) return;
    final text = [
      'ZRP Smart Traffic Management System',
      'PAYMENT RECEIPT',
      'Receipt: ${r['receiptReference']}',
      'Transaction: ${r['reference']}',
      'Ticket: ${r['ticketDisplayReference'] ?? 'Traffic ticket'}',
      'Motorist: ${r['motorist']}',
      'Vehicle: ${r['registration']}',
      'Offence: ${r['offence']}',
      'Amount: ${ledgerMoney(r['amount'], r['currency'])}',
      'Method: ${paymentMethodLabel(r['method'])}',
      'Status: ${statusLabel(r['status'])}',
      'Date: ${ledgerDate(r['paidAt'])}',
      r['notice']
    ].join('\n');
    Future<void> export(String action) async {
      try {
        await const MethodChannel('traffic/receipts').invokeMethod(
            action, {'text': text, 'filename': '${r['receiptReference']}.txt'});
      } catch (_) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text(
                  'Receipt export unavailable on this device. You can select and copy the receipt.')));
        }
      }
    }

    await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Payment Receipt'),
                content: SingleChildScrollView(child: SelectableText(text)),
                actions: [
                  TextButton(
                      onPressed: () => export('print'),
                      child: const Text('Print / Save PDF')),
                  TextButton(
                      onPressed: () => export('save'),
                      child: const Text('Download Receipt')),
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Close'))
                ]));
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }
}
