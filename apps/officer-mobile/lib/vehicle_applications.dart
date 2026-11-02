import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';
import 'role_workspace.dart';
import 'presentation.dart';

class VehicleApplicationsButton extends StatelessWidget {
  const VehicleApplicationsButton(
      {required this.api, this.staff = false, super.key});
  final AccountApi api;
  final bool staff;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: OutlinedButton.icon(
        icon: const Icon(Icons.folder_copy_outlined),
        label: Text(staff
            ? 'Review vehicle applications'
            : 'New vehicle application & status'),
        onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
            builder: (_) => VehicleApplicationsScreen(api: api, staff: staff))),
      ));
}

class VehicleApplicationsScreen extends StatefulWidget {
  const VehicleApplicationsScreen(
      {required this.api, this.staff = false, super.key});
  final AccountApi api;
  final bool staff;
  @override
  State<VehicleApplicationsScreen> createState() =>
      _VehicleApplicationsScreenState();
}

class _VehicleApplicationsScreenState extends State<VehicleApplicationsScreen> {
  String get base => widget.staff
      ? '/supervisor/vehicle-applications'
      : '/motorist/vehicle-applications';
  final fields = {
    for (final name in [
      'registration',
      'make',
      'model',
      'year',
      'colour',
      'chassis',
      'engine'
    ])
      name: TextEditingController()
  };
  final form = GlobalKey<FormState>();
  final reviewReason = TextEditingController();
  List<dynamic> rows = [], categories = [];
  Map<String, dynamic>? detail;
  String error = '',
      message = '',
      category = '',
      relationship = 'OWNER',
      method = 'ECOCASH',
      decision = 'CHANGES_REQUESTED';
  String requestKey = const Uuid().v4();
  int page = 1, total = 0, maxBytes = 10485760, maxAttachments = 5;
  bool busy = false, creating = false, declaration = false, checked = false;
  Timer? timer;
  bool get editable =>
      !widget.staff &&
      (creating || ['DRAFT', 'CHANGES_REQUESTED'].contains(detail?['status']));
  @override
  void initState() {
    super.initState();
    work(() async {
      await load();
      if (!widget.staff) {
        categories = await widget.api('/vehicle-categories');
        final limits =
            await widget.api('/motorist/vehicle-applications/limits');
        maxBytes = limits['maxFileBytes'];
        maxAttachments = limits['maxAttachments'];
      }
    });
    timer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (!busy && detail == null && !creating) {
        unawaited(work(load));
      }
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    for (final field in fields.values) {
      field.dispose();
    }
    reviewReason.dispose();
    super.dispose();
  }

  Future<void> work(Future<void> Function() fn) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await fn();
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

  Future<void> load() async {
    final data = await widget.api('$base?page=$page&pageSize=10');
    if (!mounted) return;
    rows = data['items'];
    total = data['total'];
  }

  void populate(Map<String, dynamic> data) {
    detail = data;
    creating = false;
    category = data['categoryId'];
    relationship = data['relationship'];
    declaration = data['declaration'];
    for (final name in fields.keys) {
      fields[name]!.text = '${data[name] ?? ''}';
    }
  }

  Future<void> open(String id) async {
    final data = await widget.api('$base/$id');
    if (mounted) {
      populate(Map<String, dynamic>.from(data));
      checked = false;
      reviewReason.clear();
    }
  }

  Future<void> save() async {
    if (!form.currentState!.validate()) return;
    await work(() async {
      final dto = <String, dynamic>{
        for (final entry in fields.entries) entry.key: entry.value.text.trim(),
        'year': int.parse(fields['year']!.text),
        'requestKey': requestKey,
        'categoryId': category,
        'revision': detail?['revision'] ?? 0,
        'relationship': relationship,
        'declaration': declaration
      };
      final result = await widget.api(
          detail == null ? base : '$base/${detail!['requestId']}',
          dto,
          detail == null ? 'POST' : 'PATCH');
      if (mounted) {
        populate(Map<String, dynamic>.from(result));
        message =
            'Draft saved. Add the required attachments before submitting.';
      }
      await load();
    });
  }

  Future<void> upload(String kind, bool camera) async {
    await work(() async {
      List<int>? bytes;
      String name;
      if (camera) {
        final file = await ImagePicker().pickImage(
            source: ImageSource.camera,
            preferredCameraDevice: CameraDevice.rear);
        if (file == null) return;
        if (await file.length() > maxBytes) {
          throw Exception('Photo exceeds the file size limit.');
        }
        bytes = await file.readAsBytes();
        name = file.name;
      } else {
        final file = await FilePicker.pickFile(
            type: FileType.custom,
            allowedExtensions: kind == 'OWNERSHIP'
                ? ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif']
                : ['jpg', 'jpeg', 'png', 'heic', 'heif']);
        if (file == null) return;
        if ((await file.length() ?? maxBytes + 1) > maxBytes) {
          throw Exception('File exceeds the file size limit.');
        }
        bytes = await file.readAsBytes();
        name = file.name;
      }
      final ext = name.split('.').last.toLowerCase();
      if (['heic', 'heif'].contains(ext)) {
        throw Exception('Convert HEIC/HEIF to JPEG or PNG before uploading.');
      }
      final mime = ext == 'pdf'
          ? 'application/pdf'
          : ext == 'png'
              ? 'image/png'
              : 'image/jpeg';
      await widget.api(
          '$base/${detail!['requestId']}/files/$kind',
          {'fileBytes': bytes, 'fileName': name, 'mimeType': mime},
          'MULTIPART');
      await open(detail!['requestId']);
      message = 'Attachment uploaded.';
    });
  }

  Future<void> viewFile(Map<String, dynamic> file) async {
    await work(() async {
      final data = await widget
          .api('/vehicle-application-files/${file['id']}/download', {});
      const apiBase = String.fromEnvironment('API_URL',
          defaultValue: 'http://10.0.2.2:3000/api/v1');
      final uri = Uri.parse(apiBase).resolve(data['url']);
      if (!mounted) return;
      await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
                title: Text(readable(file['kind'])),
                content: file['mimeType'].toString().startsWith('image/')
                    ? Image.network(uri.toString(),
                        errorBuilder: (context, error, stack) => const Text(
                            'Preview unavailable or expired. Open the attachment again.'))
                    : const Text(
                        'PDF document. The private download link expires after two minutes.'),
                actions: [
                  TextButton(
                      onPressed: () async {
                        if (!await launchUrl(uri,
                                mode: LaunchMode.externalApplication) &&
                            context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                  content:
                                      Text('No document viewer available.')));
                        }
                      },
                      child: const Text('Open / download')),
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Close'))
                ],
              ));
    });
  }

  Future<void> review() async {
    if (!checked || reviewReason.text.trim().length < 3) {
      setState(() {
        error = 'Check the documents and enter a review reason.';
      });
      return;
    }
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: Text('Confirm ${readable(decision)}?'),
                content: Text(reviewReason.text),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Confirm decision'))
                ]));
    if (confirmed != true || !mounted) return;
    await work(() async {
      final data = await widget.api('$base/${detail!['requestId']}/review', {
        'revision': detail!['revision'],
        'status': decision,
        'reason': reviewReason.text.trim(),
        'checked': true
      });
      if (mounted) {
        populate(Map<String, dynamic>.from(data));
      }
      await load();
    });
  }

  Widget field(String name, String label, {bool optional = false}) => Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextFormField(
          controller: fields[name],
          enabled: !busy,
          decoration: InputDecoration(labelText: label),
          keyboardType:
              name == 'year' ? TextInputType.number : TextInputType.text,
          maxLength: name == 'year'
              ? 4
              : name == 'chassis'
                  ? 40
                  : 60,
          validator: (value) {
            if (!optional && (value ?? '').trim().isEmpty) {
              return 'Enter $label.';
            }
            if (name == 'year' &&
                ((int.tryParse(value ?? '') ?? 0) < 1886 ||
                    (int.tryParse(value ?? '') ?? 9999) >
                        DateTime.now().year + 1)) {
              return 'Enter a valid manufacture year.';
            }
            return null;
          }));
  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(
          title: Text(widget.staff
              ? 'Vehicle application reviews'
              : 'Vehicle applications')),
      body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(18), children: [
        const Text(
            'Document review is required. Processing fees are illustrative and payments are simulated.'),
        if (busy) const LinearProgressIndicator(),
        if (error.isNotEmpty)
          Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(error,
                  style:
                      TextStyle(color: Theme.of(context).colorScheme.error))),
        if (message.isNotEmpty) Text(message),
        if (!creating && detail == null) ...[
          if (!widget.staff)
            FilledButton(
                onPressed: busy
                    ? null
                    : () => setState(() {
                          creating = true;
                          requestKey = const Uuid().v4();
                          category = categories.isNotEmpty
                              ? categories.first['id']
                              : '';
                          for (final f in fields.values) {
                            f.clear();
                          }
                          declaration = false;
                        }),
                child: const Text('Start new application')),
          if (rows.isEmpty)
            const Padding(
                padding: EdgeInsets.all(20),
                child: Text('No vehicle applications found.')),
          for (final row in rows)
            Card(
                child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(row['registration'],
                              style: const TextStyle(
                                  fontSize: 20, fontWeight: FontWeight.bold)),
                          Text('${row['make']} ${row['model']}'),
                          StatusBadge(row['status']),
                          Text(formatCurrency(row['feeMinor'] / 100)),
                          if (row['applicant'] != null)
                            Text(row['applicant']['name']),
                          OutlinedButton(
                              onPressed: busy
                                  ? null
                                  : () => work(() => open(row['requestId'])),
                              child: const Text('View application'))
                        ]))),
          Wrap(spacing: 12, children: [
            TextButton(
                onPressed: busy || page == 1
                    ? null
                    : () {
                        page--;
                        work(load);
                      },
                child: const Text('Previous')),
            Text('Page $page · $total'),
            TextButton(
                onPressed: busy || page * 10 >= total
                    ? null
                    : () {
                        page++;
                        work(load);
                      },
                child: const Text('Next'))
          ]),
        ],
        if (creating || detail != null)
          OutlinedButton(
              onPressed: busy
                  ? null
                  : () => setState(() {
                        detail = null;
                        creating = false;
                      }),
              child: const Text('Back to applications')),
        if (detail != null) ...[
          Text(detail!['registration'],
              style:
                  const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          StatusBadge(detail!['status']),
          Text('Saved fee: ${formatCurrency(detail!['feeMinor'] / 100)}'),
          if (detail!['reviewNote'] != null)
            Text('Reviewer feedback: ${detail!['reviewNote']}'),
          if (detail!['applicant'] != null)
            Text('Applicant: ${detail!['applicant']['name']}'),
          if (detail!['linkedToAnotherMotorist'] == true)
            const Text(
                'Ownership conflict: linked to another account. Approval is blocked pending a separate verified transfer.'),
        ],
        if (editable)
          Form(
              key: form,
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                        initialValue: category.isEmpty ? null : category,
                        isExpanded: true,
                        decoration: const InputDecoration(
                            labelText: 'Vehicle category'),
                        items: [
                          for (final c in categories)
                            DropdownMenuItem(
                                value: c['id'] as String,
                                child: Text(
                                    '${c['label']} · ${formatCurrency(c['feeMinor'] / 100)}',
                                    overflow: TextOverflow.ellipsis))
                        ],
                        onChanged:
                            busy || detail?['status'] == 'CHANGES_REQUESTED'
                                ? null
                                : (v) => setState(() {
                                      category = v!;
                                    }),
                        validator: (v) =>
                            v == null ? 'Select a category.' : null),
                    const SizedBox(height: 16),
                    field('registration', 'Registration number'),
                    field('make', 'Make'),
                    field('model', 'Model'),
                    field('year', 'Manufacture year'),
                    field('colour', 'Colour'),
                    field('chassis', 'VIN / chassis number'),
                    field('engine', 'Engine number (optional)', optional: true),
                    DropdownButtonFormField<String>(
                        initialValue: relationship,
                        isExpanded: true,
                        decoration: const InputDecoration(
                            labelText: 'Applicant relationship'),
                        items: [
                          for (final r in [
                            'OWNER',
                            'AUTHORISED_DRIVER',
                            'COMPANY_REPRESENTATIVE'
                          ])
                            DropdownMenuItem(value: r, child: Text(readable(r)))
                        ],
                        onChanged: busy ? null : (v) => relationship = v!),
                    CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: declaration,
                        onChanged: busy
                            ? null
                            : (v) => setState(() {
                                  declaration = v!;
                                }),
                        title: const Text(
                            'I declare that these details are accurate.')),
                    FilledButton(
                        onPressed: busy ? null : save,
                        child: const Text('Save draft details')),
                  ])),
        if (detail != null) ...[
          if (!editable) ...[
            for (final key in [
              'make',
              'model',
              'year',
              'colour',
              'chassis',
              'engine',
              'relationship'
            ])
              Text('${readable(key)}: ${detail![key]}')
          ],
          const SizedBox(height: 18),
          const Text('Supporting documents & photographs',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20)),
          Text(
              'PDF, JPEG or PNG · ${maxBytes ~/ 1048576} MB per file · $maxAttachments attachments. Convert HEIC/HEIF before uploading.'),
          for (final kind in [
            'OWNERSHIP',
            'FRONT',
            'REAR_PLATE',
            'OTHER_1',
            'OTHER_2'
          ])
            attachment(kind),
          if (editable)
            FilledButton(
                onPressed: busy || !declaration
                    ? null
                    : () => work(() async {
                          final saved = await widget.api(
                              '$base/${detail!['requestId']}/submit', {
                            'revision': detail!['revision'],
                            'declaration': true
                          });
                          if (mounted) {
                            populate(Map<String, dynamic>.from(saved));
                            message = 'Submitted for review.';
                          }
                          await load();
                        }),
                child: const Text('Submit for review')),
          if (widget.staff && detail!['status'] == 'PENDING_REVIEW') ...[
            DropdownButtonFormField<String>(
                initialValue: decision,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Decision'),
                items: [
                  for (final s in ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'])
                    DropdownMenuItem(value: s, child: Text(readable(s)))
                ],
                onChanged: (v) => decision = v!),
            const SizedBox(height: 12),
            TextField(
                controller: reviewReason,
                maxLength: 1000,
                decoration:
                    const InputDecoration(labelText: 'Reason / feedback')),
            CheckboxListTile(
                value: checked,
                onChanged: (v) => setState(() {
                      checked = v!;
                    }),
                title: const Text(
                    'I checked the applicant, vehicle details and private documents.')),
            FilledButton(
                onPressed: busy ? null : review,
                child: const Text('Review decision')),
          ],
          const Text('Review history',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          if ((detail!['decisions'] as List).isEmpty)
            const Text('No review decisions yet.'),
          for (final d in detail!['decisions'])
            ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(readable(d['status'])),
                subtitle: Text(
                    '${d['reason']}\n${d['reviewer']['name']} · ${d['createdAt']}')),
          const Text('Application fee simulation',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          Text(
              '${formatCurrency(detail!['feeMinor'] / 100)} · Payment does not approve ownership.'),
          if (!widget.staff &&
              !['DRAFT', 'REJECTED'].contains(detail!['status']) &&
              !(detail!['payments'] as List).any(
                  (p) => ['SUCCESS', 'PROCESSING'].contains(p['status']))) ...[
            DropdownButtonFormField<String>(
                initialValue: method,
                decoration: const InputDecoration(labelText: 'Payment method'),
                items: [
                  for (final m in ['ECOCASH', 'INNBUCKS', 'CARD'])
                    DropdownMenuItem(
                        value: m, child: Text(paymentMethodLabel(m)))
                ],
                onChanged: (v) => method = v!),
            const Text(
                'Simulation only. Never enter a real phone PIN or card details.'),
            FilledButton(
                onPressed: busy
                    ? null
                    : () => work(() async {
                          await widget.api(
                              '/motorist/vehicle-applications/${detail!['requestId']}/payments',
                              {'requestKey': requestKey, 'method': method});
                          await open(detail!['requestId']);
                        }),
                child: const Text('Start simulated fee payment')),
          ],
          for (final p in detail!['payments'])
            Card(
                child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                              '${formatCurrency(p['feeMinor'] / 100)} · ${paymentMethodLabel(p['method'])}'),
                          StatusBadge(p['status']),
                          Text(p['reference']),
                          if (p['status'] == 'SUCCESS')
                            OutlinedButton(
                                onPressed: () => showDialog<void>(
                                    context: context,
                                    builder: (context) {
                                      final text =
                                          'Smart Traffic\nIn support of ZRP\nSimulated application fee receipt\n${p['receiptReference']}\n${p['reference']}\nVehicle: ${detail!['registration']}\n${formatCurrency(p['feeMinor'] / 100)} · ${paymentMethodLabel(p['method'])}\n${p['paidAt']}\n$prototypeNotice\nPayment does not approve ownership.';
                                      return AlertDialog(
                                          title: const Text(
                                              'Application fee receipt'),
                                          content: SingleChildScrollView(
                                              child: SelectableText(text)),
                                          actions: [
                                            TextButton(
                                                onPressed: () =>
                                                    Clipboard.setData(
                                                        ClipboardData(
                                                            text: text)),
                                                child:
                                                    const Text('Copy receipt')),
                                            TextButton(
                                                onPressed: () =>
                                                    Navigator.pop(context),
                                                child: const Text('Close'))
                                          ]);
                                    }),
                                child: const Text('View Receipt')),
                          if (!widget.staff && p['status'] == 'PROCESSING')
                            Wrap(spacing: 8, children: [
                              for (final outcome in [
                                'APPROVE',
                                'DECLINE',
                                'TIMEOUT',
                                'CANCEL'
                              ])
                                OutlinedButton(
                                    onPressed: busy
                                        ? null
                                        : () => work(() async {
                                              await widget.api(
                                                  '/motorist/application-payments/${p['reference']}/outcome',
                                                  {'outcome': outcome});
                                              requestKey = const Uuid().v4();
                                              await open(detail!['requestId']);
                                            }),
                                    child:
                                        Text('Simulate ${readable(outcome)}'))
                            ]),
                        ]))),
        ],
        const SizedBox(height: 20),
        const Text(prototypeNotice,
            textAlign: TextAlign.center, style: TextStyle(fontSize: 11)),
      ])));
  Widget attachment(String kind) {
    final found = (detail!['files'] as List).where((f) => f['kind'] == kind);
    final file = found.isEmpty ? null : Map<String, dynamic>.from(found.first);
    return Card(
        child: Padding(
            padding: const EdgeInsets.all(14),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                  '${readable(kind)}${kind.startsWith('OTHER') ? ' (optional)' : ' (required)'}',
                  style: const TextStyle(fontWeight: FontWeight.bold)),
              if (file == null)
                const Text('No file attached.')
              else ...[
                Text(
                    '${file['mimeType']} · ${(file['byteSize'] / 1024).ceil()} KB'),
                OutlinedButton(
                    onPressed: busy ? null : () => viewFile(file),
                    child: const Text('View private attachment'))
              ],
              if (editable)
                Wrap(spacing: 8, children: [
                  OutlinedButton(
                      onPressed: busy ? null : () => upload(kind, false),
                      child: const Text('Choose file / replace')),
                  OutlinedButton(
                      onPressed: busy ? null : () => upload(kind, true),
                      child: const Text('Take photo')),
                  if (file != null)
                    TextButton(
                        onPressed: busy
                            ? null
                            : () => work(() async {
                                  await widget.api(
                                      '/motorist/vehicle-application-files/${file['id']}/remove',
                                      {});
                                  await open(detail!['requestId']);
                                }),
                        child: const Text('Remove'))
                ]),
            ])));
  }
}
