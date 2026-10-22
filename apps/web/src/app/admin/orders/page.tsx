'use client';
import { Chip, controlClass, formatNaira } from '@sidehustle/ui';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useId, useState } from 'react';
import { AdminGate } from '@/components/AdminGate';
import { TableScroll } from '@/components/Page';
import { useAdminQuery } from '@/lib/admin';
import type { OrderView } from '@/lib/types';

const STATUSES = [
  '',
  'pending_payment',
  'paid',
  'in_fulfilment',
  'delivered',
  'disputed',
  'refunded',
  'cancelled',
  'expired',
];

function Orders() {
  const t = useTranslations('admin');
  const ts = useTranslations('orders');
  const f = useFormatter();
  const id = useId();
  const [status, setStatus] = useState(useSearchParams().get('status') ?? '');
  const [q, setQ] = useState('');
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q.trim()) params.set('q', q.trim());
  const res = useAdminQuery<{ orders: OrderView[] }>(
    ['adminOrders', params.toString()],
    `/admin/orders?${params}`,
  );
  return (
    <AdminGate title={t('ordersTitle')} denied={res.denied} ready={!!res.data || res.isFetching}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-q`} className="text-[13px] font-semibold">
          {t('searchOrders')}
        </label>
        <input
          id={`${id}-q`}
          type="search"
          className={controlClass}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label={t('filter')}>
        {STATUSES.map((s) => (
          <Chip key={s} selected={status === s} onClick={() => setStatus(s)}>
            {s ? ts(`status.${s}`) : t('vendorStatus.all')}
          </Chip>
        ))}
      </div>
      <TableScroll label={t('ordersTitle')}>
        <table className="w-full min-w-[560px] text-left text-[13.5px]">
          <thead className="text-muted">
            <tr>
              <th className="py-2">{t('ref')}</th>
              <th>{t('date')}</th>
              <th>{t('recipient')}</th>
              <th>{t('status')}</th>
              <th className="text-right">{t('total')}</th>
            </tr>
          </thead>
          <tbody>
            {(res.data?.orders ?? []).map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="py-2">
                  <Link href={`/admin/orders/${o.ref}`} className="font-semibold text-accent">
                    {o.ref}
                  </Link>
                </td>
                <td>{f.dateTime(new Date(o.createdAt), { day: 'numeric', month: 'short' })}</td>
                <td>{o.recipient}</td>
                <td>{ts(`status.${o.status}`)}</td>
                <td className="text-right tabular-nums">{formatNaira(o.totalKobo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </AdminGate>
  );
}

export default function AdminOrders() {
  return (
    <Suspense>
      <Orders />
    </Suspense>
  );
}
