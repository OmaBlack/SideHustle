'use client';

/** RFC 7807 problem from the API, with field errors when a form failed validation. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly body: Record<string, unknown>,
  ) {
    super(title);
  }
  get fields(): Record<string, string> {
    return (this.body.fields as Record<string, string>) ?? {};
  }
}

function csrf(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith('sh_csrf='))
    ?.slice('sh_csrf='.length);
}

/** Calls the API through the web origin (next.config rewrites /v1). Mutations carry the CSRF token. */
export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
  const headers: Record<string, string> = { ...init.headers };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const token = csrf();
  if (method !== 'GET' && token) headers['x-csrf-token'] = token;
  const res = await fetch(`/v1${path}`, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      String(json.code ?? 'ERROR'),
      String(json.title ?? 'Something went wrong'),
      json,
    );
  }
  return json as T;
}

export const post = <T>(path: string, body: unknown = {}, headers?: Record<string, string>) =>
  api<T>(path, { method: 'POST', body, headers });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });
