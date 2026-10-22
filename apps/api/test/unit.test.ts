import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { orderRef } from '../src/lib/crypto.js';
import { moderationFlags } from '../src/lib/moderation.js';
import { PaystackProvider } from '../src/lib/payments/provider.js';
import { renderTemplate, TEMPLATE_NAMES } from '../src/lib/templates.js';
import { deriveOrderStatus, nextFulfilmentStatus, stepsDone } from '../src/modules/orders/service.js';

describe('order references (BR-11)', () => {
  it('are SH- plus 8 Crockford base32 characters and do not repeat', () => {
    const refs = new Set(Array.from({ length: 5000 }, orderRef));
    expect(refs.size).toBe(5000);
    for (const r of refs) expect(r).toMatch(/^SH-[0-9A-HJKMNP-TV-Z]{8}$/);
  });
});

describe('fulfilment state machine (plan section 7)', () => {
  it('allows only the listed transitions', () => {
    expect(nextFulfilmentStatus('awaiting_confirmation', 'confirm')).toBe('confirmed');
    expect(nextFulfilmentStatus('awaiting_confirmation', 'dispatch')).toBeNull();
    expect(nextFulfilmentStatus('confirmed', 'reject')).toBeNull();
    expect(nextFulfilmentStatus('dispatched', 'deliver')).toBe('delivered');
    expect(nextFulfilmentStatus('delivered', 'deliver')).toBeNull();
  });
  it('derives the parent status, ignoring rejected fulfilments', () => {
    expect(deriveOrderStatus('paid', ['awaiting_confirmation', 'awaiting_confirmation'])).toBe('paid');
    expect(deriveOrderStatus('paid', ['confirmed', 'awaiting_confirmation'])).toBe('in_fulfilment');
    expect(deriveOrderStatus('in_fulfilment', ['delivered', 'rejected'])).toBe('delivered');
    expect(deriveOrderStatus('paid', ['rejected', 'rejected'])).toBe('cancelled');
    expect(deriveOrderStatus('refunded', ['delivered'])).toBe('refunded');
  });
  it('maps fulfilments to the four buyer steps', () => {
    expect(
      ['awaiting_confirmation', 'confirmed', 'dispatched', 'delivered'].map((s) => stepsDone(s as never)),
    ).toEqual([1, 2, 3, 4]);
  });
});

describe('moderation [Default]', () => {
  it('holds links, emails and Nigerian phone numbers', () => {
    expect(moderationFlags('20% off all shea this week')).toEqual([]);
    expect(moderationFlags('Visit www.shop.ng')).toEqual(['link']);
    expect(moderationFlags('Mail me a@b.co')).toContain('email');
    expect(moderationFlags('Call 0803 123 4567')).toEqual(['phone']);
    expect(moderationFlags('Call +234 803 123 4567')).toEqual(['phone']);
  });
});

describe('Paystack adapter', () => {
  const secret = 'sk_test_x';
  const p = new PaystackProvider(secret, 'https://web.test/orders');
  it('accepts only a matching HMAC-SHA512 signature over the raw body', () => {
    const raw = Buffer.from(
      '{"event":"charge.success","data":{"reference":"SH-1","amount":100,"currency":"NGN"}}',
    );
    const sig = createHmac('sha512', secret).update(raw).digest('hex');
    expect(p.verifyWebhook(raw, { 'x-paystack-signature': sig })).toBe(true);
    expect(
      p.verifyWebhook(Buffer.from(raw.toString().replace('100', '1')), { 'x-paystack-signature': sig }),
    ).toBe(false);
    expect(p.verifyWebhook(raw, {})).toBe(false);
    expect(p.parseWebhook(JSON.parse(raw.toString()))).toMatchObject({
      kind: 'charge.success',
      reference: 'SH-1',
      amountKobo: 100,
    });
  });
  it('initialises with both channels and the callback URL', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: true,
            message: 'ok',
            data: { authorization_url: 'https://checkout.paystack.com/x', access_code: 'x' },
          }),
        ),
    );
    const r = await new PaystackProvider(secret, 'https://web.test/orders', fetchImpl as never).initialize({
      reference: 'SH-1',
      amountKobo: 5000,
      email: 'a@b.co',
      channels: ['card', 'bank_transfer'],
    });
    expect(r.authorizationUrl).toContain('paystack');
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toMatchObject({
      amount: 5000,
      currency: 'NGN',
      channels: ['card', 'bank_transfer'],
      callback_url: 'https://web.test/orders/SH-1',
    });
  });
});

describe('message templates', () => {
  it('renders every template in plain English', () => {
    for (const t of TEMPLATE_NAMES)
      expect(
        renderTemplate(t, {
          ref: 'SH-1',
          totalKobo: 100,
          amountKobo: 100,
          vendor: 'V',
          code: '123456',
          link: 'x',
        }).length,
      ).toBeGreaterThan(10);
    expect(renderTemplate('order_paid', { ref: 'SH-1', totalKobo: 12_500_000 })).toContain('₦125,000');
    expect(() => renderTemplate('nope', {})).toThrow();
  });
});
