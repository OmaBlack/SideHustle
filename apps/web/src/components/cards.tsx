import { KitCard, ProductCard, VendorCard } from '@sidehustle/ui';
import { useTranslations } from 'next-intl';
import { unitFor } from '@/lib/units';
import type { KitView, ProductView, VendorListItem } from '@/lib/types';

/** Translated card wrappers shared by server and client pages. */
export function ProductTile({ p }: { p: ProductView }) {
  const t = useTranslations('cards');
  return (
    <ProductCard
      href={`/products/${p.slug}`}
      name={p.name}
      vendorName={p.vendor.name}
      location={p.vendor.location}
      unitKobo={p.unitKobo}
      originalKobo={p.originalKobo}
      discountPct={p.discountPct}
      moqText={t('moq', { moq: p.moq, unit: unitFor(p.unit, p.moq) })}
      marginText={t('margin', { pct: p.marginPct })}
      customisableText={p.customisable ? t('customisable') : undefined}
      shape={p.artKey}
      category={p.category.slug}
      wasLabel={t('was')}
    />
  );
}

export function KitTile({ k }: { k: KitView }) {
  const t = useTranslations('cards');
  return (
    <KitCard
      href={`/kits/${k.slug}`}
      name={k.name}
      category={k.category.slug}
      priceKobo={k.priceKobo}
      retailKobo={k.retailKobo}
      profitKobo={k.profitKobo}
      marginText={t('margin', { pct: k.marginPct })}
      contentsText={t('kitContents', { units: k.units, products: k.productCount })}
      labels={{ price: t('kitPrice'), resale: t('resale'), profit: t('profit') }}
      unavailableText={k.available ? undefined : t('unavailable')}
    />
  );
}

export function VendorTile({ v }: { v: VendorListItem }) {
  const t = useTranslations('cards');
  return (
    <VendorCard
      href={`/vendors/${v.slug}`}
      name={v.name}
      location={v.location}
      color={v.color}
      statsText={t('vendorStats', { products: v.productCount, rating: v.rating ?? '–' })}
      verifiedText={v.verified ? t('verified') : undefined}
      customText={v.acceptsCustom ? t('custom') : undefined}
    />
  );
}

export const grid = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4';
export const wideGrid = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3';
