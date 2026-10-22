import type { NextRequest } from 'next/server';
import { clientIp } from '@/lib/client-ip';

/**
 * Same-origin proxy to the API, so session cookies stay first-party and
 * SameSite=Lax. API_ORIGIN is read at request time, so one build runs in any
 * environment. The client IP is passed on for the API's rate limits.
 */
const FORWARD = [
  'content-type',
  'cookie',
  'x-csrf-token',
  'idempotency-key',
  'x-request-id',
  'user-agent',
  'x-paystack-signature',
];

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const origin = process.env.API_ORIGIN ?? 'http://localhost:4000';
  const { path } = await params;
  const url = `${origin}/v1/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const h of FORWARD) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const ip = clientIp(req.headers, process.env.CLIENT_IP_HEADER);
  if (ip) headers.set('x-forwarded-for', ip);
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const res = await fetch(url, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: 'manual',
    cache: 'no-store',
  });
  const out = new Headers();
  res.headers.forEach((v, k) => {
    if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie'].includes(k))
      out.set(k, v);
  });
  for (const c of res.headers.getSetCookie()) out.append('set-cookie', c);
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: out });
}

export const dynamic = 'force-dynamic';
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
