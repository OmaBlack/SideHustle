import { describe, expect, it } from 'vitest';
import { clientIp } from './client-ip';

const h = (o: Record<string, string>) => new Headers(o);

describe('clientIp', () => {
  it('defaults to the last X-Forwarded-For entry, ignoring browser-supplied ones', () => {
    expect(clientIp(h({ 'x-forwarded-for': '6.6.6.6, 7.7.7.7, 203.0.113.5' }))).toBe('203.0.113.5');
    expect(clientIp(h({ 'x-forwarded-for': '6.6.6.6, 203.0.113.5' }), 'xff-last')).toBe('203.0.113.5');
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.5' }), '')).toBe('203.0.113.5');
  });

  it('uses a named header verbatim', () => {
    const headers = h({ 'cf-connecting-ip': '198.51.100.9', 'x-forwarded-for': '6.6.6.6' });
    expect(clientIp(headers, 'cf-connecting-ip')).toBe('198.51.100.9');
    expect(clientIp(headers, 'x-real-ip')).toBeNull();
  });

  it('returns null when the header is missing', () => {
    expect(clientIp(h({}))).toBeNull();
    expect(clientIp(h({}), 'cf-connecting-ip')).toBeNull();
  });
});
