// Issued line values are immutable; draft values follow the configured catalogue.
type Category = {
  id: string;
  name: string;
  demoFineAmount: { toString(): string };
  demeritPoints: number;
};
export function offenceLines(offence: {
  category: Category;
  charges?: Array<{
    categoryId: string;
    category: Category;
    nameSnapshot: string | null;
    fineSnapshot: { toString(): string } | null;
    pointsSnapshot: number | null;
  }>;
}) {
  return offence.charges?.length
    ? offence.charges.map((c) => ({
        categoryId: c.categoryId,
        name: c.nameSnapshot ?? c.category.name,
        fine: (c.fineSnapshot ?? c.category.demoFineAmount).toString(),
        points: c.pointsSnapshot ?? c.category.demeritPoints,
      }))
    : [
        {
          categoryId: offence.category.id,
          name: offence.category.name,
          fine: offence.category.demoFineAmount.toString(),
          points: offence.category.demeritPoints,
        },
      ];
}
