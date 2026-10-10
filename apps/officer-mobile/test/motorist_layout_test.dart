import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:officer_mobile/role_workspace.dart';

void main() {
  for (final width in [375.0, 390.0, 430.0]) {
    testWidgets('motorist reference layout and five destinations at $width',
        (tester) async {
      tester.view.physicalSize = Size(width, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      Future<dynamic> api(String path,
          [Map<String, dynamic>? body,
          String method = 'POST',
          String? token]) async {
        if (path == '/public/notices') {
          return {'notice': 'Road information', 'alerts': []};
        }
        if (path == '/motorist/dashboard') {
          return {
            'totalPayable': 180,
            'pendingFines': 1,
            'demeritPoints': 3,
            'paidFines': 1,
            'registeredVehicles': 1
          };
        }
        if (path.startsWith('/motorist/infringements?')) {
          return {
            'items': [
              {
                'reference': 'opaque-secret',
                'displayReference': 'INF-2026-000125',
                'category': 'Speeding',
                'amount': '180',
                'currency': 'USD',
                'registration': 'ABC1234',
                'location': 'Harare Central',
                'issuedAt': '2026-10-05T08:14:00Z',
                'demeritPoints': 3,
                'paymentStatus': 'PENDING',
                'status': 'SUBMITTED'
              }
            ],
            'total': 1
          };
        }
        if (path.startsWith('/motorist/payments?')) {
          return {
            'items': [
              {
                'reference': 'PAY-2026-018822',
                'ticketDisplayReference': 'INF-2026-000125',
                'amount': '25',
                'method': 'ECOCASH',
                'status': 'SUCCESS',
                'createdAt': '2026-10-05T09:00:00Z'
              }
            ],
            'total': 1
          };
        }
        return {'items': [], 'total': 0};
      }

      if (Platform.environment['CAPTURE_MOTORIST_UI'] == 'true') {
        await tester.runAsync(() async {
          final font =
              File('${Platform.environment['WINDIR']}/Fonts/segoeui.ttf');
          final loader = FontLoader('ReviewFont')
            ..addFont(
                Future.value(ByteData.sublistView(await font.readAsBytes())));
          await loader.load();
          final icons = File(
              '../../.tools/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
          final iconLoader = FontLoader('MaterialIcons')
            ..addFont(
                Future.value(ByteData.sublistView(await icons.readAsBytes())));
          await iconLoader.load();
        });
      }
      final boundary = GlobalKey();
      await tester.pumpWidget(RepaintBoundary(
          key: boundary,
          child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: ThemeData(
                  fontFamily:
                      Platform.environment['CAPTURE_MOTORIST_UI'] == 'true'
                          ? 'ReviewFont'
                          : null,
                  colorSchemeSeed: const Color(0xff14566a),
                  cardTheme:
                      const CardThemeData(color: Colors.white, elevation: 0)),
              home: RoleWorkspace(
                  role: 'USER',
                  identity: 'Sample Motorist',
                  accountId: 'account',
                  api: api,
                  onLogout: () async {}))));
      await tester.pumpAndSettle();
      expect(find.byType(NavigationDestination), findsNWidgets(5));
      expect(find.byType(ChoiceChip), findsNothing);
      expect(find.text('Welcome back'), findsOneWidget);
      expect(find.text('3 pts'), findsOneWidget);
      expect(find.text('opaque-secret'), findsNothing);
      expect(tester.takeException(), isNull);
      if (Platform.environment['CAPTURE_MOTORIST_UI'] == 'true' &&
          width == 390) {
        tester.view.physicalSize = Size(width, 1200);
        await tester.pumpAndSettle();
        await tester.runAsync(() async {
          final image = await (boundary.currentContext!.findRenderObject()
                  as RenderRepaintBoundary)
              .toImage();
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          await File('../../.tools/motorist-reference-390.png')
              .writeAsBytes(bytes!.buffer.asUint8List());
          image.dispose();
        });
        tester.view.physicalSize = Size(width, 844);
        await tester.pumpAndSettle();
      }
      await tester.ensureVisible(find.text('Pay Now'));
      await tester.tap(find.text('Pay Now'));
      await tester.pumpAndSettle();
      expect(find.text('Pay Traffic Fine'), findsOneWidget);
      Navigator.of(tester.element(find.text('Pay Traffic Fine'))).pop();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Payments'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('View Receipt'));
      expect(find.text('Ticket: INF-2026-000125'), findsOneWidget);
      expect(find.text('Transaction: PAY-2026-018822'), findsOneWidget);
      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      expect(find.text('Traffic Notices & Reports'), findsOneWidget);
      await tester.tap(find.text('Home'));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
