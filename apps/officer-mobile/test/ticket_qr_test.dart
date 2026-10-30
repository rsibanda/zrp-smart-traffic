import 'package:flutter_test/flutter_test.dart';
import 'package:officer_mobile/ticket_qr.dart';

void main() {
  test('QR decoding accepts only the configured public site and opaque token',
      () {
    final token = List.filled(64, 'a').join();
    expect(
        ticketQrToken('https://traffic.example/verify#token=$token',
            'https://traffic.example'),
        token);
    for (final value in [
      'https://wrong.example/verify#token=$token',
      'https://traffic.example/profile#token=$token',
      'javascript:alert(1)',
      'https://traffic.example/verify#token=short'
    ]) {
      expect(() => ticketQrToken(value, 'https://traffic.example'),
          throwsFormatException);
    }
  });
}
