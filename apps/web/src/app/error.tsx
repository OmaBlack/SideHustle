'use client';
import { Button } from '@sidehustle/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect } from 'react';
import { Page } from '@/components/Page';

/** Shown when a page fails to load (for example the API is down), with a way to retry (NFR-REL-04). */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errorPage');
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Page title={t('title')} lead={t('lead')} narrow>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => reset()}>{t('retry')}</Button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-full px-5 font-bold text-ink no-underline shadow-[inset_0_0_0_1px_var(--line)]"
        >
          {t('home')}
        </Link>
      </div>
      {error.digest && <p className="text-[12px] text-muted">{t('reference', { digest: error.digest })}</p>}
    </Page>
  );
}
