import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http_parser/http_parser.dart';

void main() => runApp(const OfficerApp());

class OfficerApp extends StatelessWidget {
  const OfficerApp({super.key, this.client});
  final http.Client? client;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Smart Traffic Demo',
    theme: ThemeData(colorSchemeSeed: const Color(0xff14566a), useMaterial3: true),
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
  static const baseUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000/api/v1');
  final email = TextEditingController();
  final password = TextEditingController();
  final plate = TextEditingController();
  final location = TextEditingController();
  final notes = TextEditingController();
  final incidentLocation = TextEditingController();
  final incidentDescription = TextEditingController();
  String incidentType = 'ACCIDENT';
  String? motoristCode;
  Map<String, dynamic>? pendingIncident;
  List<dynamic> incidents = [];
  String? token, identity, categoryId, draftId;
  String message = '';
  bool busy = false;
  Map<String, dynamic>? vehicle, ticket, pendingDraft;
  List<dynamic> categories = [], activity = [];

  @override
  void dispose() {
    if (widget.client == null) {client.close();}
    for (final controller in [email, password, plate, location, notes, incidentLocation, incidentDescription]) {controller.dispose();}
    super.dispose();
  }

  Future<dynamic> api(String path, [Map<String, dynamic>? body]) async {
    final headers = {'Content-Type': 'application/json', if (token != null) 'Authorization': 'Bearer $token'};
    late http.Response response;
    try {
      response = await (body == null
        ? client.get(Uri.parse('$baseUrl$path'), headers: headers)
        : client.post(Uri.parse('$baseUrl$path'), headers: headers, body: jsonEncode(body)))
        .timeout(const Duration(seconds: 12));
    } on TimeoutException {
      throw Exception('Request timed out. Submission may have reached the server. Retry the same draft.');
    } on SocketException {
      throw Exception('No network connection. Reconnect and retry the same draft.');
    } on http.ClientException {
      throw Exception('API unavailable. Check the connection and retry the same draft.');
    }
    if (response.statusCode == 401 && token != null) {
      token = null; identity = null; vehicle = null; ticket = null; activity = [];
      pendingDraft = null; draftId = null; password.clear();
      pendingIncident = null; incidents = []; motoristCode = null;
      throw Exception('Session expired. Sign in, then check recent activity before creating a new draft.');
    }
    if (response.statusCode == 403) {throw Exception('Permission denied for this account.');}
    final dynamic result = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode >= 400) {throw Exception(result is Map ? '${result['message']}' : 'Request failed (${response.statusCode})');}
    return result;
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() {busy = true; message = '';});
    try {await action();} catch (error) {if (mounted) setState(() {message = error.toString().replaceFirst('Exception: ', '');});}
    finally {if (mounted) setState(() {busy = false;});}
  }

  Future<void> login() async {
    final result = await api('/auth/login', {'email': email.text.trim(), 'password': password.text});
    token = result['token'];
    if (result['user']['role'] != 'OFFICER') {
      try {await api('/auth/logout', {});} finally {token = null;}
      throw Exception('Use an OFFICER account in this app.');
    }
    identity = result['user']['name']; password.clear();
    await refresh();
  }

  Future<void> refresh() async {
    categories = await api('/offence-categories') as List<dynamic>;
    if (!categories.any((dynamic category) => category['id'] == categoryId)) {
      categoryId = categories.isEmpty ? null : categories.first['id'] as String;
    }
    final recent = await api('/offences?page=1&pageSize=20'); activity = recent['items'];
    final reports = await api('/incidents?page=1&pageSize=20'); incidents = reports['items'];
  }

  Future<void> lookup() async {
    motoristCode = null;
    vehicle = null; ticket = null;
    final result = await api('/vehicles?registration=${Uri.encodeQueryComponent(plate.text.trim())}');
    if ((result['items'] as List).isEmpty) {message = 'No matching demo record';}
    else {vehicle = Map<String, dynamic>.from(result['items'][0]);}
  }

  Future<void> saveDraft() async {
    if (pendingDraft == null) {
      if (vehicle == null || categoryId == null || location.text.trim().length < 3 || notes.text.trim().length < 3) {
        throw Exception('Select a vehicle and category, and enter a location and notes (at least 3 characters).');
      }
      pendingDraft = {
        'requestKey': const Uuid().v4(), 'vehicleId': vehicle!['id'], 'categoryId': categoryId,
        'location': location.text.trim(), 'notes': notes.text.trim(), 'observedAt': DateTime.now().toUtc().toIso8601String(),
      };
    }
    final result = await api('/offences', pendingDraft);
    draftId = result['id']; message = 'Draft saved. Review the details below before issuing a demo ticket.';
    await refresh();
  }

  Future<void> submit() async {
    final result = await api('/offences/$draftId/submit', {});
    ticket = Map<String, dynamic>.from(result);
    motoristCode = null;
    pendingDraft = null; draftId = null;
    message = 'Demo ticket issued.'; await refresh();
  }

  Future<void> attachEvidence(ImageSource source) async {
    final selected = await ImagePicker().pickImage(source: source, imageQuality: 85, maxWidth: 2400, maxHeight: 2400);
    if (selected == null) {message = 'Image selection cancelled. You can continue without evidence.'; return;}
    if (await selected.length() > 5 * 1024 * 1024) {throw Exception('Choose a JPEG or PNG image under 5 MB.');}
    final bytes = await selected.readAsBytes();
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/offences/$draftId/evidence'));
    request.headers['Authorization'] = 'Bearer $token';
    request.files.add(http.MultipartFile.fromBytes('file', bytes, filename: 'demo-evidence', contentType: MediaType('image', bytes.isNotEmpty && bytes.first == 137 ? 'png' : 'jpeg')));
    try {
      final response = await http.Response.fromStream(await client.send(request)).timeout(const Duration(seconds: 20));
      if (response.statusCode >= 400) {throw Exception('${jsonDecode(response.body)['message']}');}
      message = 'Private demo evidence attached. Image metadata removed by the server.';
    } on TimeoutException {throw Exception('Upload timed out. Retry the same image; duplicate image content is not stored twice.');}
    on SocketException {throw Exception('No network connection. Reconnect and retry the image.');}
  }

  Future<void> reportIncident() async {
    if (pendingIncident == null) {
      if (incidentLocation.text.trim().length < 3 || incidentDescription.text.trim().length < 3) {
        throw Exception('Enter an incident location and description (at least 3 characters).');
      }
      pendingIncident = {'requestKey': const Uuid().v4(), 'type': incidentType, 'location': incidentLocation.text.trim(), 'description': incidentDescription.text.trim()};
    }
    await api('/incidents', pendingIncident);
    pendingIncident = null; incidentLocation.clear(); incidentDescription.clear();
    message = 'Demo incident reported.'; await refresh();
  }

  Widget field(String label, TextEditingController controller, {bool secret = false, bool enabled = true, int? maxLength}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: TextField(controller: controller, obscureText: secret, enabled: enabled && !busy,
      maxLength: maxLength, decoration: InputDecoration(labelText: label, border: const OutlineInputBorder())),
  );
  Widget action(String label, Future<void> Function() callback, {bool enabled = true}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: FilledButton(onPressed: busy || !enabled ? null : () => run(callback), child: Text(label)),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Smart Traffic Demo')),
    body: SafeArea(child: ListView(padding: const EdgeInsets.all(20), children: [
      const Text('DEMO / UNIVERSITY PROTOTYPE', style: TextStyle(fontWeight: FontWeight.bold)),
      const Text('Fictional data only. Not an official ZRP system.'),
      if (busy) const LinearProgressIndicator(),
      if (message.isNotEmpty) Semantics(liveRegion: true, child: Padding(padding: const EdgeInsets.all(12), child: Text(message))),
      if (token == null) ...[
        field('Email', email), field('Password', password, secret: true), action('Sign in', login),
      ] else ...[
        Text('$identity · OFFICER'),
        action('Sign out', () async {
          await api('/auth/logout', {});
          token = null; identity = null; pendingDraft = null; draftId = null; vehicle = null; ticket = null; activity = [];
          pendingIncident = null; incidents = []; incidentLocation.clear(); incidentDescription.clear();
          location.clear(); notes.clear(); plate.clear();
        }),
        field('Fictional plate (DEMO001)', plate, enabled: pendingDraft == null),
        action('Find vehicle', lookup, enabled: pendingDraft == null),
        if (vehicle != null) ...[
          Text('${vehicle!['registrationNumber']} · ${vehicle!['make']} ${vehicle!['model']}'),
          Text('${vehicle!['colour']} · ${vehicle!['registrationStatus']}'),
          if (vehicle!['driver'] != null) Text('${vehicle!['driver']['fullName']} · ${vehicle!['driver']['licenceStatus']}'),
          if (ticket == null) ...[
            DropdownButtonFormField<String>(key: ValueKey(categoryId), initialValue: categoryId, decoration: const InputDecoration(labelText: 'Demo offence category'),
              items: categories.map((dynamic category) => DropdownMenuItem<String>(value: category['id'], child: Text(category['name']))).toList(),
              onChanged: busy || pendingDraft != null ? null : (value) => setState(() {categoryId = value;})),
            field('Manual location', location, enabled: pendingDraft == null, maxLength: 200),
            field('Fictional observation notes', notes, enabled: pendingDraft == null, maxLength: 2000),
            if (draftId == null) action(pendingDraft == null ? 'Save draft for preview' : 'Retry saving same draft', saveDraft),
          ],
        ],
        if (draftId != null) ...[
          const Text('Preview — check before submission', style: TextStyle(fontWeight: FontWeight.bold)),
          Text('${pendingDraft?['location']}\n${pendingDraft?['notes']}'),
          action('Attach evidence from gallery (optional)', () => attachEvidence(ImageSource.gallery)),
          action('Capture demo evidence photo (optional)', () => attachEvidence(ImageSource.camera)),
          action('Issue demo ticket / retry same submission', submit),
        ],
        if (ticket != null) ...[
          const Text('DEMO — NOT VALID FOR PAYMENT OR ENFORCEMENT', style: TextStyle(fontWeight: FontWeight.bold)),
          SelectableText('Reference: ${ticket!['publicReference']}'),
          action('Generate motorist verification code', () async {final result = await api('/tickets/${ticket!['id']}/access-code', {}); motoristCode = result['verificationCode']; message = 'Share the code separately from the reference. Previous public access is invalidated.';}),
          if (motoristCode != null) SelectableText('Motorist verification code: $motoristCode'),
          Text('Demo amount: ${ticket!['demoFineAmountSnapshot']} training units · ${ticket!['status']}'),
          action('Start another observation', () async {ticket = null; vehicle = null; location.clear(); notes.clear();}),
        ],
        const Divider(), const Text('Report a demo road incident'),
        DropdownButtonFormField<String>(initialValue: incidentType, decoration: const InputDecoration(labelText: 'Incident type'),
          items: ['ACCIDENT', 'HAZARD', 'CONGESTION', 'OTHER'].map((type) => DropdownMenuItem(value: type, child: Text(type))).toList(),
          onChanged: busy || pendingIncident != null ? null : (value) => setState(() {incidentType = value!;})),
        field('Incident location', incidentLocation, enabled: pendingIncident == null, maxLength: 200),
        field('Incident description', incidentDescription, enabled: pendingIncident == null, maxLength: 2000),
        action(pendingIncident == null ? 'Report incident' : 'Retry same incident report', reportIncident),
        const Text('Your recent incidents (latest 20)'),
        for (final dynamic incident in incidents) ListTile(title: Text('${incident['type']} · ${incident['status']}'), subtitle: Text('${incident['location']}\n${incident['description']}')),
        const Divider(), const Text('Your recent activity (latest 20)'), action('Refresh activity', refresh),
        if (activity.isEmpty) const Text('No recent demo offences.'),
        for (final dynamic record in activity) ListTile(
          title: Text('${record['vehicle']['registrationNumber']} · ${record['status']}'),
          subtitle: Text(record['location']),
          onTap: busy || pendingDraft != null ? null : () => run(() async {
            final result = await api('/offences/${record['id']}');
            vehicle = Map<String, dynamic>.from(result['vehicle']);
            motoristCode = null;
            if (result['ticket'] != null) {ticket = Map<String, dynamic>.from(result['ticket']);}
            else {
              ticket = null; draftId = result['id'];
              pendingDraft = {'location': result['location'], 'notes': result['notes']};
            }
          }),
        ),
      ],
    ])),
  );
}
