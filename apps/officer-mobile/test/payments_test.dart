import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:officer_mobile/motorist_ledger.dart';

void main() {
  for (final method in ['EcoCash', 'InnBucks', 'Bank Card']) {
    testWidgets(
        '$method payment retains idempotency on retry and supports approval',
        (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final requests = <Map<String, dynamic>>[];
      Future<dynamic> api(String path,
          [Map<String, dynamic>? body,
          String verb = 'POST',
          String? accessToken]) async {
        if (path == '/motorist/payments') {
          requests.add(Map<String, dynamic>.from(body!));
          if (requests.length == 1) throw Exception('Connection lost');
          return {
            'reference': 'PAY-test',
            'amount': '80',
            'method': body['method'],
            'status': 'PROCESSING'
          };
        }
        if (path.endsWith('/outcome')) {
          expect(body, {'outcome': 'APPROVE'});
          return {
            'reference': 'PAY-test',
            'amount': '80',
            'method': requests.last['method'],
            'status': 'SUCCESS'
          };
        }
        throw StateError('Unexpected endpoint: $path');
      }

      await tester.pumpWidget(MaterialApp(
          home: PaymentScreen(api: api, ticket: {
        'category': 'Speeding',
        'registration': 'ABC1234',
        'reference': 'ticket-reference',
        'amount': '80'
      })));
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text(method).last);
      await tester.pumpAndSettle();
      Future<void> tap(String label) async {
        await tester.ensureVisible(find.text(label));
        await tester.tap(find.text(label));
        await tester.pumpAndSettle();
      }

      await tap('Continue');
      await tap('Retry same payment request');
      expect(requests.length, 2);
      expect(requests.first, requests.last);
      expect(
          requests.last['method'],
          {
            'EcoCash': 'ECOCASH',
            'InnBucks': 'INNBUCKS',
            'Bank Card': 'CARD'
          }[method]);
      expect(requests.last.containsKey('cardNumber'), false);
      expect(requests.last.containsKey('cvv'), false);
      expect(requests.last.containsKey('mobile'), false);
      if (method == 'Bank Card') expect(requests.last['last4'], '4242');
      await tap('Simulate Approve');
      expect(find.text('Paid'), findsOneWidget);
      expect(find.text('View Receipt'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
