import { getTranslations } from 'next-intl/server';
import { VendorTile, wideGrid } from '@/components/cards';
import { Page } from '@/components/Page';
import { serverApi } from '@/lib/server-api';
import type { VendorListItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return { title: (await getTranslations('vendors'))('title') };
}

export default async function VendorsPage() {
  const t = await getTranslations('vendors');
  const { vendors } = await serverApi<{ vendors: VendorListItem[] }>('/vendors');
  return (
    <Page title={t('title')} lead={t('lead')}>
      <div className={wideGrid}>
        {vendors.map((v) => (
          <VendorTile key={v.id} v={v} />
        ))}
      </div>
    </Page>
  );
}
