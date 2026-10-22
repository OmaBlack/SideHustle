'use client';
import {
  Button,
  Field,
  MarginBadge,
  Price,
  ProfitCalculator,
  Stepper,
  controlClass,
  formatNaira,
} from '@sidehustle/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { post } from '@/lib/api';
import type { ProductDetail } from '@/lib/types';
import { unitFor } from '@/lib/units';
import { useAddToCart } from './AddToCart';
import { Banner } from './Page';

interface Quote {
  unitKobo: number;
  originalUnitKobo: number;
  discountPct: number;
  addOnKobo: number;
  totalKobo: number;
  marginPct: number;
  isCustom: boolean;
}

/** FR-PROD-03..07: options with price impact, note, MOQ stepper, live unit price and profit calculator. */
export function ProductBuyPanel({ p }: { p: ProductDetail }) {
  const t = useTranslations('product');
  const [qty, setQty] = useState(p.moq);
  const [corrected, setCorrected] = useState<number | null>(null);
  const [selection, setSelection] = useState<Record<string, boolean | string>>({});
  const [note, setNote] = useState('');
  const [debouncedNote, setDebouncedNote] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebouncedNote(note), 300);
    return () => clearTimeout(h);
  }, [note]);
  const quote = useQuery({
    queryKey: ['quote', p.id, qty, selection, debouncedNote],
    queryFn: () =>
      post<Quote>(`/products/${p.id}/quote`, { qty, selection, note: debouncedNote || undefined }),
    placeholderData: (prev) => prev,
  });
  const q = quote.data;
  const unit = q?.unitKobo ?? p.unitKobo;
  const { add, busy, error } = useAddToCart();
  const isCustom =
    note.trim().length > 0 || p.options.some((o) => o.type === 'check' && selection[o.id] === true);

  const addButton = (
    <Button
      block
      disabled={busy || !p.inStock}
      onClick={() =>
        add({
          kind: 'product',
          productId: p.id,
          qty,
          selection,
          ...(note.trim() ? { note: note.trim() } : {}),
        })
      }
    >
      {p.inStock ? t('add') : t('outOfStock')}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4 pb-20 md:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Price
          size="lg"
          unitKobo={unit}
          originalKobo={q?.originalUnitKobo ?? p.originalKobo}
          discountPct={q?.discountPct ?? p.discountPct}
          wasLabel={t('was')}
        />
        <span className="text-[13px] text-muted">{t('perUnit', { unit: p.unit })}</span>
        <MarginBadge>{t('margin', { pct: q?.marginPct ?? p.marginPct })}</MarginBadge>
      </div>

      {p.options.length > 0 && (
        <fieldset className="flex flex-col gap-3 rounded-card border border-line p-3">
          <legend className="px-1 text-[13px] font-bold">{t('options')}</legend>
          {p.options.map((o) =>
            o.type === 'check' ? (
              <label key={o.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px]">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--accent)]"
                  checked={selection[o.id] === true}
                  onChange={(e) => setSelection({ ...selection, [o.id]: e.target.checked })}
                />
                <span>
                  {o.label}{' '}
                  <span className="text-muted">{t('addOn', { price: formatNaira(o.add_kobo) })}</span>
                </span>
              </label>
            ) : (
              <Field key={o.id} label={o.label}>
                {(c) => (
                  <select
                    {...c}
                    className={controlClass}
                    value={String(selection[o.id] ?? o.values[0]?.value ?? '')}
                    onChange={(e) => setSelection({ ...selection, [o.id]: e.target.value })}
                  >
                    {o.values.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.value}
                        {v.add_kobo ? ` (${t('addOn', { price: formatNaira(v.add_kobo) })})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ),
          )}
          <Field label={t('note')} hint={p.notePlaceholder ?? undefined}>
            {(c) => (
              <textarea
                {...c}
                rows={2}
                className={controlClass}
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Field>
          {isCustom && (
            <Banner tone="warn">
              {t('customLine', { note: p.vendor.customNote ?? t('customDefault') })}
            </Banner>
          )}
        </fieldset>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold" id="qty-label">
          {t('quantity')}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <Stepper
            value={qty}
            min={p.moq}
            onChange={(v) => {
              setQty(v);
              setCorrected(null);
            }}
            onCorrected={(m) => setCorrected(m)}
            labels={{ decrease: t('decrease'), increase: t('increase'), quantity: t('quantity') }}
          />
          <span className="text-[13px] text-muted">
            {t('minOrder', { moq: p.moq, unit: unitFor(p.unit, p.moq) })}
          </span>
        </div>
        <p role="status" className="text-[13px] text-warn">
          {corrected ? t('moqCorrected', { min: corrected }) : ''}
        </p>
      </div>

      <div className="flex items-baseline justify-between">
        <span className="text-muted">{t('lineTotal')}</span>
        <span className="font-display text-xl font-extrabold tabular-nums">{formatNaira(unit * qty)}</span>
      </div>
      {/* Desktop: the button sits in the flow. Phones: a bar above the tab bar keeps it in reach (one button per breakpoint). */}
      <div className="hidden md:block">{addButton}</div>
      <div className="fixed inset-x-0 bottom-14 z-30 flex items-center gap-3 border-t border-line bg-surface px-4 py-2.5 md:hidden">
        <div className="flex min-w-0 flex-col">
          <span className="text-[12px] text-muted">{t('lineTotal')}</span>
          <span className="font-display text-lg font-extrabold tabular-nums">{formatNaira(unit * qty)}</span>
        </div>
        <div className="ml-auto">{addButton}</div>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      <ProfitCalculator
        key={unit}
        unitCostKobo={unit}
        qty={qty}
        rrpKobo={p.rrpKobo}
        labels={{
          title: t('calc.title'),
          resale: t('calc.resale'),
          cost: t('calc.cost'),
          revenue: t('calc.revenue'),
          profit: t('calc.profit'),
          estimate: t('estimate'),
        }}
      />
    </div>
  );
}
