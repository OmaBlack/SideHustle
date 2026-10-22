'use client';
import {
  BundleSummary,
  Button,
  Chip,
  EmptyState,
  ProductArt,
  Stepper,
  controlClass,
  formatNaira,
  useToast,
} from '@sidehustle/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';
import { useAddToCart } from '@/components/AddToCart';
import { FormError, TextField, useSubmit } from '@/components/forms';
import { Card, Page, Section } from '@/components/Page';
import { api, del, post, put } from '@/lib/api';
import { useMe } from '@/lib/session';
import type { BundleQuote, Category, ProductView } from '@/lib/types';

type Item = { productId: string; qty: number };
const DRAFT = 'sh.builder';

function readDraft(): { name: string; items: Item[]; savedId?: string } {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT) ?? 'null') ?? { name: '', items: [] };
  } catch {
    return { name: '', items: [] };
  }
}

/** FR-BLD-01..07, UC-2: draft without login (sessionStorage), MOQ-first adds, live totals, save/load/delete, add to cart. */
export function Builder() {
  const t = useTranslations('build');
  const id = useId();
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [savedId, setSavedId] = useState<string | undefined>();
  const [cat, setCat] = useState<string | null>(null);
  const [vendor, setVendor] = useState('');
  const [loaded, setLoaded] = useState(false);
  const { add, busy: adding, error: addError } = useAddToCart();
  const save = useSubmit();

  useEffect(() => {
    const d = readDraft();
    setItems(d.items);
    setName(d.name);
    setSavedId(d.savedId);
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(DRAFT, JSON.stringify({ name, items, savedId }));
    } catch {
      /* storage blocked */
    }
  }, [items, name, savedId, loaded]);

  const products = useQuery({
    queryKey: ['products', ''],
    queryFn: () => api<{ products: ProductView[] }>('/products').then((r) => r.products),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: Category[] }>('/categories').then((r) => r.categories),
  });
  const byId = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const vendors = useMemo(
    () =>
      [...new Map((products.data ?? []).map((p) => [p.vendor.slug, p.vendor.name])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [products.data],
  );
  const shown = (products.data ?? []).filter(
    (p) => (!cat || p.category.slug === cat) && (!vendor || p.vendor.slug === vendor),
  );

  const [debounced, setDebounced] = useState<Item[]>([]);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(items), 200);
    return () => clearTimeout(h);
  }, [items]);
  const quote = useQuery({
    queryKey: ['bundleQuote', debounced],
    queryFn: () =>
      post<{ quote: BundleQuote; rules: { scope: string; minKobo: number; pct: number }[] }>(
        '/bundles/quote',
        { items: debounced },
      ),
    placeholderData: (prev) => prev,
  });
  const q = quote.data?.quote;
  const global = quote.data?.rules.find((r) => r.scope === 'global');
  const saved = useQuery({
    queryKey: ['bundles'],
    queryFn: () =>
      api<{
        bundles: {
          id: string;
          name: string;
          items: Item[];
          droppedItems: number;
          quote: BundleQuote | null;
        }[];
      }>('/me/bundles').then((r) => r.bundles),
    enabled: !!me.data,
  });

  const setQty = (productId: string, qty: number) =>
    setItems((xs) => xs.map((x) => (x.productId === productId ? { ...x, qty } : x)));
  const addItem = (p: ProductView) => {
    // FR-BLD-02: the first quantity added is the MOQ.
    setItems((xs) => (xs.some((x) => x.productId === p.id) ? xs : [...xs, { productId: p.id, qty: p.moq }]));
    toast(t('addedItem', { name: p.name }));
  };
  const hint =
    q && global && q.discountKobo === 0 && q.costKobo > 0 && q.costKobo < global.minKobo
      ? t('hint', { amount: formatNaira(global.minKobo - q.costKobo), pct: global.pct })
      : undefined;

  return (
    <Page title={t('title')} lead={t('lead')}>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Section title={t('pick')}>
          <div
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
            role="group"
            aria-label={t('categories')}
          >
            <Chip selected={!cat} onClick={() => setCat(null)}>
              {t('all')}
            </Chip>
            {(categories.data ?? []).map((c) => (
              <Chip
                key={c.slug}
                selected={cat === c.slug}
                onClick={() => setCat(cat === c.slug ? null : c.slug)}
              >
                {c.name}
              </Chip>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-v`} className="text-[13px] font-semibold">
              {t('vendor')}
            </label>
            <select
              id={`${id}-v`}
              className={controlClass}
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            >
              <option value="">{t('allVendors')}</option>
              {vendors.map(([slug, n]) => (
                <option key={slug} value={slug}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <ul className="flex flex-col gap-2">
            {shown.map((p) => {
              const inKit = items.some((x) => x.productId === p.id);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"
                >
                  <ProductArt shape={p.artKey} category={p.category.slug} className="h-12 w-12 flex-none" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-[12.5px] text-muted">
                      {p.vendor.name} · {t('each', { price: formatNaira(p.unitKobo) })} ·{' '}
                      {t('moq', { moq: p.moq })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={inKit ? 'ghost' : 'primary'}
                    disabled={inKit}
                    onClick={() => addItem(p)}
                    aria-label={t('addNamed', { name: p.name })}
                  >
                    {inKit ? t('inKit') : t('add')}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Section>

        <div className="flex h-fit min-w-0 flex-col gap-4 lg:sticky lg:top-20">
          <Section title={t('yourKit', { count: items.length })}>
            {items.length === 0 ? (
              <EmptyState title={t('empty')} body={t('emptyBody')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((it) => {
                  const p = byId.get(it.productId);
                  if (!p) return null;
                  const issue = q?.issues.find(
                    (x) => x.code === 'BELOW_MOQ' && items[x.index]?.productId === it.productId,
                  );
                  return (
                    <li
                      key={it.productId}
                      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[14px] font-semibold">{p.name}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setItems((xs) => xs.filter((x) => x.productId !== it.productId))}
                          aria-label={t('removeNamed', { name: p.name })}
                        >
                          {t('remove')}
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Stepper
                          value={it.qty}
                          min={p.moq}
                          onChange={(v) => setQty(it.productId, v)}
                          labels={{
                            decrease: t('decrease', { name: p.name }),
                            increase: t('increase', { name: p.name }),
                            quantity: t('quantityOf', { name: p.name }),
                          }}
                        />
                        <span className="font-bold tabular-nums">{formatNaira(p.unitKobo * it.qty)}</span>
                      </div>
                      {issue && <p className="text-[12.5px] text-warn">{t('belowMoq', { moq: p.moq })}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
          <BundleSummary
            costKobo={q?.costKobo ?? 0}
            discountKobo={q?.discountKobo ?? 0}
            payKobo={q?.payKobo ?? 0}
            retailKobo={q?.retailKobo ?? 0}
            profitKobo={q?.profitKobo ?? 0}
            marginPct={q?.marginPct ?? 0}
            labels={{
              title: t('summary'),
              cost: t('cost'),
              discount: t('discount'),
              pay: t('pay'),
              resale: t('resale'),
              profit: t('profit'),
              margin: t('margin'),
              hint,
              estimate: t('estimate'),
            }}
          />
          <Card className="flex flex-col gap-3">
            <TextField
              label={t('name')}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              error={save.fields.name}
            />
            <FormError error={save.error} />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                disabled={!items.length || save.busy}
                onClick={async () => {
                  if (!me.data) return router.push(`/login?next=${encodeURIComponent('/build')}`);
                  const body = { name: name || t('defaultName'), items };
                  const r = await save.run(() =>
                    savedId
                      ? put<{ bundle: { id: string } }>(`/me/bundles/${savedId}`, body)
                      : post<{ bundle: { id: string } }>('/me/bundles', body),
                  );
                  if (r) {
                    setSavedId(r.bundle.id);
                    await qc.invalidateQueries({ queryKey: ['bundles'] });
                    toast(t('saved'));
                  }
                }}
              >
                {me.data ? t('save') : t('loginToSave')}
              </Button>
              <Button
                disabled={!items.length || adding || !!q?.issues.length}
                onClick={async () => {
                  if (await add({ kind: 'bundle', name: name || t('defaultName'), items }))
                    router.push('/cart');
                }}
              >
                {t('toCart')}
              </Button>
            </div>
            {addError && (
              <p role="alert" className="text-[13px] text-danger">
                {addError}
              </p>
            )}
          </Card>
          {me.data && (saved.data?.length ?? 0) > 0 && (
            <Section title={t('savedKits')}>
              <ul className="flex flex-col gap-2">
                {saved.data!.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{b.name}</p>
                      <p className="text-[12.5px] text-muted">
                        {t('savedMeta', { count: b.items.length, pay: formatNaira(b.quote?.payKobo ?? 0) })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setItems(b.items.map((i) => ({ productId: i.productId, qty: i.qty })));
                        setName(b.name);
                        setSavedId(b.id);
                      }}
                    >
                      {t('load')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await del(`/me/bundles/${b.id}`);
                        if (savedId === b.id) setSavedId(undefined);
                        await qc.invalidateQueries({ queryKey: ['bundles'] });
                      }}
                      aria-label={t('deleteNamed', { name: b.name })}
                    >
                      {t('delete')}
                    </Button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </Page>
  );
}
