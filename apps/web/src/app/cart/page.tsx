'use client';
import { Button, EmptyState, Price, ProductArt, Stepper, formatNaira } from '@sidehustle/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Banner, Card, Page } from '@/components/Page';
import { ApiError, del, patch, post } from '@/lib/api';
import { useCart, useRequireLogin } from '@/lib/session';
import type { CartView } from '@/lib/types';
import { PageLoading } from '@/components/PageLoading';

function without<T>(o: Record<string, T>, key: string): Record<string, T> {
  const next = { ...o };
  delete next[key];
  return next;
}

/** FR-CART-01..05. */
export default function CartPage() {
  const t = useTranslations('cart');
  const me = useRequireLogin();
  const cart = useCart(!!me.data);
  const qc = useQueryClient();
  const set = (c: CartView) => qc.setQueryData(['cart'], c);
  // Plan section 9: quantities change on screen at once; taps within 400 ms send one request; the server's totals win.
  const [pending, setPending] = useState<Record<string, number>>({});
  const [lineError, setLineError] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  const changeQty = (id: string, qty: number) => {
    setPending((p) => ({ ...p, [id]: qty }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      try {
        set((await patch<{ cart: CartView }>(`/cart/lines/${id}`, { qty })).cart);
        setLineError((x) => without(x, id));
      } catch (e) {
        setLineError((x) => ({ ...x, [id]: e instanceof ApiError ? e.title : String(e) }));
        await qc.invalidateQueries({ queryKey: ['cart'] });
      } finally {
        setPending((p) => (p[id] === qty ? without(p, id) : p));
      }
    }, 400);
  };
  const updating = Object.keys(pending).length > 0;
  const c = cart.data;
  if (!me.data || !c)
    return (
      <Page title={t('title')}>
        <PageLoading text={t('loading')} />
      </Page>
    );
  return (
    <Page title={t('title')}>
      {c.hasChanges && (
        <Banner tone="warn">
          <span className="flex flex-wrap items-center justify-between gap-2">
            {t('changed')}
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => set((await post<{ cart: CartView }>('/cart/ack')).cart)}
            >
              {t('gotIt')}
            </Button>
          </span>
        </Banner>
      )}
      {c.lines.length === 0 ? (
        <EmptyState
          title={t('empty')}
          body={t('emptyBody')}
          action={
            <Link href="/kits" className="font-semibold text-accent">
              {t('browse')}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          <ul className="flex flex-col gap-3">
            {c.lines.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
                <div className="flex items-start gap-3">
                  {l.kind === 'product' && (
                    <ProductArt shape={l.artKey} category={l.category} className="h-14 w-14 flex-none" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {l.slug ? (
                        <Link
                          href={l.kind === 'kit' ? `/kits/${l.slug}` : `/products/${l.slug}`}
                          className="text-ink"
                        >
                          {l.name}
                        </Link>
                      ) : (
                        l.name
                      )}
                    </p>
                    <p className="text-[12.5px] text-muted">
                      {l.kind === 'product' && `${l.vendor?.name} · ${t('min', { moq: l.moq ?? 1 })}`}
                      {l.kind === 'kit' &&
                        t('kitMeta', { units: l.units ?? 0, products: l.productCount ?? 0 })}
                      {l.kind === 'bundle' &&
                        t('bundleMeta', { items: l.itemCount ?? 0, vendors: l.vendorCount ?? 0 })}
                    </p>
                    {l.optionText && <p className="text-[12.5px]">{l.optionText}</p>}
                    {l.note && <p className="text-[12.5px] italic">“{l.note}”</p>}
                    {l.isCustom && (
                      <p className="text-[12.5px] text-warn">{t('custom', { note: l.customNote ?? '' })}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('removeNamed', { name: l.name })}
                    onClick={async () => set((await del<{ cart: CartView }>(`/cart/lines/${l.id}`)).cart)}
                  >
                    {t('remove')}
                  </Button>
                </div>
                {l.changes.price && (
                  <p className="text-[12.5px] font-semibold text-warn">
                    {t('priceChanged', {
                      from: formatNaira(l.changes.price.fromKobo),
                      to: formatNaira(l.changes.price.toKobo),
                    })}
                  </p>
                )}
                {l.issues.map((i) => (
                  <p key={i.code} role="alert" className="text-[12.5px] font-semibold text-danger">
                    {t(`issues.${i.code}`, { min: i.minQty ?? 0 })}
                  </p>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {l.kind === 'product' ? (
                    <Stepper
                      value={pending[l.id] ?? l.qty}
                      min={l.moq ?? 1}
                      onChange={(v) => changeQty(l.id, v)}
                      labels={{
                        decrease: t('decrease', { name: l.name }),
                        increase: t('increase', { name: l.name }),
                        quantity: t('quantityOf', { name: l.name }),
                      }}
                    />
                  ) : (
                    <span className="text-[13px] text-muted">{t('qtyOne')}</span>
                  )}
                  <div className="text-right">
                    <Price
                      unitKobo={l.unitKobo}
                      originalKobo={l.originalUnitKobo}
                      discountPct={l.discountPct}
                      wasLabel={t('was')}
                    />
                    <span className="block text-[12.5px] text-muted">{t('each')}</span>
                  </div>
                </div>
                <div className="flex justify-between border-t border-line pt-2 text-[14px]">
                  <span>{t('lineTotal')}</span>
                  <span className="font-bold tabular-nums">
                    {formatNaira(pending[l.id] !== undefined ? l.unitKobo * pending[l.id]! : l.lineTotalKobo)}
                  </span>
                </div>
                {lineError[l.id] && (
                  <p role="alert" className="text-[12.5px] font-semibold text-danger">
                    {lineError[l.id]}
                  </p>
                )}
                {l.discountKobo > 0 && (
                  <div className="flex justify-between text-[13px] text-good">
                    <span>{t('bundleDiscount')}</span>
                    <span className="tabular-nums">−{formatNaira(l.discountKobo)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Card className={`flex h-fit flex-col gap-2 md:sticky md:top-20 ${updating ? 'opacity-60' : ''}`}>
            <p aria-live="polite" className="text-[12.5px] text-muted empty:hidden">
              {updating ? t('updating') : ''}
            </p>
            <div className="flex justify-between">
              <span>{t('subtotal')}</span>
              <span className="tabular-nums">{formatNaira(c.subtotalKobo)}</span>
            </div>
            {c.bundleDiscountKobo > 0 && (
              <div className="flex justify-between text-good">
                <span>{t('bundleDiscount')}</span>
                <span className="tabular-nums">−{formatNaira(c.bundleDiscountKobo)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-extrabold">
              <span>{t('total')}</span>
              <span className="tabular-nums">{formatNaira(c.totalKobo)}</span>
            </div>
            <p className="text-[12.5px] text-muted">{t('deliveryLater')}</p>
            {updating ? (
              <span className="inline-flex min-h-11 items-center justify-center rounded-full bg-sunk px-5 font-bold text-muted">
                {t('checkout')}
              </span>
            ) : c.canCheckout ? (
              <Link
                href="/checkout"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 font-bold text-on-accent no-underline"
              >
                {t('checkout')}
              </Link>
            ) : (
              <p className="text-[13px] font-semibold text-danger">{t('fixFirst')}</p>
            )}
          </Card>
        </div>
      )}
    </Page>
  );
}
