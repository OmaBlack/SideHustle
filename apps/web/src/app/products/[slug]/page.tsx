import { Monogram, ProductArt } from '@sidehustle/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, Page } from '@/components/Page';
import { ProductBuyPanel } from '@/components/ProductBuyPanel';
import { serverApi } from '@/lib/server-api';
import type { ProductDetail } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { product } = await serverApi<{ product: ProductDetail }>(`/products/${(await params).slug}`);
  return { title: product.name };
}

export default async function ProductPage({ params }: Params) {
  const t = await getTranslations('product');
  const { product: p } = await serverApi<{ product: ProductDetail }>(`/products/${(await params).slug}`);
  const v = p.vendor;
  return (
    <Page title={p.name} lead={p.category.name}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ProductArt
            shape={p.artKey}
            category={p.category.slug}
            label={p.name}
            className="aspect-square w-full max-w-[420px]"
          />
          {/* FR-PROD-03: vendor trust information. */}
          <Card className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Monogram name={v.name} color={v.color} />
              <div>
                <Link href={`/vendors/${v.slug}`} className="font-bold text-ink">
                  {v.name}
                </Link>
                <p className="text-[12.5px] text-muted">{v.location}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-[13px]">
              <div>
                <dt className="text-muted">{t('status')}</dt>
                <dd className="font-semibold">{v.verified ? `✓ ${t('verified')}` : t('pending')}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('rating')}</dt>
                <dd className="font-semibold">{v.rating ? `★ ${v.rating}` : '–'}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('reply')}</dt>
                <dd className="font-semibold">{v.replyTimeText ?? '–'}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('dispatch')}</dt>
                <dd className="font-semibold">{p.leadTimeText ?? v.leadTimeText ?? '–'}</dd>
              </div>
            </dl>
            {p.note && <p className="text-[13px]">{p.note}</p>}
          </Card>
        </div>
        <ProductBuyPanel p={p} />
      </div>
    </Page>
  );
}
