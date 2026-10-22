'use client';
import { Button } from '@sidehustle/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError, SelectField, TextArea, TextField, useSubmit } from '@/components/forms';
import { Banner, Card, Page, Section } from '@/components/Page';
import { api, del, post } from '@/lib/api';
import type { DealView } from '@/lib/types';
import { useVendor } from '@/lib/vendor';
import { PageLoading } from '@/components/PageLoading';

/** FR-VP-03..05, UC-4: promo (category or product) or launch, headline ≤ 60, live slideshow preview, remove. */
export default function VendorDeals() {
  const t = useTranslations('vendorPortal');
  const ts = useTranslations('slides');
  const { vendor } = useVendor();
  const qc = useQueryClient();
  const deals = useQuery({
    queryKey: ['vendorDeals'],
    queryFn: () => api<{ deals: DealView[] }>('/vendor/deals').then((r) => r.deals),
    enabled: !!vendor,
  });
  const products = useQuery({
    queryKey: ['vendorProducts'],
    queryFn: () =>
      api<{ products: { id: string; name: string; status: string }[] }>('/vendor/products').then(
        (r) => r.products,
      ),
    enabled: !!vendor,
  });
  const [d, setD] = useState({
    kind: 'promo' as 'promo' | 'launch',
    scope: 'category' as 'category' | 'product',
    productId: '',
    discountPct: 10,
    headline: '',
    detail: '',
    endsOn: '',
  });
  const [held, setHeld] = useState<string[]>([]);
  const s = useSubmit();
  if (!vendor)
    return (
      <Page title={t('dealsTitle')}>
        <PageLoading text={t('loading')} />
      </Page>
    );
  const left = 60 - d.headline.length;
  return (
    <Page title={t('dealsTitle')} lead={t('dealsLead')}>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const body = {
                kind: d.kind,
                headline: d.headline,
                detail: d.detail,
                ...(d.kind === 'promo'
                  ? {
                      scope: d.scope,
                      discountPct: d.discountPct,
                      endsOn: d.endsOn || undefined,
                      ...(d.scope === 'product' ? { productId: d.productId } : {}),
                    }
                  : d.endsOn
                    ? { endsOn: d.endsOn }
                    : {}),
              };
              const r = await s.run(() => post<{ heldFor: string[] }>('/vendor/deals', body));
              if (r) {
                setHeld(r.heldFor);
                setD({ ...d, headline: '', detail: '' });
                await qc.invalidateQueries({ queryKey: ['vendorDeals'] });
              }
            }}
          >
            <SelectField
              label={t('dealType')}
              value={d.kind}
              onChange={(e) => setD({ ...d, kind: e.target.value as 'promo' })}
            >
              <option value="promo">{t('promo')}</option>
              <option value="launch">{t('launch')}</option>
            </SelectField>
            {d.kind === 'promo' && (
              <>
                <SelectField
                  label={t('appliesTo')}
                  value={d.scope}
                  onChange={(e) => setD({ ...d, scope: e.target.value as 'category' })}
                >
                  <option value="category">{t('wholeCategory')}</option>
                  <option value="product">{t('oneProduct')}</option>
                </SelectField>
                {d.scope === 'product' && (
                  <SelectField
                    label={t('product')}
                    value={d.productId}
                    onChange={(e) => setD({ ...d, productId: e.target.value })}
                    error={s.fields.productId}
                  >
                    <option value="">{t('chooseProduct')}</option>
                    {(products.data ?? [])
                      .filter((p) => p.status === 'active')
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </SelectField>
                )}
                <TextField
                  label={t('discount')}
                  inputMode="numeric"
                  value={String(d.discountPct)}
                  onChange={(e) =>
                    setD({ ...d, discountPct: Number(e.target.value.replace(/\D/g, '') || 0) })
                  }
                  error={s.fields.discountPct}
                />
              </>
            )}
            <TextField
              label={t('headline')}
              hint={t('headlineLeft', { n: left })}
              value={d.headline}
              onChange={(e) => setD({ ...d, headline: e.target.value })}
              error={s.fields.headline ?? (left < 0 ? t('headlineTooLong') : undefined)}
            />
            <TextArea
              label={t('detail')}
              rows={2}
              value={d.detail}
              onChange={(e) => setD({ ...d, detail: e.target.value })}
            />
            <TextField
              label={t('endsOn')}
              type="date"
              value={d.endsOn}
              onChange={(e) => setD({ ...d, endsOn: e.target.value })}
              error={s.fields.endsOn}
              hint={d.kind === 'launch' ? t('endsOptional') : undefined}
            />
            {held.length > 0 && <Banner tone="warn">{t('heldForReview')}</Banner>}
            <FormError error={s.error} />
            {/* AC-10: an over-long headline cannot be submitted. */}
            <Button type="submit" disabled={s.busy || left < 0 || !d.headline.trim()}>
              {t('post')}
            </Button>
          </form>
        </Card>
        <Section title={t('preview')}>
          {/* FR-VP-04: how it will look in the slideshow. */}
          <div
            aria-live="polite"
            className="flex min-h-[200px] flex-col justify-end gap-2 rounded-card p-5 text-white"
            style={{ background: vendor.vendor.brandColor ?? 'var(--deep)' }}
          >
            <p className="text-[13px] font-bold uppercase tracking-wide opacity-90">
              {d.kind === 'promo' ? ts('promo', { pct: d.discountPct }) : ts('launch')} · {vendor.vendor.name}
            </p>
            <p className="font-display text-[clamp(22px,5vw,30px)] font-extrabold leading-tight">
              {d.headline || t('headlinePlaceholder')}
            </p>
            {d.detail && <p className="text-[14px] opacity-90">{d.detail}</p>}
          </div>
        </Section>
      </div>
      <Section title={t('yourDeals')}>
        <ul className="flex flex-col gap-2">
          {(deals.data ?? []).map((x) => (
            <li
              key={x.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold">{x.headline}</p>
                <p className="text-[12.5px] text-muted">
                  {x.kind === 'promo'
                    ? `${x.discountPct}% · ${x.product?.name ?? x.category.name}`
                    : t('launch')}
                  {x.endsOn ? ` · ${t('until', { date: x.endsOn })}` : ''}
                </p>
              </div>
              <span className="rounded-full bg-sunk px-2.5 py-0.5 text-[12.5px] font-bold">
                {t(`dealState.${x.state ?? 'live'}`)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await del(`/vendor/deals/${x.id}`);
                  await qc.invalidateQueries({ queryKey: ['vendorDeals'] });
                }}
                aria-label={t('removeNamed', { name: x.headline })}
              >
                {t('remove')}
              </Button>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}
