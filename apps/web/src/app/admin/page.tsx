'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { AdminGate } from '@/components/AdminGate';
import { Card } from '@/components/Page';
import { useAdminQuery } from '@/lib/admin';

type Overview = {
  pendingVendors: number;
  pendingDeals: number;
  openOrders: number;
  disputed: number;
  lowStock: number;
};

export default function AdminHome() {
  const t = useTranslations('admin');
  const q = useAdminQuery<Overview>(['adminOverview'], '/admin/overview');
  const tiles: [keyof Overview, string][] = [
    ['pendingVendors', '/admin/vendors'],
    ['pendingDeals', '/admin/moderation'],
    ['openOrders', '/admin/orders'],
    ['disputed', '/admin/orders?status=disputed'],
    ['lowStock', '/admin/hub'],
  ];
  return (
    <AdminGate title={t('title')} denied={q.denied} ready={!!q.data}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map(([k, href]) => (
          <Card key={k} className="relative flex flex-col gap-1">
            <p className="font-display text-3xl font-extrabold tabular-nums">{q.data?.[k]}</p>
            <Link href={href} className="font-semibold text-ink after:absolute after:inset-0">
              {t(`tiles.${k}`)}
            </Link>
          </Card>
        ))}
      </div>
    </AdminGate>
  );
}
