import 'officer_shell.dart';
import 'ticket_qr.dart';
import 'driver_points.dart';
import 'dart:async';
import 'dart:convert';
import 'presentation.dart';
import 'role_workspace.dart';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http_parser/http_parser.dart';
import 'package:geolocator/geolocator.dart';

void main() => runApp(const OfficerApp());

class ApiFailure implements Exception {
  ApiFailure(this.status, this.message);
  final int status;
  final String message;
  @override
  String toString() => message;
}

class OfficerApp extends StatelessWidget {
  const OfficerApp({super.key, this.client});
  final http.Client? client;
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: productName,
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
            colorSchemeSeed: const Color(0xff14566a),
            useMaterial3: true,
            scaffoldBackgroundColor: const Color(0xfff1f4f7),
            appBarTheme: const AppBarTheme(
                backgroundColor: Color(0xff142d40),
                foregroundColor: Colors.white),
            cardTheme: CardThemeData(
                color: Colors.white,
                elevation: 0.5,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: const BorderSide(color: Color(0xffd9e2e9)))),
            inputDecorationTheme: const InputDecorationTheme(
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder())),
        home: OfficerScreen(client: client),
      );
}

class OfficerScreen extends StatefulWidget {
  const OfficerScreen({super.key, this.client});
  final http.Client? client;
  @override
  State<OfficerScreen> createState() => _OfficerScreenState();
}

class _OfficerScreenState extends State<OfficerScreen> {
  late final http.Client client = widget.client ?? http.Client();
  static const baseUrl = String.fromEnvironment('API_URL',
      defaultValue: 'http://10.0.2.2:3000/api/v1');
  final email = TextEditingController();
  final password = TextEditingController();
  final plate = TextEditingController();
  final location = TextEditingController();
  final notes = TextEditingController();
  final incidentLocation = TextEditingController();
  final incidentDescription = TextEditingController();
  String accountType = 'OFFICER';
  String accountRole = 'OFFICER';
  String accountId = '';
  String incidentType = 'ACCIDENT';
  String? motoristCode;
  String? responsibleDriverId;
  Map<String, dynamic>? pendingIncident;
  List<dynamic> incidents = [];
  String? token, identity, categoryId, draftId;
  String message = '';
  bool busy = false;
  bool editingDraft = false;
  int draftRevision = 0;
  Map<String, double>? coordinates, incidentCoordinates;
  Map<String, dynamic>? vehicle, ticket, pendingDraft;
  List<dynamic> categories = [], activity = [];

  @override
  void dispose() {
    if (widget.client == null) {
      client.close();
    }
    for (final controller in [
      email,
      password,
      plate,
      location,
      notes,
      incidentLocation,
      incidentDescription
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<dynamic> api(String path,
      [Map<String, dynamic>? body,
      String method = 'POST',
      String? accessToken]) async {
    final headers = {
      'Content-Type': 'application/json',
      if (accessToken != null || token != null)
        'Authorization': 'Bearer ${accessToken ?? token}'
    };
    late http.Response response;
    try {
      if (method == 'MULTIPART' && body != null) {
        final upload =
            http.MultipartRequest('POST', Uri.parse('$baseUrl$path'));
        upload.headers
            .addAll({if (token != null) 'Authorization': 'Bearer $token'});
        upload.files.add(http.MultipartFile.fromBytes(
            'file', body['fileBytes'] as List<int>,
            filename: body['fileName'] as String,
            contentType: MediaType.parse(body['mimeType'] as String)));
        response = await http.Response.fromStream(await client.send(upload))
            .timeout(const Duration(seconds: 60));
      } else {
        response = await (body == null
                ? client.get(Uri.parse('$baseUrl$path'), headers: headers)
                : method == 'PATCH'
                    ? client.patch(Uri.parse('$baseUrl$path'),
                        headers: headers, body: jsonEncode(body))
                    : client.post(Uri.parse('$baseUrl$path'),
                        headers: headers, body: jsonEncode(body)))
            .timeout(const Duration(seconds: 12));
      }
    } on TimeoutException {
      throw Exception(
          'Request timed out. Submission may have reached the server. Retry the same draft.');
    } on SocketException {
      throw Exception(
          'No network connection. Reconnect and retry the same draft.');
    } on http.ClientException {
      throw Exception(
          'API unavailable. Check the connection and retry the same draft.');
    }
    if (response.statusCode == 401 &&
        token != null &&
        accessToken == null &&
        path != '/public/tickets/verify') {
      token = null;
      identity = null;
      vehicle = null;
      ticket = null;
      activity = [];
      pendingDraft = null;
      draftId = null;
      password.clear();
      pendingIncident = null;
      incidents = [];
      motoristCode = null;
      editingDraft = false;
      coordinates = null;
      incidentCoordinates = null;
      if (mounted) setState(() {});
      throw Exception(
          'Session expired. Sign in, then check recent activity before creating a new draft.');
    }
    if (response.statusCode == 403) {
      throw Exception('Permission denied for this account.');
    }
    final dynamic result =
        response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode >= 400) {
      throw ApiFailure(
          response.statusCode,
          result is Map
              ? '${result['message']}'
              : 'Request failed (${response.statusCode})');
    }
    return result;
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() {
      busy = true;
      message = '';
    });
    try {
      await action();
    } catch (error) {
      if (mounted) {
        setState(() {
          message = error.toString().replaceFirst('Exception: ', '');
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

  Future<void> login() async {
    final result = await api('/auth/login', {
      'email': email.text.trim(),
      'password': password.text,
      'category': accountType
    });
    token = result['token'];
    if (result['user']['role'] != accountType ||
        !['USER', 'OFFICER', 'SUPERVISOR'].contains(result['user']['role'])) {
      try {
        await api('/auth/logout', {});
      } finally {
        token = null;
      }
      throw Exception('Choose the account type assigned to your account.');
    }
    accountRole = result['user']['role'];
    accountId = result['user']['id'] ?? '';
    identity = result['user']['name'];
    password.clear();
    if (accountRole == 'OFFICER') await refresh();
  }

  Future<void> refresh() async {
    categories = await api('/offence-categories') as List<dynamic>;
    if (!categories.any((dynamic category) => category['id'] == categoryId)) {
      categoryId = null;
    }
    final recent = await api('/offences?page=1&pageSize=20');
    activity = recent['items'];
    final reports = await api('/incidents?page=1&pageSize=20');
    incidents = reports['items'];
  }

  Future<void> lookup() async {
    responsibleDriverId = null;
    motoristCode = null;
    coordinates = null;
    vehicle = null;
    ticket = null;
    final result = await api(
        '/vehicles?registration=${Uri.encodeQueryComponent(plate.text.trim())}');
    if ((result['items'] as List).isEmpty) {
      message = 'No matching records.';
    } else {
      vehicle = Map<String, dynamic>.from(result['items'][0]);
    }
  }

  Future<void> saveDraft() async {
    if (pendingDraft == null) {
      if (vehicle == null ||
          categoryId == null ||
          location.text.trim().length < 3) {
        throw Exception(
            'Select a vehicle and category, and enter a location (at least 3 characters).');
      }
      pendingDraft = {
        'requestKey': const Uuid().v4(),
        'vehicleId': vehicle!['id'],
        'categoryId': categoryId,
        if (responsibleDriverId != null)
          'responsibleDriverId': responsibleDriverId,
        'location': location.text.trim(),
        'notes': notes.text.trim(),
        'observedAt': DateTime.now().toUtc().toIso8601String(),
        ...?coordinates,
      };
    }
    dynamic result;
    try {
      result = await api('/offences', pendingDraft);
    } on ApiFailure catch (error) {
      if (error.status == 400) {
        pendingDraft = null;
      }
      rethrow;
    }
    draftId = result['id'];
    draftRevision = result['revision'] ?? 0;
    message =
        'Draft saved. Review the details below before issuing a traffic ticket.';
    await refresh();
  }

  Future<void> submit() async {
    setState(() {
      busy = false;
    });
    final category = categories
        .cast<Map<String, dynamic>>()
        .where((c) => c['id'] == categoryId)
        .firstOrNull;
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Issue this infringement?'),
                content: Text(
                    '${vehicle?['registrationNumber'] ?? ''}\n${category?['name'] ?? ''}\nFine: ${formatCurrency(category?['demoFineAmount'])}\nDemerit points: ${category?['demeritPoints'] ?? 0}'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Issue Infringement'))
                ]));
    if (confirmed != true || !mounted) return;
    setState(() {
      busy = true;
    });
    final result = await api('/offences/$draftId/submit', {});
    ticket = Map<String, dynamic>.from(result);
    motoristCode = null;
    pendingDraft = null;
    draftId = null;
    message = 'Traffic ticket issued.';
    await refresh();
  }

  Future<void> updateDraft() async {
    final result = await api(
        '/offences/$draftId',
        {
          'revision': draftRevision,
          'categoryId': categoryId,
          'location': location.text.trim(),
          'notes': notes.text.trim()
        },
        'PATCH');
    draftRevision = result['revision'];
    pendingDraft = Map<String, dynamic>.from(result);
    editingDraft = false;
    message = 'Draft changes saved.';
    await refresh();
  }

  Future<void> useLocation({bool incident = false}) async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw Exception(
          'Location services are off. Enter a manual location instead.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw Exception(
          'Location permission denied. Manual entry remains available.');
    }
    final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.medium,
            timeLimit: Duration(seconds: 15)));
    final value = {
      'latitude': position.latitude,
      'longitude': position.longitude
    };
    if (incident) {
      incidentCoordinates = value;
    } else {
      coordinates = value;
    }
    message = 'One location recorded for this report. No background tracking.';
  }

  Future<void> attachEvidence(ImageSource source) async {
    final selected = await ImagePicker().pickImage(
        source: source, imageQuality: 85, maxWidth: 2400, maxHeight: 2400);
    if (selected == null) {
      message = 'Image selection cancelled. You can continue without evidence.';
      return;
    }
    if (await selected.length() > 5 * 1024 * 1024) {
      throw Exception('Choose a JPEG or PNG image under 5 MB.');
    }
    final bytes = await selected.readAsBytes();
    final request = http.MultipartRequest(
        'POST', Uri.parse('$baseUrl/offences/$draftId/evidence'));
    request.headers['Authorization'] = 'Bearer $token';
    request.files.add(http.MultipartFile.fromBytes('file', bytes,
        filename: 'evidence',
        contentType: MediaType(
            'image', bytes.isNotEmpty && bytes.first == 137 ? 'png' : 'jpeg')));
    try {
      final response =
          await http.Response.fromStream(await client.send(request))
              .timeout(const Duration(seconds: 20));
      if (response.statusCode >= 400) {
        throw Exception('${jsonDecode(response.body)['message']}');
      }
      message =
          'Private evidence attached. Image metadata removed by the server.';
    } on TimeoutException {
      throw Exception(
          'Upload timed out. Retry the same image; duplicate image content is not stored twice.');
    } on SocketException {
      throw Exception('No network connection. Reconnect and retry the image.');
    }
  }

  Future<void> reportIncident() async {
    if (pendingIncident == null) {
      if (incidentLocation.text.trim().length < 3 ||
          incidentDescription.text.trim().length < 3) {
        throw Exception(
            'Enter an incident location and description (at least 3 characters).');
      }
      pendingIncident = {
        'requestKey': const Uuid().v4(),
        'type': incidentType,
        'location': incidentLocation.text.trim(),
        'description': incidentDescription.text.trim(),
        ...?incidentCoordinates
      };
    }
    try {
      await api('/incidents', pendingIncident);
    } on ApiFailure catch (error) {
      if (error.status == 400) {
        pendingIncident = null;
      }
      rethrow;
    }
    pendingIncident = null;
    incidentLocation.clear();
    incidentDescription.clear();
    incidentCoordinates = null;
    message = 'Incident report submitted.';
    await refresh();
  }

  Widget field(String label, TextEditingController controller,
          {bool secret = false, bool enabled = true, int? maxLength}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: TextField(
            controller: controller,
            obscureText: secret,
            enabled: enabled && !busy,
            maxLength: maxLength,
            decoration: InputDecoration(
                labelText: label, border: const OutlineInputBorder())),
      );
  Widget action(String label, Future<void> Function() callback,
          {bool enabled = true}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: FilledButton(
            onPressed: busy || !enabled ? null : () => run(callback),
            child: Text(label)),
      );

  Future<void> officerLogout() async {
    await api('/auth/logout', {});
    token = null;
    identity = null;
    pendingDraft = null;
    draftId = null;
    vehicle = null;
    ticket = null;
    activity = [];
    pendingIncident = null;
    incidents = [];
    incidentLocation.clear();
    incidentDescription.clear();
    editingDraft = false;
    coordinates = null;
    incidentCoordinates = null;
    location.clear();
    notes.clear();
    plate.clear();
  }

  Future<void> openOfficerRecord(dynamic record) async {
    final result = await api('/offences/${record['id']}');
    if (result['status'] == 'CANCELLED' && result['ticket'] == null) {
      message = 'This draft was discarded. Its audit history is retained.';
      return;
    }
    vehicle = Map<String, dynamic>.from(result['vehicle']);
    motoristCode = null;
    if (result['ticket'] != null) {
      ticket = Map<String, dynamic>.from(result['ticket']);
    } else {
      ticket = null;
      draftId = result['id'];
      pendingDraft = Map<String, dynamic>.from(result);
      draftRevision = result['revision'] ?? 0;
      categoryId = result['categoryId'];
      location.text = result['location'];
      notes.text = result['notes'];
      editingDraft = false;
    }
  }

  List<Widget> citationWidgets() => [
        const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text('OFFICER CITATION TERMINAL',
                style: TextStyle(
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1,
                    color: Color(0xff14566a)))),
        const Text('Find vehicle → Record infringement → Review & issue'),
        field('Vehicle registration', plate, enabled: pendingDraft == null),
        action('Find vehicle', lookup, enabled: pendingDraft == null),
        if (vehicle != null) ...[
          Text(
              '${vehicle!['registrationNumber']} · ${vehicle!['make']} ${vehicle!['model']}'),
          Text(
              '${vehicle!['colour']} · ${readable(vehicle!['registrationStatus'])}'),
          if (vehicle!['driver'] != null)
            Text(
                '${vehicle!['driver']['fullName']} · ${readable(vehicle!['driver']['licenceStatus'])}'),
          if (ticket == null) ...[
            if (pendingDraft == null)
              DriverIdentification(
                  key: ValueKey(vehicle!['id']),
                  api: api,
                  onChanged: (id) => responsibleDriverId = id),
            const Text('Issue Traffic Infringement',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
            Text(vehicle!['motoristId'] != null
                ? 'Linked motorist: ${vehicle!['motorist']?['name'] ?? 'Account verified'}'
                : 'Ticket verification required to link an account.'),
            DropdownButtonFormField<String>(
                isExpanded: true,
                key: ValueKey(categoryId),
                initialValue: categoryId,
                decoration:
                    const InputDecoration(labelText: 'Offence category'),
                items: categories
                    .map((dynamic category) => DropdownMenuItem<String>(
                        value: category['id'],
                        child: Text(category['name'],
                            overflow: TextOverflow.ellipsis)))
                    .toList(),
                onChanged: busy || (pendingDraft != null && !editingDraft)
                    ? null
                    : (value) => setState(() {
                          categoryId = value;
                        })),
            field('Manual location', location,
                enabled: pendingDraft == null || editingDraft, maxLength: 200),
            for (final category
                in categories.where((c) => c['id'] == categoryId))
              Card(
                  color: const Color(0xffedf4f5),
                  child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Calculated fine'),
                            Text(formatCurrency(category['demoFineAmount']),
                                style: const TextStyle(
                                    fontSize: 26,
                                    fontWeight: FontWeight.w700,
                                    color: Color(0xff142d40))),
                            const SizedBox(height: 8),
                            Text(
                                '${category['demeritPoints'] ?? 0} demerit points',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xff75510d))),
                            Text(
                                'Due within ${category['paymentDueDays'] ?? 30} days'),
                            const SizedBox(height: 8),
                            const Text(
                                'Fine and points follow the selected category.')
                          ]))),
            field('Observation notes (optional)', notes,
                enabled: pendingDraft == null || editingDraft, maxLength: 2000),
            if (pendingDraft == null)
              action('Use location once for offence (optional)',
                  () => useLocation()),
            if (coordinates != null)
              Text(
                  'Recorded coordinates: ${coordinates!['latitude']}, ${coordinates!['longitude']}'),
            if (draftId == null)
              action(
                  pendingDraft == null
                      ? 'Review Infringement'
                      : 'Retry saving same draft',
                  saveDraft),
          ],
        ],
        if (draftId != null && editingDraft) ...[
          action('Save draft changes', updateDraft),
          action('Reload saved draft', () async {
            final result = await api('/offences/$draftId');
            pendingDraft = Map<String, dynamic>.from(result);
            draftRevision = result['revision'];
            location.text = result['location'];
            notes.text = result['notes'];
            categoryId = result['categoryId'];
            editingDraft = false;
          }),
        ],
        if (draftId != null && !editingDraft) ...[
          const Text('Preview — check before submission',
              style: TextStyle(fontWeight: FontWeight.bold)),
          Text('${pendingDraft?['location']}\n${pendingDraft?['notes']}'),
          action('Edit saved draft', () async {
            editingDraft = true;
            location.text = pendingDraft!['location'];
            notes.text = pendingDraft!['notes'];
          }),
          action('Discard draft (retain audit)', () async {
            await api('/offences/$draftId/discard', {});
            pendingDraft = null;
            draftId = null;
            vehicle = null;
            coordinates = null;
            location.clear();
            notes.clear();
            message = 'Draft discarded; audit retained.';
            await refresh();
          }),
          action('Attach evidence from gallery (optional)',
              () => attachEvidence(ImageSource.gallery)),
          action('Capture evidence photo (optional)',
              () => attachEvidence(ImageSource.camera)),
          action('Issue & Send', submit),
        ],
        if (ticket != null) ...[
          const Text('Traffic ticket',
              style: TextStyle(fontWeight: FontWeight.bold)),
          SelectableText('Reference: ${ticketLabel(ticket!)}'),
          IssuedTicketQr(
              key: ValueKey(ticket!['id']), api: api, ticketId: ticket!['id']),
          action('Generate motorist verification code', () async {
            final result =
                await api('/tickets/${ticket!['id']}/access-code', {});
            motoristCode = result['verificationCode'];
            message =
                'Share the code separately from the reference. Previous public access is invalidated.';
          }),
          if (motoristCode != null)
            SelectableText('Motorist verification code: $motoristCode'),
          Text('Amount: ${formatCurrency(ticket!['demoFineAmountSnapshot'])}'),
          StatusBadge(ticket!['status']),
          action('Start another observation', () async {
            ticket = null;
            vehicle = null;
            coordinates = null;
            location.clear();
            notes.clear();
          }),
        ],
      ];
  List<Widget> incidentWidgets() => [
        const Divider(),
        const Text('Report a Road Incident'),
        DropdownButtonFormField<String>(
            initialValue: incidentType,
            decoration: const InputDecoration(labelText: 'Incident type'),
            items: ['ACCIDENT', 'HAZARD', 'CONGESTION', 'OTHER']
                .map((type) =>
                    DropdownMenuItem(value: type, child: Text(readable(type))))
                .toList(),
            onChanged: busy || pendingIncident != null
                ? null
                : (value) => setState(() {
                      incidentType = value!;
                    })),
        field('Incident location', incidentLocation,
            enabled: pendingIncident == null, maxLength: 200),
        field('Incident description', incidentDescription,
            enabled: pendingIncident == null, maxLength: 2000),
        if (pendingIncident == null)
          action('Use location once for incident (optional)',
              () => useLocation(incident: true)),
        if (incidentCoordinates != null)
          Text(
              'Incident coordinates: ${incidentCoordinates!['latitude']}, ${incidentCoordinates!['longitude']}'),
        action(
            pendingIncident == null
                ? 'Submit Incident Report'
                : 'Retry same incident report',
            reportIncident),
        const Text('Your recent incidents (latest 20)'),
        if (incidents.isEmpty) const Text('No incidents found.'),
        for (final dynamic incident in incidents)
          ListTile(
              title: Text(readable(incident['type'])),
              trailing: StatusBadge(incident['status'], incident: true),
              subtitle:
                  Text('${incident['location']}\n${incident['description']}')),
      ];
  List<Widget> activityWidgets() => [
        const Divider(),
        const Text('Your recent activity (latest 20)'),
        action('Refresh activity', refresh),
        if (activity.isEmpty) const Text('No traffic offences found.'),
        for (final dynamic record in activity)
          ListTile(
            title: Text('${record['vehicle']['registrationNumber']}'),
            subtitle: Text(record['location']),
            trailing: StatusBadge(record['status']),
            onTap: busy || pendingDraft != null
                ? null
                : () => run(() async {
                      await openOfficerRecord(record);
                    }),
          ),
      ];
  @override
  Widget build(BuildContext context) => token != null &&
          accountRole != 'OFFICER'
      ? RoleWorkspace(
          role: accountRole,
          identity: identity ?? '',
          accountId: accountId,
          api: api,
          onLogout: () async {
            await api('/auth/logout', {});
            if (mounted) {
              setState(() {
                token = null;
                identity = null;
                message = '';
              });
            }
          })
      : token != null
          ? OfficerShell(
              api: api,
              identity: identity ?? '',
              onLogout: () => run(officerLogout),
              onOpen: (record) => run(() => openOfficerRecord(record)),
              canOpen: pendingDraft == null,
              busy: busy,
              message: message,
              citation: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: citationWidgets()),
              incidentForm: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: incidentWidgets()),
              activityTools: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: activityWidgets()))
          : Scaffold(
              appBar: AppBar(
                  toolbarHeight: 104,
                  title: const ProductBrand(onNavy: false, compact: true)),
              body: SafeArea(
                  child: ListView(padding: const EdgeInsets.all(20), children: [
                if (busy) const LinearProgressIndicator(),
                if (message.isNotEmpty)
                  Semantics(
                      liveRegion: true,
                      child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Text(message))),
                if (token == null) ...[
                  DropdownButtonFormField<String>(
                    initialValue: accountType,
                    decoration:
                        const InputDecoration(labelText: 'Account type'),
                    items: const [
                      DropdownMenuItem(value: 'USER', child: Text('User')),
                      DropdownMenuItem(
                          value: 'OFFICER', child: Text('Officer')),
                      DropdownMenuItem(
                          value: 'SUPERVISOR', child: Text('Supervisor'))
                    ],
                    onChanged: busy
                        ? null
                        : (value) => setState(() {
                              accountType = value!;
                              password.clear();
                              message = '';
                            }),
                  ),
                  const SizedBox(height: 16),
                  field('Email', email),
                  field('Password', password, secret: true),
                  action('Sign in', login),
                ],
              ])),
              bottomNavigationBar: const SafeArea(
                  child: Padding(
                padding: EdgeInsets.all(8),
                child: Text(prototypeNotice,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 11, color: Color(0xff536474))),
              )),
            );
}
