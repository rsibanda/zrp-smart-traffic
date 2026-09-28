import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:officer_mobile/main.dart';

void main() {
  testWidgets('officer retries the same draft and reports an incident',
      (tester) async {
    tester.view.physicalSize = const Size(1000, 6000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    const locationChannel = MethodChannel('flutter.baseflow.com/geolocator');
    final locationCalls = <String>[];
    tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(locationChannel, (call) async {
      locationCalls.add(call.method);
      if (call.method == 'isLocationServiceEnabled') return true;
      if (call.method == 'checkPermission' ||
          call.method == 'requestPermission') {
        return 0;
      }
      throw StateError(
          'Location must not be collected after permission denial');
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(locationChannel, null));
    final draftRequests = <Map<String, dynamic>>[];
    var incidentCreated = false;
    final client = MockClient((request) async {
      final path = request.url.path;
      dynamic result;
      if (path.endsWith('/auth/login')) {
        result = {
          'token': 'demo-test-session',
          'user': {'role': 'OFFICER', 'name': 'Fictional tester'}
        };
      } else if (path.endsWith('/offence-categories')) {
        result = [
          {'id': 'category', 'name': 'Fictional category'}
        ];
      } else if (path.endsWith('/vehicles')) {
        result = {
          'items': [
            {
              'id': 'vehicle',
              'registrationNumber': 'DEMO001',
              'make': 'Demo',
              'model': 'Car',
              'colour': 'Silver',
              'registrationStatus': 'DEMO_REGISTERED'
            }
          ]
        };
      } else if (path.endsWith('/offences') && request.method == 'POST') {
        draftRequests.add(jsonDecode(request.body));
        if (draftRequests.length == 1) {
          throw http.ClientException('Simulated connection loss');
        }
        result = {'id': 'draft'};
      } else if (path.endsWith('/draft') && request.method == 'PATCH') {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['revision'], 0);
        expect(body['notes'], 'Corrected fictional observation');
        result = {...body, 'id': 'draft', 'revision': 1};
      } else if (path.endsWith('/submit')) {
        result = {
          'id': 'ticket',
          'publicReference': 'DEMO-unique-reference',
          'demoFineAmountSnapshot': '25.00',
          'status': 'ISSUED'
        };
      } else if (path.endsWith('/incidents') && request.method == 'POST') {
        expect(jsonDecode(request.body)['type'], 'ACCIDENT');
        incidentCreated = true;
        result = {'id': 'incident'};
      } else {
        result = {'items': []};
      }
      return http.Response(jsonEncode(result), 200,
          headers: {'content-type': 'application/json'});
    });
    await tester.pumpWidget(OfficerApp(client: client));
    Future<void> tap(String text) async {
      final finder = find.text(text);
      await tester.ensureVisible(finder);
      await tester.tap(finder);
      await tester.pumpAndSettle();
    }

    Future<void> fill(String label, String value) async {
      final finder = find.widgetWithText(TextField, label);
      await tester.ensureVisible(finder);
      await tester.enterText(finder, value);
    }

    await fill('Email', 'officer@demo.invalid');
    await fill('Password', 'fictional-test-password');
    await tap('Sign in');
    await fill('Vehicle registration', 'DEMO001');
    await tap('Find vehicle');
    expect(locationCalls, isEmpty);
    await tap('Use location once for offence (optional)');
    expect(locationCalls,
        ['isLocationServiceEnabled', 'checkPermission', 'requestPermission']);
    expect(
        find.text(
            'Location permission denied. Manual entry remains available.'),
        findsOneWidget);
    await fill('Manual location', 'Fictional training area');
    await fill('Observation notes', 'Fictional observation');
    await tap('Save draft for preview');
    await tap('Retry saving same draft');
    expect(draftRequests.length, 2);
    expect(draftRequests[0], draftRequests[1]);
    await tap('Edit saved draft');
    await fill('Observation notes', 'Corrected fictional observation');
    await tap('Save draft changes');
    await tap('Issue traffic ticket / retry same submission');
    final reference = find.byWidgetPredicate((widget) =>
        widget is SelectableText &&
        widget.data == 'Reference: DEMO-unique-reference');
    expect(reference, findsOneWidget);
    await fill('Incident location', 'Fictional intersection');
    await fill('Incident description', 'Fictional accident report');
    await tap('Submit Incident Report');
    expect(incidentCreated, isTrue);
    await tester.pumpWidget(const SizedBox());
    client.close();
  });
}
