import { notFound } from 'next/navigation';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

/**
 * Server-side catalogue reads. Cached for 30 seconds; pages using it render
 * per request, so `next build` never needs the API running.
 */
export async function serverApi<T>(
  path: string,
  { revalidate = 30 }: { revalidate?: number } = {},
): Promise<T> {
  const res = await fetch(`${API_ORIGIN}/v1${path}`, { next: { revalidate } });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}
