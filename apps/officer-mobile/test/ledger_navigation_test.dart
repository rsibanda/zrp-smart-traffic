import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:officer_mobile/role_workspace.dart';

void main() {
  testWidgets('retains the payment tab while scrolling and refreshing notices',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    Future<dynamic> api(String path,
        [Map<String, dynamic>? body,
        String method = 'POST',
        String? token]) async {
      if (path == '/public/notices') {
        return {'notice': 'Traffic information', 'alerts': []};
      }
      if (path == '/motorist/dashboard') {
        return {
          'totalPayable': 0,
          'pendingFines': 0,
          'demeritPoints': 3,
          'paidFines': 1,
          'registeredVehicles': 1
        };
      }
      if (path.startsWith('/motorist/infringements?')) {
        return {'items': [], 'total': 0};
      }
      if (path.startsWith('/motorist/payments?')) {
        return {
          'items': [
            {
              'reference': 'PAY-test',
              'ticketDisplayReference': 'INF-2026-000125',
              'amount': '25',
              'currency': 'USD',
              'method': 'CARD',
              'status': 'SUCCESS',
              'createdAt': '2026-10-02T09:00:00Z'
            }
          ],
          'total': 1
        };
      }
      throw StateError(path);
    }

    await tester.pumpWidget(MaterialApp(
        home: RoleWorkspace(
            role: 'USER',
            identity: 'Sample Motorist',
            accountId: 'account',
            api: api,
            onLogout: () async {})));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Payments'));
    await tester.tap(find.text('Payments'));
    await tester.pumpAndSettle();
    expect(find.text('Submit Incident Report'), findsNothing);
    await tester.ensureVisible(find.text('View Receipt'));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 31));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('View Receipt'));
    await tester.pumpAndSettle();
    expect(find.text(r'US$25.00 · Bank Card'), findsOneWidget);
    expect(find.text('Ticket: INF-2026-000125'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
