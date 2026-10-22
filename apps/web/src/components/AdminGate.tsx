'use client';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Page } from './Page';
import { PageLoading } from './PageLoading';

export function AdminGate({
  title,
  denied,
  ready,
  children,
  lead,
  actions,
}: {
  title: string;
  denied: boolean;
  ready: boolean;
  children: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  const t = useTranslations('admin');
  if (denied)
    return (
      <Page title={title}>
        <p role="alert">{t('denied')}</p>
      </Page>
    );
  if (!ready)
    return (
      <Page title={title}>
        <PageLoading text={t('loading')} />
      </Page>
    );
  return (
    <Page title={title} lead={lead} actions={actions}>
      {children}
    </Page>
  );
}
