'use client';
import { Chip, EmptyState, formatNaira } from '@sidehustle/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FulfilmentActions } from '@/components/FulfilmentActions';
import { Card, Page } from '@/components/Page';
import { api } from '@/lib/api';
import type { FulfilmentView, OrderView } from '@/lib/types';
import { useVendor } from '@/lib/vendor';

type VendorOrder = Pick<
  OrderView,
  'ref' | 'paidAt' | 'deliveryMethod' | 'recipient' | 'phone' | 'address'
> & { fulfilments: FulfilmentView[] };
const FILTERS = ['awaiting_confirmation', 'confirmed', 'dispatched', 'delivered', 'rejected'] as const;

/** FR-VP-07: incoming orders, newest first; only this vendor's lines and the delivery details needed to ship. */
export default function VendorOrders() {
  const t = useTranslations('vendorPortal');
  const tf = useTranslations('fulfil');
  const f = useFormatter();
  const { vendor } = useVendor();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>('awaiting_confirmation');
  const orders = useQuery({
    queryKey: ['vendorOrders', status],
    queryFn: () => api<{ orders: VendorOrder[] }>(`/vendor/orders?status=${status}`).then((r) => r.orders),
    enabled: !!vendor,
  });
  return (
    <Page title={t('ordersTitle')} lead={t('ordersLead')}>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label={t('filter')}>
        {FILTERS.map((s) => (
          <Chip key={s} selected={status === s} onClick={() => setStatus(s)}>
            {tf(`status.${s}`)}
          </Chip>
        ))}
      </div>
      {orders.data?.length === 0 && <EmptyState title={t('noOrders')} />}
      <ul className="flex flex-col gap-3">
        {(orders.data ?? []).map((o) =>
          o.fulfilments.map((fl) => (
            <li key={fl.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display text-lg font-extrabold">{o.ref}</p>
                  <span className="rounded-full bg-sunk px-2.5 py-0.5 text-[12.5px] font-bold">
                    {tf(`status.${fl.status}`)}
                  </span>
                </div>
                <p className="text-[12.5px] text-muted">
                  {o.paidAt
                    ? t('paidAt', {
                        when: f.dateTime(new Date(o.paidAt), {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        }),
                      })
                    : ''}
                </p>
                <ul className="text-[14px]">
                  {fl.items.map((i, n) => (
                    <li key={n} className="flex justify-between gap-2">
                      <span>
                        {i.name} × {i.qty}
                        {i.optionText && <span className="block text-[12px] text-muted">{i.optionText}</span>}
                        {i.note && <span className="block text-[12px] italic">“{i.note}”</span>}
                      </span>
                      <span className="tabular-nums">{formatNaira(i.unitKobo * i.qty - i.discountKobo)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[13px]">
                  <span className="font-semibold">{t('shipTo')}</span> {o.recipient} · {o.phone}
                  {o.address
                    ? ` · ${o.address.line1}, ${o.address.city}, ${o.address.state}`
                    : ` · ${t('pickupAtHub')}`}
                </p>
                {fl.trackingRef && <p className="text-[13px]">{t('trackingRef', { ref: fl.trackingRef })}</p>}
                <FulfilmentActions
                  f={fl}
                  base="/vendor"
                  onDone={() => qc.invalidateQueries({ queryKey: ['vendorOrders'] })}
                />
              </Card>
            </li>
          )),
        )}
      </ul>
    </Page>
  );
}
