import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:officer_mobile/supervisor_shell.dart';
import 'package:officer_mobile/vehicle_approvals.dart';

void main() {
  for (final width in [375.0, 390.0, 430.0]) {
    testWidgets('command centre summary, cards and navigation at $width',
        (tester) async {
      tester.view.physicalSize = Size(width, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final opened = <String>[];
      final navigated = <String>[];
      Future<dynamic> api(String path,
          [Map<String, dynamic>? body,
          String method = 'POST',
          String? token]) async {
        if (path == '/analytics/overview') {
          return {
            'submittedOffences': 8,
            'openIncidents': 3,
            'activeCheckpoints': 2,
            'officers': [
              {'name': 'Officer Moyo', 'active': true}
            ]
          };
        }
        if (path == '/supervisor/summary') {
          return {
            'paymentsToday': 1240,
            'currency': 'USD',
            'pendingVehicleApprovals': 3
          };
        }
        if (path.startsWith('/offences?')) {
          return {
            'total': 1,
            'items': [
              {
                'id': 'internal-offence',
                'status': 'SUBMITTED',
                'createdAt': '2026-10-09T08:00:00Z',
                'location': 'Harare Central',
                'category': {'name': 'Speeding'},
                'officer': {'name': 'Officer Moyo'},
                'vehicle': {'registrationNumber': 'ABC1234'},
                'ticket': {
                  'displayReference': 'INF-2026-000125',
                  'demoFineAmountSnapshot': '80',
                  'demeritPointsSnapshot': 3,
                  'motorist': {'name': 'Tawanda Ncube'}
                },
                'paymentStatus': 'PENDING'
              }
            ]
          };
        }
        if (path.startsWith('/supervisor/payments')) {
          return {
            'total': 1,
            'items': [
              {
                'paymentReference': 'internal-payment',
                'amount': '80',
                'currency': 'USD',
                'method': 'ECOCASH',
                'status': 'SUCCESS',
                'createdAt': '2026-10-09T08:00:00Z',
                'ticket': {'displayReference': 'INF-2026-000125'},
                'motorist': {'name': 'Tawanda Ncube'}
              }
            ]
          };
        }
        return {'items': [], 'total': 0};
      }

      final capture = Platform.environment['CAPTURE_SUPERVISOR_UI'] == 'true';
      if (capture) {
        await tester.runAsync(() async {
          final font =
              File('${Platform.environment['WINDIR']}/Fonts/segoeui.ttf');
          await (FontLoader('ReviewFont')
                ..addFont(Future.value(
                    ByteData.sublistView(await font.readAsBytes()))))
              .load();
          final icons = File(
              '../../.tools/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
          await (FontLoader('MaterialIcons')
                ..addFont(Future.value(
                    ByteData.sublistView(await icons.readAsBytes()))))
              .load();
        });
      }
      final boundary = GlobalKey();
      await tester.pumpWidget(RepaintBoundary(
          key: boundary,
          child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: ThemeData(
                  fontFamily: capture ? 'ReviewFont' : null,
                  colorSchemeSeed: const Color(0xff14566a),
                  cardTheme: CardThemeData(
                      color: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: const BorderSide(color: Color(0xffd9e2e9))))),
              home: SupervisorShell(
                  api: api,
                  identity: 'Inspector Chipo Dube',
                  onLogout: () async {},
                  onNavigate: (value) async {
                    navigated.add(value);
                  },
                  onOpen: (row) async {
                    opened.add(row['id']);
                  },
                  tools: const Text('Existing review tools'),
                  busy: false,
                  message: ''))));
      await tester.pumpAndSettle();
      expect(find.text(r'US$1,240.00'), findsOneWidget);
      expect(find.text('internal-offence'), findsNothing);
      expect(tester.takeException(), isNull);
      if (capture && width == 390) {
        await tester.runAsync(() async {
          final image = await (boundary.currentContext!.findRenderObject()
                  as RenderRepaintBoundary)
              .toImage();
          final data = await image.toByteData(format: ui.ImageByteFormat.png);
          await File('../../.tools/supervisor-reference-390.png')
              .writeAsBytes(data!.buffer.asUint8List());
          image.dispose();
        });
      }
      await tester.ensureVisible(find.text('Review').first);
      await tester.pumpAndSettle();
      if (capture && width == 390) {
        await tester.runAsync(() async {
          final image = await (boundary.currentContext!.findRenderObject()
                  as RenderRepaintBoundary)
              .toImage();
          final data = await image.toByteData(format: ui.ImageByteFormat.png);
          await File('../../.tools/supervisor-reviews-390.png')
              .writeAsBytes(data!.buffer.asUint8List());
          image.dispose();
        });
      }
      await tester.tap(find.text('Review').first);
      await tester.pumpAndSettle();
      expect(opened, ['internal-offence']);
      expect(find.text('Existing review tools'), findsOneWidget);
      await tester.tap(find.text('Incidents').last);
      await tester.pumpAndSettle();
      expect(navigated.last, 'Incidents');
      await tester.tap(find.text('Checkpoints').last);
      await tester.pumpAndSettle();
      expect(navigated.last, 'Checkpoints');
      await tester.tap(find.text('More').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Payments').first);
      await tester.tap(find.text('Payments').first);
      await tester.pumpAndSettle();
      expect(find.text(r'US$80.00 · EcoCash'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
  testWidgets(
      'vehicle approval verifies details and requires a second confirmation',
      (tester) async {
    tester.view.physicalSize = const Size(1000, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final decisions = <Map<String, dynamic>>[];
    final request = {
      'id': 'request',
      'registration': 'ABC1234',
      'kind': 'LINK',
      'status': 'PENDING',
      'submittedAt': '2026-10-09T08:00:00Z',
      'motorist': {'name': 'Tawanda Ncube', 'email': 'motorist@example.invalid'}
    };
    Future<dynamic> api(String path,
        [Map<String, dynamic>? body,
        String method = 'POST',
        String? token]) async {
      if (body != null) {
        decisions.add(body);
        return {'status': 'VERIFIED'};
      }
      if (path.endsWith('/request')) {
        return {
          ...request,
          'vehicle': {
            'make': 'Toyota',
            'model': 'Corolla',
            'colour': 'Silver',
            'registrationStatus': 'REGISTERED'
          },
          'linkedToAnotherMotorist': false,
          'ownershipStatus': 'PENDING',
          'history': [request]
        };
      }
      return {
        'items': [
          {...request, 'status': decisions.isEmpty ? 'PENDING' : 'VERIFIED'}
        ],
        'total': 1
      };
    }

    await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: VehicleApprovals(api: api))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('View Request'));
    await tester.pumpAndSettle();
    expect(find.text('Toyota Corolla · Silver'), findsOneWidget);
    await tester.enterText(
        find.byType(TextFormField), 'Ownership evidence checked');
    await tester.tap(find.byType(CheckboxListTile));
    await tester.tap(find.text('Approve Vehicle'));
    await tester.pumpAndSettle();
    expect(decisions, isEmpty);
    expect(find.text('This will link the vehicle to the motorist account.'),
        findsOneWidget);
    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle();
    expect(decisions.single, {
      'status': 'VERIFIED',
      'note': 'Ownership evidence checked',
      'checked': true
    });
    expect(find.text('Approved'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
