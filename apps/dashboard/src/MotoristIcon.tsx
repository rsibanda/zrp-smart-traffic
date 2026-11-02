export type MotoristIconName =
  | 'checkpoint'
  | 'home'
  | 'fine'
  | 'payment'
  | 'vehicle'
  | 'profile'
  | 'clock'
  | 'shield'
  | 'receipt'
  | 'paid';
const paths: Record<MotoristIconName, string> = {
  checkpoint: 'M9 3h6l4 17H5L9 3Zm-2 8h10M6 16h12M3 21h18',
  home: 'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',
  fine: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v.1',
  payment: 'M3 5h18v14H3V5Zm0 4h18M6 15h4',
  vehicle: 'm5 8 2-5h10l2 5M3 9h18v9H3V9Zm2 9v3m14-3v3M6 13h2m8 0h2',
  profile: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3H4Z',
  clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 3',
  shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm0 0v20',
  receipt: 'M5 2h14v20l-3-2-4 2-4-2-3 2V2Zm4 5h6m-6 4h6m-6 4h3',
  paid: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM7 12l3 3 7-7',
};
export function MotoristIcon({ name }: { name: MotoristIconName }) {
  return (
    <svg
      className="motorist-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
