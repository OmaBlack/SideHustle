import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Page } from '@/components/Page';

export async function generateMetadata() {
  return { title: (await getTranslations('notFound'))('title') };
}

/** Wrong or old links land here instead of Next's default page. */
export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <Page title={t('title')} lead={t('lead')} narrow>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-bold text-on-accent no-underline"
        >
          {t('home')}
        </Link>
        <Link
          href="/kits"
          className="inline-flex min-h-11 items-center rounded-full px-5 font-bold text-ink no-underline shadow-[inset_0_0_0_1px_var(--line)]"
        >
          {t('kits')}
        </Link>
      </div>
    </Page>
  );
}
