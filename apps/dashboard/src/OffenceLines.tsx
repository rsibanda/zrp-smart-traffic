import { formatCurrency } from './presentation';
export type OffenceLine = {
  categoryId: string;
  name: string;
  fine: string;
  points: number;
};
export type Charge = {
  categoryId: string;
  nameSnapshot: string | null;
  fineSnapshot: string | null;
  pointsSnapshot: number | null;
  category: { name: string; demoFineAmount: string; demeritPoints: number };
};
export function chargeLines(charges?: Charge[]): OffenceLine[] {
  return (charges ?? []).map((c) => ({
    categoryId: c.categoryId,
    name: c.nameSnapshot ?? c.category.name,
    fine: c.fineSnapshot ?? c.category.demoFineAmount,
    points: c.pointsSnapshot ?? c.category.demeritPoints,
  }));
}
export function OffenceLines({ lines }: { lines: OffenceLine[] }) {
  if (!lines.length) return null;
  return (
    <ul className="offence-lines" aria-label="Selected offences">
      {lines.map((line) => (
        <li key={line.categoryId}>
          <span>{line.name}</span>
          <span>
            {formatCurrency(line.fine)} · {line.points} points
          </span>
        </li>
      ))}
    </ul>
  );
}
