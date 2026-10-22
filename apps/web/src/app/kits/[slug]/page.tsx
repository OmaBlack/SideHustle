import { formatNaira, MarginBadge, ProductArt } from '@sidehustle/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AddKitButton } from '@/components/AddToCart';
import { Banner, Card, Page, Section } from '@/components/Page';
import { serverApi } from '@/lib/server-api';
import type { KitView } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { kit } = await serverApi<{ kit: KitView }>(`/kits/${(await params).slug}`);
  return { title: kit.name };
}

/** FR-KIT-01..05: items with quantities, extras, tip, metrics and availability. */
export default async function KitPage({ params }: Params) {
  const t = await getTranslations('kit');
  const { kit } = await serverApi<{ kit: KitView }>(`/kits/${(await params).slug}`);
  const stat = (label: string, value: string, strong?: boolean) => (
    <div className="flex flex-col">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className={strong ? 'font-display text-2xl font-extrabold tabular-nums' : 'font-bold tabular-nums'}>
        {value}
      </dd>
    </div>
  );
  return (
    <Page title={kit.name} lead={<span>{kit.category.name}</span>}>
      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Section title={t('contents', { units: kit.units, products: kit.productCount })}>
            <ul className="flex flex-col gap-2">
              {kit.items.map((i) => (
                <li
                  key={i.productId}
                  className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"
                >
                  <ProductArt shape={i.artKey} category={kit.category.slug} className="h-12 w-12 flex-none" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${i.slug}`} className="font-semibold text-ink">
                      {i.name}
                    </Link>
                    <p className="text-[12.5px] text-muted">{i.vendor.name}</p>
                  </div>
                  <p className="text-right text-[13px] tabular-nums">
                    <span className="block font-bold">× {i.qty}</span>
                    <span className="text-muted">{t('rrpEach', { rrp: formatNaira(i.rrpKobo) })}</span>
                  </p>
                </li>
              ))}
            </ul>
          </Section>
          {kit.extras.length > 0 && (
            <Section title={t('extras')}>
              <ul className="list-disc pl-5 text-[14px]">
                {kit.extras.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Section>
          )}
          {kit.tip && (
            <Section title={t('tip')}>
              <p className="text-[14px]">{kit.tip}</p>
            </Section>
          )}
        </div>
        <Card className="flex h-fit flex-col gap-4 md:sticky md:top-20">
          <dl className="grid grid-cols-2 gap-3">
            {stat(t('price'), formatNaira(kit.priceKobo), true)}
            {stat(t('resale'), formatNaira(kit.retailKobo))}
            {stat(t('profit'), formatNaira(kit.profitKobo))}
            {stat(t('units'), String(kit.units))}
          </dl>
          <MarginBadge>{t('margin', { pct: kit.marginPct })}</MarginBadge>
          {!kit.available && <Banner tone="warn">{t('outOfStock')}</Banner>}
          <AddKitButton kitId={kit.id} available={kit.available} />
          <p className="text-[12px] text-muted">{t('estimate')}</p>
        </Card>
      </div>
    </Page>
  );
}
