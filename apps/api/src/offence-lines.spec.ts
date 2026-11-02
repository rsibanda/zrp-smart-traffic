import { offenceLines } from './offence-lines';

describe('Infringement line display', () => {
  const category = {
    id: 'a',
    name: 'Updated category',
    demoFineAmount: '99.50',
    demeritPoints: 9,
  };
  it('uses frozen issued values even after catalogue edits, including zero points', () => {
    expect(
      offenceLines({
        category,
        charges: [
          {
            categoryId: 'a',
            category,
            nameSnapshot: 'Original name',
            fineSnapshot: '25.00',
            pointsSnapshot: 0,
          },
        ],
      }),
    ).toEqual([
      { categoryId: 'a', name: 'Original name', fine: '25.00', points: 0 },
    ]);
  });
  it('uses the configured values for draft lines and supports older records', () => {
    const expected = [
      { categoryId: 'a', name: category.name, fine: '99.50', points: 9 },
    ];
    expect(
      offenceLines({
        category,
        charges: [
          {
            categoryId: 'a',
            category,
            nameSnapshot: null,
            fineSnapshot: null,
            pointsSnapshot: null,
          },
        ],
      }),
    ).toEqual(expected);
    expect(offenceLines({ category })).toEqual(expected);
  });
});
