import { canTransition, scope } from './offences.service';
import { OffenceStatus } from '../generated/client';

describe('Review state machine', () => {
  const allowed = [
    'SUBMITTED:UNDER_REVIEW',
    'UNDER_REVIEW:CONFIRMED',
    'UNDER_REVIEW:CANCELLED',
  ];
  for (const from of Object.values(OffenceStatus))
    for (const to of Object.values(OffenceStatus)) {
      it(`${from} -> ${to}`, () =>
        expect(canTransition(from, to)).toBe(
          allowed.includes(`${from}:${to}`),
        ));
    }
  it('limits officers to their own records', () =>
    expect(scope({ id: 'one', name: '', email: '', role: 'OFFICER' })).toEqual({
      officerId: 'one',
    }));
  it('limits supervisors to assigned non-drafts', () =>
    expect(
      scope({ id: 'two', name: '', email: '', role: 'SUPERVISOR' }),
    ).toEqual({ supervisorId: 'two', status: { not: 'DRAFT' } }));
});
