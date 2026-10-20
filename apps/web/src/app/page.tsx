import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function Home() {
  const t = await getTranslations('home');
  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-4 px-4 py-10">
      <h1 className="text-[clamp(28px,6vw,42px)] font-extrabold">{t('title')}</h1>
      <p className="max-w-[60ch] text-muted">{t('lead')}</p>
      <Link href="/styleguide" className="font-semibold text-accent">
        {t('styleguide')}
      </Link>
    </main>
  );
}
