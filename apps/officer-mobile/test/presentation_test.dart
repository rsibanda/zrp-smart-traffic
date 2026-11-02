import 'package:flutter_test/flutter_test.dart';
import 'package:officer_mobile/presentation.dart';

void main() {
  test('formats the ledger denomination and stored payment methods', () {
    expect(formatCurrency('25'), r'US$25.00');
    expect(formatCurrency(0), r'US$0.00');
    expect(formatCurrency('1234.56'), r'US$1,234.56');
    expect(paymentMethodLabel('ECOCASH'), 'EcoCash');
    expect(paymentMethodLabel('INNBUCKS'), 'InnBucks');
    expect(paymentMethodLabel('CARD'), 'Bank Card');
    expect(paymentMethodLabel('LEGACY'), 'Payment');
    expect(paymentMethodLabel(null), 'Payment');
    expect(ticketLabel({'publicReference': 'opaque-key'}), 'Traffic ticket');
  });
}
