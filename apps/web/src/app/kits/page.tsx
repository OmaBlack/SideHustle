import { getTranslations } from 'next-intl/server';
import { KitTile, wideGrid } from '@/components/cards';
import { Page } from '@/components/Page';
import { serverApi } from '@/lib/server-api';
import type { KitView } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return { title: (await getTranslations('kits'))('title') };
}

export default async function KitsPage() {
  const t = await getTranslations('kits');
  const { kits } = await serverApi<{ kits: KitView[] }>('/kits');
  return (
    <Page title={t('title')} lead={t('lead')}>
      <div className={wideGrid}>
        {kits.map((k) => (
          <KitTile key={k.id} k={k} />
        ))}
      </div>
      <p className="text-[12.5px] text-muted">{t('estimate')}</p>
    </Page>
  );
}
