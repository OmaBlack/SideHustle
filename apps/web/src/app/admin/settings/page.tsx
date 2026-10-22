'use client';
import { NIGERIAN_STATES } from '@sidehustle/schemas';
import { Button } from '@sidehustle/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminGate } from '@/components/AdminGate';
import { CrudTable, type Column } from '@/components/CrudTable';
import { FormError, TextField, useSubmit } from '@/components/forms';
import { Card, Section } from '@/components/Page';
import { useAdminQuery } from '@/lib/admin';
import { api, put } from '@/lib/api';
import type { Category } from '@/lib/types';

interface Config {
  config: { key: string; value: unknown }[];
  payout: { id: string; vendorId: string | null; daysAfterDelivery: number; holdbackBps: number }[];
}

/** FR-ADM-04/08/09/10/11, NFR-MNT-02: configuration without a deploy. */
export default function Settings() {
  const t = useTranslations('admin');
  const qc = useQueryClient();
  const cfg = useAdminQuery<Config>(['config'], '/admin/config');
  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: Category[] }>('/categories').then((r) => r.categories),
  });
  const vendors = useAdminQuery<{ vendors: { id: string; name: string }[] }>(
    ['adminVendors', ''],
    '/admin/vendors',
  );
  const products = useAdminQuery<{ products: { id: string; name: string; vendor: string }[] }>(
    ['adminProducts'],
    '/admin/products',
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const s = useSubmit();
  const scopeOpts = [
    { value: 'global', label: t('scope.global') },
    { value: 'category', label: t('scope.category') },
    { value: 'vendor', label: t('scope.vendor') },
  ];
  const targetOpts = [
    ...(cats.data ?? []).map((c) => ({ value: c.id, label: `${t('scope.category')}: ${c.name}` })),
    ...(vendors.data?.vendors ?? []).map((v) => ({ value: v.id, label: `${t('scope.vendor')}: ${v.name}` })),
  ];
  const catOpts = (cats.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const prodOpts = (products.data?.products ?? []).map((p) => ({
    value: p.id,
    label: `${p.name} (${p.vendor})`,
  }));
  const scoped = (extra: Column[]): Column[] => [
    { key: 'scope', label: t('scopeLabel'), type: 'select', options: scopeOpts },
    { key: 'scopeId', label: t('appliesTo'), type: 'select', options: targetOpts, nullable: true },
    ...extra,
  ];
  return (
    <AdminGate title={t('settingsTitle')} denied={cfg.denied} ready={!!cfg.data}>
      <CrudTable
        title={t('bundleRules')}
        path="bundle-rules"
        blank={{ scope: 'category', scopeId: null, minKobo: 10_000_000, pct: 5 }}
        columns={scoped([
          { key: 'minKobo', label: t('threshold'), type: 'naira' },
          { key: 'pct', label: t('pct'), type: 'int' },
        ])}
      />
      <CrudTable
        title={t('commission')}
        path="commission-rules"
        blank={{ scope: 'category', scopeId: null, rateBps: 1000 }}
        columns={scoped([{ key: 'rateBps', label: t('rateBps'), type: 'bps' }])}
      />
      <CrudTable
        title={t('delivery')}
        path="delivery-methods"
        blank={{
          code: '',
          name: '',
          feeKobo: 0,
          etaText: '',
          eligibleStates: [],
          partner: null,
          active: true,
          sortOrder: 100,
        }}
        columns={[
          { key: 'code', label: t('code'), type: 'text' },
          { key: 'name', label: t('name'), type: 'text' },
          { key: 'feeKobo', label: t('fee'), type: 'naira' },
          { key: 'etaText', label: t('eta'), type: 'text' },
          { key: 'eligibleStates', label: t('states', { all: NIGERIAN_STATES.length }), type: 'list' },
          { key: 'partner', label: t('partner'), type: 'text' },
          { key: 'active', label: t('active'), type: 'bool' },
          { key: 'sortOrder', label: t('sort'), type: 'int' },
        ]}
      />
      <CrudTable
        title={t('restrictions')}
        path="restrictions"
        blank={{ categoryId: null, productId: null, requiredLicence: '' }}
        columns={[
          { key: 'categoryId', label: t('scope.category'), type: 'select', options: catOpts, nullable: true },
          { key: 'productId', label: t('product'), type: 'select', options: prodOpts, nullable: true },
          { key: 'requiredLicence', label: t('licenceNeeded'), type: 'text' },
        ]}
      />
      <CrudTable
        title={t('retention')}
        path="retention"
        blank={{ dataType: 'orders', retainDays: 2190, action: 'archive' }}
        columns={[
          { key: 'dataType', label: t('dataType'), type: 'text' },
          { key: 'retainDays', label: t('retainDays'), type: 'int' },
          {
            key: 'action',
            label: t('retentionAction'),
            type: 'select',
            options: [
              { value: 'archive', label: t('archive') },
              { value: 'purge', label: t('purge') },
            ],
          },
        ]}
      />
      <CrudTable
        title={t('categories')}
        path="categories"
        blank={{ slug: '', name: '', sortOrder: 100 }}
        columns={[
          { key: 'slug', label: t('code'), type: 'text' },
          { key: 'name', label: t('name'), type: 'text' },
          { key: 'sortOrder', label: t('sort'), type: 'int' },
        ]}
      />
      <Section title={t('appConfig')}>
        <Card className="flex flex-col gap-3">
          {(cfg.data?.config ?? []).map((c) => (
            <form
              key={c.key}
              className="flex flex-wrap items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const raw = values[c.key] ?? String(c.value);
                const value = /^\d+$/.test(raw)
                  ? Number(raw)
                  : raw === 'true' || raw === 'false'
                    ? raw === 'true'
                    : raw;
                if (await s.run(() => put(`/admin/config/${c.key}`, { value })))
                  await qc.invalidateQueries({ queryKey: ['config'] });
              }}
            >
              <TextField
                label={t.has(`config.${c.key}`) ? t(`config.${c.key}`) : c.key}
                value={values[c.key] ?? String(c.value)}
                onChange={(e) => setValues({ ...values, [c.key]: e.target.value })}
              />
              <Button size="sm" type="submit" variant="ghost">
                {t('save')}
              </Button>
            </form>
          ))}
          {(cfg.data?.payout ?? []).map((p) => (
            <form
              key={p.id}
              className="flex flex-wrap items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                if (
                  await s.run(() =>
                    put(`/admin/payout-settings/${p.id}`, {
                      daysAfterDelivery: Number(fd.get('days')),
                      holdbackBps: Math.round(Number(fd.get('holdback')) * 100),
                    }),
                  )
                )
                  await qc.invalidateQueries({ queryKey: ['config'] });
              }}
            >
              <TextField
                name="days"
                label={t('payoutDays')}
                inputMode="numeric"
                defaultValue={p.daysAfterDelivery}
              />
              <TextField
                name="holdback"
                label={t('holdback')}
                inputMode="decimal"
                defaultValue={p.holdbackBps / 100}
              />
              <Button size="sm" type="submit" variant="ghost">
                {t('save')}
              </Button>
            </form>
          ))}
          <FormError error={s.error} />
          <p className="text-[12.5px] text-muted">{t('placeholders')}</p>
        </Card>
      </Section>
    </AdminGate>
  );
}
