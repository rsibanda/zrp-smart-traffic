import 'package:flutter_test/flutter_test.dart';
import 'package:officer_mobile/main.dart';

void main() {
  testWidgets('shows demo boundary and sign-in fields', (tester) async {
    await tester.pumpWidget(const OfficerApp());
    expect(find.text('Academic Prototype'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
  });
}
