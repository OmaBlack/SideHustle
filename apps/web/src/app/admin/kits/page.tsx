'use client';
import { Button, formatNaira } from '@sidehustle/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminGate } from '@/components/AdminGate';
import {
  Checkbox,
  FormError,
  NairaField,
  SelectField,
  TextArea,
  TextField,
  useSubmit,
} from '@/components/forms';
import { Card } from '@/components/Page';
import { useAdminQuery } from '@/lib/admin';
import { api, post, put } from '@/lib/api';
import type { Category } from '@/lib/types';

interface AdminKit {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  priceKobo: number;
  tip: string | null;
  status: string;
  platformFunded: boolean;
  sortOrder: number;
  items: { productId: string; qty: number }[];
  extras: string[];
}
type Draft = {
  name: string;
  categoryId: string;
  priceKobo: number;
  tip: string;
  active: boolean;
  platformFunded: boolean;
  sortOrder: number;
  items: { productId: string; qty: number }[];
  extras: string[];
};

/** FR-ADM-05: components, price, extras, tips, availability; plan 8a funding switch. */
export default function AdminKits() {
  const t = useTranslations('admin');
  const qc = useQueryClient();
  const q = useAdminQuery<{ kits: AdminKit[] }>(['adminKits'], '/admin/kits');
  const products = useAdminQuery<{
    products: { id: string; name: string; vendor: string; costKobo: number; rrpKobo: number }[];
  }>(['adminProducts'], '/admin/products');
  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: Category[] }>('/categories').then((r) => r.categories),
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const s = useSubmit();
  const byId = new Map((products.data?.products ?? []).map((p) => [p.id, p]));
  const cost = (items: Draft['items']) =>
    items.reduce((sum, i) => sum + (byId.get(i.productId)?.costKobo ?? 0) * i.qty, 0);
  const start = (k?: AdminKit) => {
    setEditing(k?.id ?? 'new');
    setD(
      k
        ? {
            name: k.name,
            categoryId: k.categoryId,
            priceKobo: k.priceKobo,
            tip: k.tip ?? '',
            active: k.status === 'active',
            platformFunded: k.platformFunded,
            sortOrder: k.sortOrder,
            items: k.items,
            extras: k.extras,
          }
        : {
            name: '',
            categoryId: cats.data?.[0]?.id ?? '',
            priceKobo: 0,
            tip: '',
            active: true,
            platformFunded: false,
            sortOrder: 100,
            items: [],
            extras: [],
          },
    );
  };
  return (
    <AdminGate
      title={t('kitsTitle')}
      denied={q.denied}
      ready={!!q.data}
      actions={<Button onClick={() => start()}>{t('newKit')}</Button>}
    >
      {editing && d && (
        <Card>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await s.run(() =>
                  editing === 'new' ? post('/admin/kits', d) : put(`/admin/kits/${editing}`, d),
                )
              ) {
                setEditing(null);
                await qc.invalidateQueries({ queryKey: ['adminKits'] });
              }
            }}
          >
            <TextField
              label={t('name')}
              value={d.name}
              onChange={(e) => setD({ ...d, name: e.target.value })}
              error={s.fields.name}
            />
            <SelectField
              label={t('scope.category')}
              value={d.categoryId}
              onChange={(e) => setD({ ...d, categoryId: e.target.value })}
            >
              {(cats.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <NairaField
              label={t('kitPrice')}
              hint={t('kitCost', { cost: formatNaira(cost(d.items)) })}
              valueKobo={d.priceKobo}
              onKobo={(k) => setD({ ...d, priceKobo: k })}
              error={s.fields.priceKobo}
            />
            <TextField
              label={t('sort')}
              inputMode="numeric"
              value={String(d.sortOrder)}
              onChange={(e) => setD({ ...d, sortOrder: Number(e.target.value.replace(/\D/g, '') || 0) })}
            />
            <div className="sm:col-span-2">
              <TextArea
                label={t('tip')}
                rows={2}
                value={d.tip}
                onChange={(e) => setD({ ...d, tip: e.target.value })}
              />
            </div>
            <fieldset className="flex flex-col gap-2 sm:col-span-2">
              <legend className="text-[13px] font-semibold">{t('components')}</legend>
              {d.items.map((it, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <SelectField
                    label={t('product')}
                    value={it.productId}
                    onChange={(e) =>
                      setD({
                        ...d,
                        items: d.items.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)),
                      })
                    }
                  >
                    {(products.data?.products ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.vendor})
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label={t('qty')}
                    inputMode="numeric"
                    value={String(it.qty)}
                    onChange={(e) =>
                      setD({
                        ...d,
                        items: d.items.map((x, j) =>
                          j === i ? { ...x, qty: Number(e.target.value.replace(/\D/g, '') || 1) } : x,
                        ),
                      })
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setD({ ...d, items: d.items.filter((_, j) => j !== i) })}
                  >
                    {t('delete')}
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setD({
                    ...d,
                    items: [...d.items, { productId: products.data?.products[0]?.id ?? '', qty: 1 }],
                  })
                }
              >
                {t('addComponent')}
              </Button>
            </fieldset>
            <div className="sm:col-span-2">
              <TextField
                label={t('extras')}
                hint={t('listHint')}
                value={d.extras.join(', ')}
                onChange={(e) =>
                  setD({
                    ...d,
                    extras: e.target.value
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
            <Checkbox label={t('kitActive')} checked={d.active} onChange={(v) => setD({ ...d, active: v })} />
            <Checkbox
              label={t('platformFunded')}
              hint={t('platformFundedHint')}
              checked={d.platformFunded}
              onChange={(v) => setD({ ...d, platformFunded: v })}
            />
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
      <ul className="flex flex-col gap-2">
        {(q.data?.kits ?? []).map((k) => (
          <li
            key={k.id}
            className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-bold">{k.name}</p>
              <p className="text-[12.5px] text-muted">
                {formatNaira(k.priceKobo)} · {t('kitCost', { cost: formatNaira(cost(k.items)) })} · {k.status}{' '}
                {k.platformFunded ? `· ${t('platformFunded')}` : ''}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => start(k)}
              aria-label={t('editNamed', { name: k.name })}
            >
              {t('edit')}
            </Button>
          </li>
        ))}
      </ul>
    </AdminGate>
  );
}
