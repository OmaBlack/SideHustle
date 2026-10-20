import { getTranslations } from 'next-intl/server';
import { Showcase } from './showcase';

export default async function StyleguidePage() {
  const t = await getTranslations('styleguide');
  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,6vw,42px)] font-extrabold">{t('title')}</h1>
        <p className="max-w-[60ch] text-muted">{t('lead')}</p>
      </header>
      <Showcase />
    </main>
  );
}
