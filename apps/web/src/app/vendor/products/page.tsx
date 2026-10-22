'use client';
import { Button, MarginBadge, Price, formatNaira, useToast } from '@sidehustle/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  Checkbox,
  FormError,
  NairaField,
  SelectField,
  TextArea,
  TextField,
  useSubmit,
} from '@/components/forms';
import { Banner, Card, Page, Section } from '@/components/Page';
import { api, del, post, put } from '@/lib/api';
import type { Category, StoredOption } from '@/lib/types';
import { useVendor } from '@/lib/vendor';
import { PageLoading } from '@/components/PageLoading';

interface VendorProduct {
  id: string;
  slug: string;
  name: string;
  unit: string;
  status: 'draft' | 'active' | 'archived';
  category: { id: string; name: string };
  costKobo: number;
  rrpKobo: number;
  moq: number;
  stockQty: number | null;
  unitKobo: number;
  originalKobo: number;
  discountPct: number;
  marginPct: number;
  leadTimeText: string | null;
  note: string | null;
  options: StoredOption[];
  fulfilmentMode: 'drop_ship' | 'hub';
}
type Draft = {
  name: string;
  categoryId: string;
  unit: string;
  costKobo: number;
  rrpKobo: number;
  moq: number;
  leadTimeText: string;
  note: string;
  stockQty: number | null;
  options: StoredOption[];
  active: boolean;
};
const EMPTY: Draft = {
  name: '',
  categoryId: '',
  unit: '',
  costKobo: 0,
  rrpKobo: 0,
  moq: 1,
  leadTimeText: '',
  note: '',
  stockQty: null,
  options: [],
  active: true,
};

/** FR-VP-02: create, edit, deactivate and price products, with options and stock. */
export default function VendorProducts() {
  const t = useTranslations('vendorPortal');
  const { vendor } = useVendor();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({
    queryKey: ['vendorProducts'],
    queryFn: () => api<{ products: VendorProduct[] }>('/vendor/products').then((r) => r.products),
    enabled: !!vendor,
  });
  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: Category[] }>('/categories').then((r) => r.categories),
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [d, setD] = useState<Draft>(EMPTY);
  const [held, setHeld] = useState<string | null>(null);
  const s = useSubmit();
  if (!vendor)
    return (
      <Page title={t('productsTitle')}>
        <PageLoading text={t('loading')} />
      </Page>
    );

  const start = (p?: VendorProduct) => {
    setHeld(null);
    setEditing(p?.id ?? 'new');
    setD(
      p
        ? {
            name: p.name,
            categoryId: p.category.id,
            unit: p.unit,
            costKobo: p.costKobo,
            rrpKobo: p.rrpKobo,
            moq: p.moq,
            leadTimeText: p.leadTimeText ?? '',
            note: p.note ?? '',
            stockQty: p.stockQty,
            options: p.options,
            active: p.status !== 'archived',
          }
        : { ...EMPTY, categoryId: vendor.vendor.categoryId },
    );
  };
  const setOpt = (i: number, o: StoredOption) =>
    setD({ ...d, options: d.options.map((x, j) => (j === i ? o : x)) });

  return (
    <Page title={t('productsTitle')} actions={<Button onClick={() => start()}>{t('newProduct')}</Button>}>
      {editing && (
        <Card>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await s.run(() =>
                editing === 'new'
                  ? post<{ heldFor: string | null }>('/vendor/products', d)
                  : put<{ heldFor: string | null }>(`/vendor/products/${editing}`, d),
              );
              if (r) {
                setHeld(r.heldFor);
                if (!r.heldFor) setEditing(null);
                await qc.invalidateQueries({ queryKey: ['vendorProducts'] });
                toast(t('productSaved'));
              }
            }}
          >
            <TextField
              label={t('productName')}
              value={d.name}
              onChange={(e) => setD({ ...d, name: e.target.value })}
              error={s.fields.name}
              required
            />
            <SelectField
              label={t('category')}
              value={d.categoryId}
              onChange={(e) => setD({ ...d, categoryId: e.target.value })}
              error={s.fields.categoryId}
            >
              {(cats.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <TextField
              label={t('unit')}
              hint={t('unitHint')}
              value={d.unit}
              onChange={(e) => setD({ ...d, unit: e.target.value })}
              error={s.fields.unit}
              required
            />
            <TextField
              label={t('moq')}
              inputMode="numeric"
              value={String(d.moq)}
              onChange={(e) => setD({ ...d, moq: Number(e.target.value.replace(/\D/g, '') || 1) })}
              error={s.fields.moq}
            />
            <NairaField
              label={t('wholesale')}
              valueKobo={d.costKobo}
              onKobo={(k) => setD({ ...d, costKobo: k })}
              error={s.fields.costKobo}
            />
            <NairaField
              label={t('rrp')}
              hint={t('rrpHint')}
              valueKobo={d.rrpKobo}
              onKobo={(k) => setD({ ...d, rrpKobo: k })}
              error={s.fields.rrpKobo}
            />
            <TextField
              label={t('leadTime')}
              value={d.leadTimeText}
              onChange={(e) => setD({ ...d, leadTimeText: e.target.value })}
            />
            <TextField
              label={t('stock')}
              hint={t('stockHint')}
              inputMode="numeric"
              value={d.stockQty === null ? '' : String(d.stockQty)}
              onChange={(e) =>
                setD({
                  ...d,
                  stockQty: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')),
                })
              }
              error={s.fields.stockQty}
            />
            <div className="sm:col-span-2">
              <TextArea
                label={t('notes')}
                rows={2}
                value={d.note}
                onChange={(e) => setD({ ...d, note: e.target.value })}
              />
            </div>
            <fieldset className="flex flex-col gap-2 sm:col-span-2">
              <legend className="text-[13px] font-semibold">{t('options')}</legend>
              {d.options.map((o, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2 rounded-field border border-line p-2">
                  <TextField
                    label={t('optionLabel')}
                    value={o.label}
                    onChange={(e) =>
                      setOpt(i, {
                        ...o,
                        label: e.target.value,
                        id:
                          o.id ||
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .slice(0, 30),
                      })
                    }
                  />
                  {o.type === 'check' ? (
                    <NairaField
                      label={t('addOnPrice')}
                      valueKobo={o.add_kobo}
                      onKobo={(k) => setOpt(i, { ...o, add_kobo: k })}
                    />
                  ) : (
                    <TextField
                      label={t('choices')}
                      hint={t('choicesHint')}
                      value={o.values
                        .map((v) => (v.add_kobo ? `${v.value}:${v.add_kobo / 100}` : v.value))
                        .join(', ')}
                      onChange={(e) =>
                        setOpt(i, {
                          ...o,
                          values: e.target.value
                            .split(',')
                            .map((x) => x.trim())
                            .filter(Boolean)
                            .map((x) => {
                              const [value, add] = x.split(':');
                              return {
                                value: value!.trim(),
                                add_kobo: Math.round(Number(add ?? 0) * 100) || 0,
                              };
                            }),
                        })
                      }
                    />
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setD({ ...d, options: d.options.filter((_, j) => j !== i) })}
                  >
                    {t('remove')}
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setD({ ...d, options: [...d.options, { type: 'check', id: '', label: '', add_kobo: 0 }] })
                  }
                >
                  {t('addTick')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setD({ ...d, options: [...d.options, { type: 'select', id: '', label: '', values: [] }] })
                  }
                >
                  {t('addList')}
                </Button>
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <Checkbox checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={t('active')} />
            </div>
            {held && (
              <div className="sm:col-span-2">
                <Banner tone="warn">{t('held', { licence: held })}</Banner>
              </div>
            )}
            <div className="sm:col-span-2">
              <FormError error={s.error} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={s.busy}>
                {t('save')}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                {t('cancel')}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <Section title={t('yourProducts', { count: list.data?.length ?? 0 })}>
        <ul className="flex flex-col gap-2">
          {(list.data ?? []).map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold">{p.name}</p>
                <p className="text-[12.5px] text-muted">
                  {p.category.name} · {t('moqShort', { moq: p.moq })} ·{' '}
                  {p.stockQty === null ? t('stockUntracked') : t('stockLeft', { n: p.stockQty })} ·{' '}
                  {t(`mode.${p.fulfilmentMode}`)}
                </p>
              </div>
              <Price
                unitKobo={p.unitKobo}
                originalKobo={p.originalKobo}
                discountPct={p.discountPct}
                wasLabel={t('was')}
              />
              <MarginBadge>{t('margin', { pct: p.marginPct })}</MarginBadge>
              <span className="rounded-full bg-sunk px-2.5 py-0.5 text-[12.5px] font-bold">
                {t(`productStatus.${p.status}`)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => start(p)}
                aria-label={t('editNamed', { name: p.name })}
              >
                {t('edit')}
              </Button>
              {p.status !== 'archived' && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('deactivateNamed', { name: p.name })}
                  onClick={async () => {
                    await del(`/vendor/products/${p.id}`);
                    await qc.invalidateQueries({ queryKey: ['vendorProducts'] });
                  }}
                >
                  {t('deactivate')}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <p className="text-[12.5px] text-muted">{t('rrpNote', { example: formatNaira(400_000) })}</p>
      </Section>
    </Page>
  );
}
