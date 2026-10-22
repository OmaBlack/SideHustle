import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Page } from '@/components/Page';

export async function generateMetadata() {
  return { title: (await getTranslations('deleted'))('title') };
}

/** Shown after an account is erased (NDPA s.36), so the person knows it worked and what was kept. */
export default async function DeletedPage() {
  const t = await getTranslations('deleted');
  return (
    <Page title={t('title')} lead={t('lead')} narrow>
      <p className="text-[14px]">{t('kept')}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-bold text-on-accent no-underline"
        >
          {t('home')}
        </Link>
        <Link
          href="/signup"
          className="inline-flex min-h-11 items-center rounded-full px-5 font-bold text-ink no-underline shadow-[inset_0_0_0_1px_var(--line)]"
        >
          {t('signup')}
        </Link>
      </div>
    </Page>
  );
}
