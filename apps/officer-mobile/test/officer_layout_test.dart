import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:officer_mobile/officer_shell.dart';

void main() {
  for (final width in [375.0, 390.0, 430.0]) {
    testWidgets('officer dashboard and navigation at $width', (tester) async {
      tester.view.physicalSize = Size(width, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final opened = <String>[];
      Future<dynamic> api(String path,
          [Map<String, dynamic>? body,
          String method = 'POST',
          String? token]) async {
        if (path.startsWith('/offences?')) {
          return {
            'total': 3,
            'items': List.generate(
                3,
                (i) => {
                      'id': 'record-$i',
                      'status': ['SUBMITTED', 'UNDER_REVIEW', 'CONFIRMED'][i],
                      'category': {
                        'name': [
                          'Speeding',
                          'Red Light Violation',
                          'Illegal Parking'
                        ][i]
                      },
                      'vehicle': {
                        'registrationNumber': 'ABC1234',
                        'motoristId': 'private-id'
                      },
                      'ticket': {
                        'issuedAt': DateTime.now().toUtc().toIso8601String(),
                        'displayReference': 'INF-2026-00012$i',
                        'demoFineAmountSnapshot': '80'
                      },
                      'location': 'Harare Central'
                    })
          };
        }
        if (path.startsWith('/incidents?')) {
          return {
            'total': 1,
            'items': [
              {
                'id': 'incident',
                'type': 'ACCIDENT',
                'status': 'OPEN',
                'location': 'Seke Road',
                'createdAt': DateTime.now().toIso8601String()
              }
            ]
          };
        }
        if (path.startsWith('/checkpoints?')) {
          return {
            'total': 1,
            'items': [
              {
                'id': 'checkpoint',
                'name': 'Central Checkpoint',
                'status': 'ACTIVE',
                'location': 'Harare'
              }
            ]
          };
        }
        throw StateError(path);
      }

      final capture = Platform.environment['CAPTURE_OFFICER_UI'] == 'true';
      if (capture) {
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
                  fontFamily: capture ? 'ReviewFont' : null,
                  colorSchemeSeed: const Color(0xff14566a),
                  cardTheme: CardThemeData(
                      color: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: const BorderSide(color: Color(0xffd9e2e9))))),
              home: OfficerShell(
                  api: api,
                  identity: 'Officer Sample Moyo',
                  onLogout: () async {},
                  onOpen: (record) async {
                    opened.add(record['id']);
                  },
                  citation: const TextField(
                      decoration:
                          InputDecoration(labelText: 'Vehicle registration')),
                  incidentForm: const Text('Existing incident form'),
                  activityTools: const Text('Existing activity tools'),
                  busy: false,
                  message: '',
                  canOpen: true))));
      await tester.pumpAndSettle();
      expect(find.byType(NavigationDestination), findsNWidgets(5));
      expect(find.text('Welcome back, Officer Sample Moyo'), findsOneWidget);
      expect(find.text('Issued Today'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
      expect(find.text('private-id'), findsNothing);
      expect(tester.takeException(), isNull);
      if (capture && width == 390) {
        tester.view.physicalSize = Size(width, 1700);
        await tester.pumpAndSettle();
        await tester.runAsync(() async {
          final img = await (boundary.currentContext!.findRenderObject()
                  as RenderRepaintBoundary)
              .toImage();
          final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
          await File('../../.tools/officer-reference-390.png')
              .writeAsBytes(bytes!.buffer.asUint8List());
          img.dispose();
        });
        tester.view.physicalSize = Size(width, 844);
        await tester.pumpAndSettle();
      }
      await tester.tap(find.text('Issue'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'ABC1234');
      await tester.tap(find.text('Incidents'));
      await tester.pumpAndSettle();
      expect(find.text('Existing incident form'), findsOneWidget);
      await tester.tap(find.text('Issue'));
      await tester.pumpAndSettle();
      expect(find.text('ABC1234'), findsOneWidget);
      await tester.tap(find.text('Checkpoints'));
      await tester.pumpAndSettle();
      expect(find.text('Central Checkpoint'), findsOneWidget);
      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('My Activity'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('View').first);
      await tester.tap(find.text('View').first);
      await tester.pumpAndSettle();
      expect(opened, ['record-0']);
      expect(find.byType(TextField), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
