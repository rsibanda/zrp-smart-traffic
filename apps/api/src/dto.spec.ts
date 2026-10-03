import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateOffenceDto, VehicleQuery } from './dto';

describe('Request validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const draft = {
    requestKey: '11111111-1111-4111-8111-111111111111',
    vehicleId: '22222222-2222-4222-8222-222222222222',
    categoryId: '33333333-3333-4333-8333-333333333333',
    location: 'Demo location',
    notes: 'Fictional observation',
    observedAt: '2026-09-21T12:00:00Z',
  };
  it('normalises exact plates without enabling unfiltered search', async () => {
    expect(
      await pipe.transform(
        { registration: ' demo-001 ' },
        { type: 'query', metatype: VehicleQuery },
      ),
    ).toEqual({ registration: 'DEMO001' });
    await expect(
      pipe.transform({}, { type: 'query', metatype: VehicleQuery }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([
    { role: 'ADMIN' },
    { latitude: 91, longitude: 30 },
    { observedAt: '2026-09-21T12:00:00' },
    { observedAt: '2026-02-30T12:00:00Z' },
    { notes: '   ' },
  ])('rejects invalid input %j', async (extra) => {
    await expect(
      pipe.transform(
        { ...draft, ...extra },
        { type: 'body', metatype: CreateOffenceDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('allows empty optional notes while retaining a string contract', async () => {
    const result = await pipe.transform(
      { ...draft, notes: '' },
      { type: 'body', metatype: CreateOffenceDto },
    );
    expect(result.notes).toBe('');
  });
});
