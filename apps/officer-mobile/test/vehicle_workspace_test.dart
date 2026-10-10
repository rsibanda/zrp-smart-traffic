import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:officer_mobile/vehicle_workspace.dart';

void main() {
  for (final width in [375.0, 390.0, 430.0]) {
    testWidgets('vehicle request, approval refresh and details at $width px',
        (tester) async {
      tester.view.physicalSize = Size(width, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      bool requested = false, approved = false, saved = false;
      final vehicle = {
        'registrationNumber': 'ABC1234',
        'make': 'Toyota',
        'model': 'Corolla',
        'colour': 'Silver',
        'registrationStatus': 'REGISTERED',
        'ownershipStatus': 'VERIFIED',
        'nickname': null,
        'linkVerifiedAt': null,
        'linkedInfringements': 0,
        'activeInfringements': 0,
        'paidInfringements': 0,
        'totalPayable': 0,
        'paidAmount': 0,
        'currency': 'USD',
        'statusSource': 'Internal records only',
        'infringements': {'items': [], 'total': 0},
        'history': []
      };
      Future<dynamic> api(String path,
          [Map<String, dynamic>? body,
          String method = 'POST',
          String? token]) async {
        if (path.startsWith('/motorist/vehicles?')) {
          return {
            'items': approved ? [vehicle] : [],
            'total': approved ? 1 : 0,
            'summary': {
              'registeredVehicles': approved ? 1 : 0,
              'activeInfringements': 0,
              'totalPayable': 0,
              'vehiclesRequiringAttention': 0,
              'currency': 'USD'
            }
          };
        }
        if (path.startsWith('/motorist/vehicles/requests?')) {
          return {
            'items': requested
                ? [
                    {
                      'registration': 'ABC1234',
                      'kind': 'LINK',
                      'status': approved ? 'VERIFIED' : 'PENDING',
                      'submittedAt': '2026-10-05T08:00:00Z'
                    }
                  ]
                : [],
            'total': requested ? 1 : 0
          };
        }
        if (path == '/motorist/vehicles/check') {
          return {
            'registration': 'ABC1234',
            'ownershipStatus': 'PENDING',
            'message': 'Ownership verification required.'
          };
        }
        if (path == '/motorist/vehicles/link-request') {
          expect(body, {'registration': 'ABC1234'});
          requested = true;
          return {'status': 'PENDING'};
        }
        if (method == 'PATCH') {
          expect(body, {'nickname': 'Family car'});
          saved = true;
          return vehicle;
        }
        if (path.startsWith('/motorist/vehicles/ABC1234')) {
          return vehicle;
        }
        throw StateError(path);
      }

      await tester.pumpWidget(MaterialApp(
          home: Scaffold(
              body: SingleChildScrollView(
                  child: VehicleWorkspace(api: api, onTicket: (_) async {})))));
      await tester.pumpAndSettle();
      expect(find.textContaining('No vehicles are linked'), findsOneWidget);
      Future<void> tap(String label) async {
        await tester.ensureVisible(find.text(label));
        await tester.tap(find.text(label));
        await tester.pumpAndSettle();
      }

      await tap('+ Register Vehicle');
      await tester.enterText(
          find.widgetWithText(TextField, 'Vehicle Registration Number'),
          'ABC1234');
      await tap('Check Vehicle');
      await tap('Submit Link Request');
      expect(find.text('Pending'), findsOneWidget);
      approved = true;
      await tester.pump(const Duration(seconds: 11));
      await tester.pumpAndSettle();
      await tap('Check Status');
      expect(find.text('Account link: Verified'), findsOneWidget);
      await tap('Close');
      await tap('View Details');
      await tester
          .ensureVisible(find.widgetWithText(TextField, 'Nickname (optional)'));
      await tester.enterText(
          find.widgetWithText(TextField, 'Nickname (optional)'), 'Family car');
      await tap('Save nickname');
      expect(saved, isTrue);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
