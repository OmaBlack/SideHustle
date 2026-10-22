import { getTranslations } from 'next-intl/server';
import { Page } from '@/components/Page';

export async function generateMetadata() {
  return { title: (await getTranslations('privacy'))('title') };
}

/** NFR-PRV-01, NDPA s.27: privacy notice. Bracketed items are filled in before launch (docs/ndpa-compliance.md). */
export default async function PrivacyPage() {
  const t = await getTranslations('privacy');
  return (
    <Page title={t('title')} lead={t('updated')} narrow>
      {(
        ['who', 'collect', 'use', 'share', 'transfer', 'keep', 'rights', 'security', 'children'] as const
      ).map((k) => (
        <section key={k} className="flex flex-col gap-1">
          <h2 className="text-lg font-extrabold">{t(`${k}.title`)}</h2>
          <p className="text-[14px]">{t(`${k}.body`)}</p>
        </section>
      ))}
      <p className="text-[12.5px] text-muted">{t('draft')}</p>
    </Page>
  );
}
