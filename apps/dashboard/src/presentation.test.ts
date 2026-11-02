import { expect, it } from 'vitest';
import {
  formatCurrency,
  paymentMethodLabel,
  ticketLabel,
} from './presentation';

it('formats configured currency consistently and preserves fractional amounts', () => {
  expect(formatCurrency('25')).toBe('US$25.00');
  expect(formatCurrency(0)).toBe('US$0.00');
  expect(formatCurrency('1234.56')).toBe('US$1,234.56');
  expect(formatCurrency(25, 'EUR')).toContain('25.00');
});
it('displays stored payment methods without guessing missing historical data', () => {
  expect(
    ['ECOCASH', 'INNBUCKS', 'CARD', 'LEGACY', undefined].map(
      paymentMethodLabel,
    ),
  ).toEqual(['EcoCash', 'InnBucks', 'Bank Card', 'Payment', 'Payment']);
  expect(ticketLabel({})).toBe('Traffic ticket');
});
