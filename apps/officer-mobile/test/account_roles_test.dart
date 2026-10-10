import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:officer_mobile/main.dart';

Future<void> tap(WidgetTester tester, String text) async {
  final target = find.text(text).last;
  await tester.ensureVisible(target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Future<void> fill(WidgetTester tester, String label, String value) async {
  final target = find.widgetWithText(TextField, label);
  await tester.ensureVisible(target);
  await tester.enterText(target, value);
}

Future<void> login(WidgetTester tester, String role) async {
  await tester.tap(find.byType(DropdownButtonFormField<String>));
  await tester.pumpAndSettle();
  await tap(tester, role);
  await fill(tester, 'Email', '${role.toLowerCase()}@example.invalid');
  await fill(tester, 'Password', 'test-password-only');
  await tap(tester, 'Sign in');
}

void main() {
  testWidgets(
      'motorist signs in, verifies ticket separately, retries a report and signs out',
      (tester) async {
    tester.view.physicalSize = const Size(1000, 6000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final reports = <Map<String, dynamic>>[];
    var verification = 0;
    final ticket = {
      'reference': 'traffic-ticket-reference',
      'category': 'Traffic offence',
      'demoAmount': '25',
      'status': 'ISSUED',
      'paymentStatus': 'NOT_SIMULATED'
    };
    final client = MockClient((request) async {
      final path = request.url.path;
      dynamic result;
      if (path.endsWith('/auth/login')) {
        expect(jsonDecode(request.body)['category'], 'USER');
        result = {
          'token': 'account-token',
          'user': {'id': 'user', 'name': 'Sample Motorist', 'role': 'USER'}
        };
      } else if (path.endsWith('/motorist/dashboard')) {
        result = {
          'totalPayable': 0,
          'pendingFines': 0,
          'demeritPoints': 0,
          'paidFines': 0,
          'registeredVehicles': 0
        };
      } else if (path.endsWith('/motorist/infringements')) {
        result = {'items': [], 'total': 0};
      } else if (path.endsWith('/public/notices')) {
        result = {'notice': 'Road information', 'alerts': []};
      } else if (path.endsWith('/tickets/verify')) {
        expect(request.headers['Authorization'], 'Bearer account-token');
        if (verification++ == 0) {
          return http.Response(
              jsonEncode({'message': 'Ticket verification failed'}), 401);
        }
        result = {'token': 'ticket-token', 'ticket': ticket};
      } else if (path.endsWith('/tickets/payment-simulation')) {
        expect(request.headers['Authorization'], 'Bearer ticket-token');
        result = {
          ...ticket,
          'paymentStatus': 'SIMULATED_PAID',
          'receiptReference': 'PAY-test'
        };
      } else if (path.endsWith('/public/incidents')) {
        expect(request.headers['Authorization'], 'Bearer account-token');
        reports.add(Map<String, dynamic>.from(jsonDecode(request.body)));
        if (reports.length == 1) throw http.ClientException('Connection lost');
        result = {'message': 'Incident report received'};
      } else if (path.endsWith('/auth/logout')) {
        expect(request.headers['Authorization'], 'Bearer account-token');
        return http.Response('', 204);
      } else {
        throw StateError('Motorist must not call staff endpoint: $path');
      }
      return http.Response(jsonEncode(result), 200);
    });
    await tester.pumpWidget(OfficerApp(client: client));
    await login(tester, 'User');
    expect(find.text('Sample Motorist'), findsOneWidget);
    expect(find.text('Vehicle registration'), findsNothing);
    await tap(tester, 'Profile');
    await tap(tester, 'Traffic Notices & Reports');
    await fill(tester, 'Ticket reference', 'traffic-ticket-reference');
    await fill(tester, 'Verification code', 'abcdef0123456789');
    await tap(tester, 'Verify Ticket');
    expect(find.text('Ticket verification failed'), findsOneWidget);
    expect(find.text('Sample Motorist'), findsOneWidget);
    await tap(tester, 'Verify Ticket');
    await tap(tester, 'Simulate payment');
    expect(find.text('Receipt: PAY-test'), findsOneWidget);
    await fill(tester, 'Incident location', 'Central intersection');
    await fill(tester, 'Incident description', 'Road obstruction reported');
    await tap(tester, 'Submit Incident Report');
    await tap(tester, 'Retry same report');
    expect(reports.length, 2);
    expect(reports[0], reports[1]);
    await tap(tester, 'Sign out');
    expect(find.text('Account type'), findsOneWidget);
    expect(find.text('Receipt: PAY-test'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    client.close();
  });

  testWidgets(
      'supervisor uses assigned records and supported review transitions',
      (tester) async {
    tester.view.physicalSize = const Size(1000, 6000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var status = 'SUBMITTED';
    final client = MockClient((request) async {
      final path = request.url.path;
      final record = {
        'id': 'offence',
        'location': 'Central intersection',
        'notes': 'Observation',
        'status': status,
        'vehicle': {'registrationNumber': 'ABC1234'},
        'category': {'name': 'Traffic offence'}
      };
      dynamic result;
      if (path.endsWith('/auth/login')) {
        expect(jsonDecode(request.body)['category'], 'SUPERVISOR');
        result = {
          'token': 'supervisor-token',
          'user': {
            'id': 'supervisor',
            'name': 'Sample Supervisor',
            'role': 'SUPERVISOR'
          }
        };
      } else if (path.endsWith('/analytics/overview')) {
        result = {
          'openIncidents': 1,
          'submittedOffences': 1,
          'activeCheckpoints': 0,
          'officers': []
        };
      } else if (path.endsWith('/supervisor/summary')) {
        result = {
          'paymentsToday': 0,
          'currency': 'USD',
          'pendingVehicleApprovals': 0
        };
      } else if (path.endsWith('/supervisor/payments') ||
          path.endsWith('/vehicle-link-requests') ||
          path.endsWith('/incidents') ||
          path.endsWith('/checkpoints')) {
        result = {'items': [], 'total': 0};
      } else if (path.endsWith('/offences')) {
        result = {
          'items': [record],
          'total': 1
        };
      } else if (path.endsWith('/offences/offence')) {
        result = record;
      } else if (path.endsWith('/offences/offence/review')) {
        expect(request.headers['Authorization'], 'Bearer supervisor-token');
        expect(jsonDecode(request.body)['status'], 'UNDER_REVIEW');
        status = 'UNDER_REVIEW';
        result = {...record, 'status': status};
      } else {
        throw StateError('Unexpected endpoint: $path');
      }
      return http.Response(jsonEncode(result), 200);
    });
    await tester.pumpWidget(OfficerApp(client: client));
    await login(tester, 'Supervisor');
    expect(find.text('Sample Supervisor'), findsOneWidget);
    expect(find.text('Vehicle registration'), findsNothing);
    await tap(tester, 'Reviews');
    await tap(tester, 'ABC1234 · Traffic offence');
    await fill(tester, 'Review notes', 'Review started');
    await tap(tester, 'Start review');
    expect(status, 'UNDER_REVIEW');
    expect(find.text('Review saved.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    client.close();
  });
}
