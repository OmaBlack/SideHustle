'use client';
import { Button, PhoneInput, StateSelect, formatNaira } from '@sidehustle/ui';
import { NIGERIAN_STATES } from '@sidehustle/schemas';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { FormError, TextField, useSubmit } from '@/components/forms';
import { Banner, Card, Page, Section } from '@/components/Page';
import { api, post } from '@/lib/api';
import { useCart, useRequireLogin } from '@/lib/session';
import type { OrderView } from '@/lib/types';

interface Method {
  code: string;
  name: string;
  feeKobo: number;
  etaText: string | null;
  eligibleStates: string[];
  needsAddress: boolean;
}
interface Quote {
  id: string;
  expiresAt: string;
  subtotalKobo: number;
  bundleDiscountKobo: number;
  deliveryKobo: number;
  totalKobo: number;
  changes: { cartLineId: string; fromKobo: number; toKobo: number }[];
}

/** FR-CHK-01..07, UC-1 steps 4–6. */
export default function CheckoutPage() {
  const t = useTranslations('checkout');
  const me = useRequireLogin();
  const cart = useCart(!!me.data);
  const methods = useQuery({
    queryKey: ['delivery'],
    queryFn: () => api<{ methods: Method[] }>('/delivery-methods').then((r) => r.methods),
  });
  const [method, setMethod] = useState('pickup');
  const [recipient, setRecipient] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState({ line1: '', line2: '', city: '', state: '' });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [idemKey, setIdemKey] = useState('');
  const review = useSubmit();
  const place = useSubmit();
  const u = me.data;
  const m = methods.data?.find((x) => x.code === method);

  if (!u)
    return (
      <Page title={t('title')}>
        <p role="status">{t('loading')}</p>
      </Page>
    );
  if (!u.phoneVerified || !u.emailVerified) {
    return (
      <Page title={t('title')} narrow>
        <Banner tone="warn">{t('verifyFirst')}</Banner>
        <Link
          href={`/verify?next=${encodeURIComponent('/checkout')}`}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 font-bold text-on-accent no-underline"
        >
          {t('verifyNow')}
        </Link>
      </Page>
    );
  }
  if (cart.data && cart.data.lines.length === 0) {
    return (
      <Page title={t('title')} narrow>
        <p>{t('empty')}</p>
        <Link href="/kits">{t('browse')}</Link>
      </Page>
    );
  }

  const body = () => ({
    deliveryMethod: method,
    recipient: recipient || u.name,
    phone: phone || u.phone,
    ...(m?.needsAddress ? { address } : {}),
  });

  const pay = async () => {
    if (!quote) return;
    const r = await place.run(() =>
      post<{ order: OrderView; payment: { authorizationUrl: string } | null }>(
        '/orders',
        { quoteId: quote.id },
        { 'idempotency-key': idemKey },
      ),
    );
    // FR-CHK-05: if prices moved since review the order is refused; the buyer reviews the new total.
    if (!r) return;
    if (r.payment?.authorizationUrl) window.location.assign(r.payment.authorizationUrl);
    else window.location.assign(`/orders/${r.order.ref}`);
  };

  return (
    <Page title={t('title')} narrow>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await review.run(() => post<{ quote: Quote }>('/checkout/quote', body()));
          if (r) {
            setQuote(r.quote);
            setIdemKey(crypto.randomUUID());
          }
        }}
        onChange={() => setQuote(null)}
      >
        <Section title={t('delivery')}>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t('delivery')}</legend>
            {(methods.data ?? []).map((d) => (
              <label
                key={d.code}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-card border border-line bg-surface p-3 has-[:checked]:border-accent"
              >
                <input
                  type="radio"
                  name="delivery"
                  className="h-5 w-5 accent-[var(--accent)]"
                  value={d.code}
                  checked={method === d.code}
                  onChange={() => setMethod(d.code)}
                />
                <span className="flex-1">
                  <span className="block font-semibold">{d.name}</span>
                  <span className="text-[12.5px] text-muted">
                    {d.etaText}
                    {d.eligibleStates.length
                      ? ` · ${t('onlyIn', { states: d.eligibleStates.join(', ') })}`
                      : ''}
                  </span>
                </span>
                <span className="font-bold tabular-nums">
                  {d.feeKobo ? formatNaira(d.feeKobo) : t('free')}
                </span>
              </label>
            ))}
          </fieldset>
          {review.fields.deliveryMethod && (
            <p role="alert" className="text-[13px] text-danger">
              {review.fields.deliveryMethod}
            </p>
          )}
        </Section>
        <Section title={t('recipient')}>
          <TextField
            label={t('name')}
            autoComplete="name"
            value={recipient}
            placeholder={u.name}
            onChange={(e) => setRecipient(e.target.value)}
            error={review.fields.recipient}
          />
          <PhoneInput
            label={t('phone')}
            value={phone}
            placeholder={u.phone.replace('+234', '')}
            onChange={(e) => setPhone(e.target.value)}
            error={review.fields.phone}
          />
          {m?.needsAddress && (
            <>
              <TextField
                label={t('line1')}
                autoComplete="address-line1"
                value={address.line1}
                onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                error={review.fields['address.line1']}
              />
              <TextField
                label={t('line2')}
                autoComplete="address-line2"
                value={address.line2}
                onChange={(e) => setAddress({ ...address, line2: e.target.value })}
              />
              <TextField
                label={t('city')}
                autoComplete="address-level2"
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
                error={review.fields['address.city']}
              />
              <StateSelect
                label={t('state')}
                placeholder={t('statePlaceholder')}
                states={NIGERIAN_STATES}
                value={address.state}
                onChange={(e) => setAddress({ ...address, state: e.target.value })}
                error={review.fields['address.state']}
              />
            </>
          )}
        </Section>
        <FormError error={review.error} />
        <Button type="submit" variant={quote ? 'ghost' : 'primary'} disabled={review.busy}>
          {quote ? t('reviewAgain') : t('review')}
        </Button>
      </form>

      {quote && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">{t('summary')}</h2>
          {quote.changes.length > 0 && (
            <Banner tone="warn">{t('changes', { count: quote.changes.length })}</Banner>
          )}
          <div className="flex justify-between">
            <span>{t('subtotal')}</span>
            <span className="tabular-nums">{formatNaira(quote.subtotalKobo)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('bundleDiscount')}</span>
            <span className="tabular-nums">−{formatNaira(quote.bundleDiscountKobo)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('deliveryFee')}</span>
            <span className="tabular-nums">{formatNaira(quote.deliveryKobo)}</span>
          </div>
          <div className="flex justify-between text-lg font-extrabold">
            <span>{t('total')}</span>
            <span className="tabular-nums">{formatNaira(quote.totalKobo)}</span>
          </div>
          <p className="text-[12.5px] text-muted">{t('payMethods')}</p>
          <FormError error={place.error} />
          <Button variant="gold" disabled={place.busy} onClick={pay}>
            {place.busy ? t('starting') : t('pay', { total: formatNaira(quote.totalKobo) })}
          </Button>
        </Card>
      )}
    </Page>
  );
}
