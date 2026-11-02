import { qrConfiguration } from './ticket-qr';
describe('ticket QR deployment configuration', () => {
  it('disables QR issuance when no public origin is configured', () => {
    expect(qrConfiguration({})).toEqual({ origin: null, days: 30 });
  });
  it('requires a public HTTPS origin and bounded expiry', () => {
    for (const PUBLIC_SITE_URL of [
      'http://example.org',
      'https://localhost',
      'https://127.0.0.1',
      'https://192.168.1.3',
      'https://172.16.2.3',
      'https://example.org/path',
      'https://u:p@example.org',
      'https://example.org?token=x',
    ])
      expect(() => qrConfiguration({ PUBLIC_SITE_URL })).toThrow();
    for (const TICKET_QR_EXPIRY_DAYS of ['0', '-1', '366', '1.5', 'no'])
      expect(() => qrConfiguration({ TICKET_QR_EXPIRY_DAYS })).toThrow();
    expect(
      qrConfiguration({
        PUBLIC_SITE_URL: 'https://traffic.example.org/',
        TICKET_QR_EXPIRY_DAYS: '7',
      }),
    ).toEqual({ origin: 'https://traffic.example.org', days: 7 });
  });
});
