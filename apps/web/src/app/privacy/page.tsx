import { getTranslations } from 'next-intl/server';
import { Page } from '@/components/Page';

export async function generateMetadata() {
  return { title: (await getTranslations('privacy'))('title') };
}

/** NFR-PRV-01: privacy notice placeholder until legal review supplies the final text. */
export default async function PrivacyPage() {
  const t = await getTranslations('privacy');
  return (
    <Page title={t('title')} narrow>
      {(['collect', 'use', 'share', 'keep', 'rights'] as const).map((k) => (
        <section key={k} className="flex flex-col gap-1">
          <h2 className="text-lg font-extrabold">{t(`${k}.title`)}</h2>
          <p className="text-[14px]">{t(`${k}.body`)}</p>
        </section>
      ))}
      <p className="text-[12.5px] text-muted">{t('draft')}</p>
    </Page>
  );
}
