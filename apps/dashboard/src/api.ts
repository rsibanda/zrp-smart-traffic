/// <reference types="vite/client" />
const origin = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
export const apiUrl = (path: string) => `${origin}/api/v1${path}`;
export const serviceUnavailable =
  'Unable to connect to the traffic management service. Please try again.';
export async function apiFetch(path: string, options: RequestInit) {
  try {
    return await fetch(apiUrl(path), options);
  } catch {
    throw new Error(serviceUnavailable);
  }
}
export async function responseError(response: Response): Promise<Error> {
  if (response.status >= 500) return new Error(serviceUnavailable);
  const body = await response.json().catch(() => ({}));
  return new Error(
    [body.message ?? 'Request failed. Please try again.'].flat().join('. '),
  );
}
