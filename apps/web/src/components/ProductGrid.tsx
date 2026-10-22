'use client';
import { Button, Chip, EmptyState, controlClass } from '@sidehustle/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { api } from '@/lib/api';
import type { Category, ProductView } from '@/lib/types';
import { grid, ProductTile } from './cards';

/** FR-HOME-05, FR-SRCH-01..04: category chips and search that updates as you type, with an empty state. */
export function ProductGrid({ initial, categories }: { initial: ProductView[]; categories: Category[] }) {
  const t = useTranslations('grid');
  const id = useId();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(h);
  }, [q]);
  const params = new URLSearchParams();
  if (debounced) params.set('q', debounced);
  if (cat) params.set('category', cat);
  if (sort) params.set('sort', sort);
  const key = params.toString();
  const res = useQuery({
    queryKey: ['products', key],
    queryFn: () => api<{ products: ProductView[] }>(`/products?${key}`).then((r) => r.products),
    initialData: key ? undefined : initial,
    placeholderData: (prev) => prev,
  });
  const products = res.data ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label htmlFor={`${id}-q`} className="text-[13px] font-semibold">
            {t('search')}
          </label>
          <input
            id={`${id}-q`}
            type="search"
            className={controlClass}
            placeholder={t('placeholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-s`} className="text-[13px] font-semibold">
            {t('sort')}
          </label>
          <select
            id={`${id}-s`}
            className={controlClass}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="">{t('sortDefault')}</option>
            <option value="price">{t('sortPrice')}</option>
            <option value="margin">{t('sortMargin')}</option>
            <option value="moq">{t('sortMoq')}</option>
          </select>
        </div>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={t('categories')}>
        <Chip selected={!cat} onClick={() => setCat(null)}>
          {t('all')}
        </Chip>
        {categories.map((c) => (
          <Chip key={c.slug} selected={cat === c.slug} onClick={() => setCat(cat === c.slug ? null : c.slug)}>
            {t('category', { name: c.name, count: c.productCount })}
          </Chip>
        ))}
      </div>
      <p className="sr-only" role="status">
        {t('results', { count: products.length })}
      </p>
      {products.length === 0 && !res.isFetching ? (
        <EmptyState
          title={debounced ? t('emptyFor', { q: debounced }) : t('empty')}
          action={
            <Button
              variant="ghost"
              onClick={() => {
                setQ('');
                setCat(null);
              }}
            >
              {t('clear')}
            </Button>
          }
        />
      ) : (
        <div className={grid}>
          {products.map((p) => (
            <ProductTile key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
