import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:officer_mobile/driver_points.dart';
import 'package:officer_mobile/vehicle_applications.dart';

void main() {
  for (final width in [375.0, 390.0, 430.0]) {
    testWidgets(
        'vehicle application form fits $width and validates required data',
        (tester) async {
      tester.view.physicalSize = Size(width, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var saves = 0;
      Future<dynamic> api(String path,
          [Map<String, dynamic>? body,
          String method = 'POST',
          String? token]) async {
        if (body != null) saves++;
        if (path == '/vehicle-categories') {
          return [
            {
              'id': 'car',
              'label': 'Private car (hatchback / sedan)',
              'feeMinor': 1000
            }
          ];
        }
        if (path.endsWith('/limits')) {
          return {'maxFileBytes': 10485760, 'maxAttachments': 5};
        }
        return {'items': [], 'total': 0};
      }

      await tester
          .pumpWidget(MaterialApp(home: VehicleApplicationsScreen(api: api)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Start new application'));
      await tester.pumpAndSettle();
      expect(find.textContaining('US\$10.00'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.scrollUntilVisible(find.text('Save draft details'), 400,
          scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      expect(find.text('Save draft details').hitTestable(), findsOneWidget);
      await tester.tap(find.text('Save draft details').hitTestable());
      await tester.pumpAndSettle();
      expect(saves, 0);
      expect(find.text('Enter Registration number.'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
  testWidgets(
      'driver lookup needs confirmation before assigning points responsibility',
      (tester) async {
    String? selected;
    Future<dynamic> api(String path,
            [Map<String, dynamic>? body,
            String method = 'POST',
            String? token]) async =>
        {'id': 'driver', 'fullName': 'Sample Driver', 'licenceStatus': 'VALID'};
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: SingleChildScrollView(
                child: DriverIdentification(
                    api: api, onChanged: (id) => selected = id)))));
    await tester.enterText(find.byType(TextField), 'TEST-123');
    await tester.tap(find.text('Find verified driver'));
    await tester.pumpAndSettle();
    expect(selected, isNull);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    expect(selected, 'driver');
    await tester.enterText(find.byType(TextField), 'OTHER-123');
    await tester.pump();
    expect(selected, isNull);
    expect(ticketPoints({'driverIdentification': 'LEGACY_NOT_ASSESSED'}),
        'Historical points not reassessed');
    expect(
        remainingPoints(
            {'status': 'VERIFIED', 'remaining': 9, 'allowance': 12}),
        '9 / 12');
  });
}
