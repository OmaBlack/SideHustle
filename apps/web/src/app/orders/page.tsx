'use client';
import { EmptyState, formatNaira } from '@sidehustle/ui';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { Page } from '@/components/Page';
import { api } from '@/lib/api';
import { useRequireLogin } from '@/lib/session';
import type { OrderView } from '@/lib/types';

/** FR-ORD-01: reference, date, item count, delivery method, total, status and items. */
export default function OrdersPage() {
  const t = useTranslations('orders');
  const f = useFormatter();
  const me = useRequireLogin();
  const orders = useQuery({
    queryKey: ['orders'],
    queryFn: () => api<{ orders: OrderView[] }>('/orders').then((r) => r.orders),
    enabled: !!me.data,
  });
  return (
    <Page title={t('title')}>
      {!orders.data ? (
        <p role="status">{t('loading')}</p>
      ) : orders.data.length === 0 ? (
        <EmptyState
          title={t('empty')}
          action={
            <Link href="/kits" className="font-semibold text-accent">
              {t('browse')}
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.data.map((o) => (
            <li
              key={o.id}
              className="relative flex flex-col gap-1 rounded-card border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/orders/${o.ref}`}
                  className="font-display text-lg font-extrabold text-ink after:absolute after:inset-0"
                >
                  {o.ref}
                </Link>
                <span className="rounded-full bg-sunk px-2.5 py-0.5 text-[12.5px] font-bold">
                  {t(`status.${o.status}`)}
                </span>
              </div>
              <p className="text-[13px] text-muted">
                {f.dateTime(new Date(o.createdAt), { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
                {t('items', { count: o.itemCount })} ·{' '}
                {t.has(`delivery.${o.deliveryMethod}`) ? t(`delivery.${o.deliveryMethod}`) : o.deliveryMethod}{' '}
                · <span className="font-semibold text-ink">{formatNaira(o.totalKobo)}</span>
              </p>
              <p className="text-[13px]">
                {o.lines.map((l) => `${l.name}${l.kind === 'product' ? ` × ${l.qty}` : ''}`).join(', ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
