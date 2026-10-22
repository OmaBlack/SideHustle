'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMe } from '@/lib/session';

/** FR-HOME-04: visitors go to sign-up, signed-in buyers to the kits. */
export function StartButton() {
  const t = useTranslations('home');
  const me = useMe();
  return (
    <Link
      href={me.data ? '/kits' : '/signup'}
      className="inline-flex min-h-11 items-center rounded-full bg-gold px-5 font-bold text-on-gold no-underline"
    >
      {t('start')}
    </Link>
  );
}
