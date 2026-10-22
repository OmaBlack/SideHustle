import { Monogram } from '@sidehustle/ui';
import { getTranslations } from 'next-intl/server';
import { grid, ProductTile } from '@/components/cards';
import { Card, Page, Section } from '@/components/Page';
import { RequestForm } from '@/components/RequestForm';
import { serverApi } from '@/lib/server-api';
import type { ProductView, VendorDetail } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { vendor } = await serverApi<{ vendor: VendorDetail }>(`/vendors/${(await params).slug}`);
  return { title: vendor.name };
}

/** FR-VEN-02/03/06. */
export default async function VendorPage({ params }: Params) {
  const t = await getTranslations('vendor');
  const { vendor: v, products } = await serverApi<{ vendor: VendorDetail; products: ProductView[] }>(
    `/vendors/${(await params).slug}`,
  );
  const facts: [string, string | number | null][] = [
    [t('since'), v.sinceYear],
    [t('lead'), v.leadTimeText],
    [t('ships'), v.shipsTo],
    [t('rating'), v.rating ? `★ ${v.rating}` : null],
    [t('orders'), v.ordersCount],
    [t('reply'), v.replyTimeText],
  ];
  return (
    <Page
      title={v.name}
      lead={
        <span className="flex flex-wrap items-center gap-2">
          {v.location}
          {v.verified && (
            <span className="rounded-md bg-good-soft px-1.5 py-0.5 text-xs font-bold text-good">
              ✓ {t('verified')}
            </span>
          )}
        </span>
      }
      actions={<Monogram name={v.name} color={v.color} size={56} />}
    >
      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          {v.about && <p>{v.about}</p>}
          {v.about2 && <p className="text-muted">{v.about2}</p>}
          {v.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label={t('tags')}>
              {v.tags.map((tag) => (
                <li key={tag} className="rounded-full bg-sunk px-3 py-1 text-[12.5px] font-semibold">
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Card>
          <dl className="grid grid-cols-2 gap-2 text-[13px]">
            {facts
              .filter(([, val]) => val !== null && val !== '')
              .map(([label, val]) => (
                <div key={label}>
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-semibold">{val}</dd>
                </div>
              ))}
          </dl>
        </Card>
      </div>
      <Section title={t('products', { count: products.length })}>
        <div className={grid}>
          {products.map((p) => (
            <ProductTile key={p.id} p={p} />
          ))}
        </div>
      </Section>
      {v.acceptsCustom && (
        <Section title={t('custom')} id="request">
          {v.customNote && <p className="text-[14px] text-muted">{v.customNote}</p>}
          <Card>
            <RequestForm vendorId={v.id} vendorName={v.name} />
          </Card>
        </Section>
      )}
    </Page>
  );
}
