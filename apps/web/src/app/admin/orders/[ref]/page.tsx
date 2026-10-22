'use client';
import { Button, OrderProgress, formatNaira } from '@sidehustle/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { use, useState } from 'react';
import { AdminGate } from '@/components/AdminGate';
import { FormError, NairaField, SelectField, TextField, useSubmit } from '@/components/forms';
import { FulfilmentActions } from '@/components/FulfilmentActions';
import { Card, Section } from '@/components/Page';
import { useAdminQuery } from '@/lib/admin';
import { post } from '@/lib/api';
import type { OrderView } from '@/lib/types';

interface Detail {
  order: OrderView;
  buyer: { name: string; email: string; phone: string };
  refunds: {
    id: string;
    amountKobo: number;
    reason: string;
    fulfilmentId: string | null;
    createdAt: string;
  }[];
  refundedKobo: number;
  refundableKobo: number;
}

/** FR-ADM-03: view an order, run hub fulfilments, refund in full or in part, resolve disputes. */
export default function AdminOrder({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = use(params);
  const t = useTranslations('admin');
  const to = useTranslations('order');
  const ts = useTranslations('orders');
  const qc = useQueryClient();
  const q = useAdminQuery<Detail>(['adminOrder', ref], `/admin/orders/${ref}`);
  const [amount, setAmount] = useState(0);
  const [fulfilmentId, setFulfilmentId] = useState('');
  const [reason, setReason] = useState('');
  const refund = useSubmit();
  const dispute = useSubmit();
  const refresh = () => qc.invalidateQueries({ queryKey: ['adminOrder', ref] });
  const d = q.data;
  const steps = [
    to('steps.paid'),
    to('steps.confirmed'),
    to('steps.dispatched'),
    to('steps.delivered'),
  ] as const;
  return (
    <AdminGate
      title={ref}
      denied={q.denied}
      ready={!!d}
      lead={d ? `${ts(`status.${d.order.status}`)} · ${formatNaira(d.order.totalKobo)}` : undefined}
    >
      {d && (
        <>
          <Card className="text-[14px]">
            <p className="font-semibold">{d.buyer.name}</p>
            <p className="text-muted">
              {d.buyer.email} · {d.buyer.phone}
            </p>
            <p>
              {to('deliverTo', { name: d.order.recipient, phone: d.order.phone })}
              {d.order.address
                ? ` · ${d.order.address.line1}, ${d.order.address.city}, ${d.order.address.state}`
                : ''}
            </p>
          </Card>
          {d.order.fulfilments.map((f) => (
            <Section key={f.id} title={f.vendor?.name ?? to('hub')}>
              <Card className="flex flex-col gap-2">
                <OrderProgress
                  steps={steps}
                  done={f.stepsDone}
                  label={to('progress', { name: f.vendor?.name ?? to('hub') })}
                  overrideText={
                    f.status === 'rejected' ? to('rejected', { reason: f.rejectReason ?? '' }) : undefined
                  }
                />
                <ul className="text-[13.5px]">
                  {f.items.map((i, n) => (
                    <li key={n}>
                      {i.name} × {i.qty} · {formatNaira(i.unitKobo * i.qty - i.discountKobo)}
                    </li>
                  ))}
                </ul>
                {f.trackingRef && <p className="text-[13px]">{to('tracking', { ref: f.trackingRef })}</p>}
                {['paid', 'in_fulfilment', 'delivered'].includes(d.order.status) && (
                  <FulfilmentActions f={f} base="/admin" onDone={refresh} />
                )}
              </Card>
            </Section>
          ))}
          <Section title={t('refunds')}>
            <Card className="flex flex-col gap-3">
              <p className="text-[14px]">
                {t('refundState', {
                  refunded: formatNaira(d.refundedKobo),
                  left: formatNaira(d.refundableKobo),
                })}
              </p>
              <ul className="text-[13px] text-muted">
                {d.refunds.map((r) => (
                  <li key={r.id}>
                    {formatNaira(r.amountKobo)} · {r.reason}
                  </li>
                ))}
              </ul>
              {d.refundableKobo > 0 && (
                <form
                  className="grid gap-3 sm:grid-cols-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      await refund.run(() =>
                        post(`/admin/orders/${ref}/refunds`, {
                          amountKobo: amount,
                          reason,
                          ...(fulfilmentId ? { fulfilmentId } : {}),
                        }),
                      )
                    ) {
                      setAmount(0);
                      setReason('');
                      await refresh();
                    }
                  }}
                >
                  <NairaField
                    label={t('refundAmount')}
                    valueKobo={amount}
                    onKobo={setAmount}
                    error={refund.fields.amountKobo}
                  />
                  <SelectField
                    label={t('refundFor')}
                    value={fulfilmentId}
                    onChange={(e) => setFulfilmentId(e.target.value)}
                  >
                    <option value="">{t('wholeOrder')}</option>
                    {d.order.fulfilments.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.vendor?.name ?? to('hub')}
                      </option>
                    ))}
                  </SelectField>
                  <div className="sm:col-span-2">
                    <TextField
                      label={t('reason')}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      error={refund.fields.reason}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <FormError error={refund.error} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" variant="danger" disabled={refund.busy || amount < 1}>
                      {t('refund')}
                    </Button>
                    <Button variant="ghost" onClick={() => setAmount(d.refundableKobo)}>
                      {t('refundAll')}
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          </Section>
          {['delivered', 'disputed'].includes(d.order.status) && (
            <Section title={t('dispute')}>
              <Card className="flex flex-col gap-2">
                <TextField
                  label={t('reason')}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  error={dispute.fields.reason}
                />
                <FormError error={dispute.error} />
                <div className="flex flex-wrap gap-2">
                  {(d.order.status === 'delivered'
                    ? (['open'] as const)
                    : (['complete', 'refund'] as const)
                  ).map((o) => (
                    <Button
                      key={o}
                      size="sm"
                      variant={o === 'refund' ? 'danger' : 'ghost'}
                      disabled={dispute.busy}
                      onClick={async () => {
                        if (await dispute.run(() => post(`/admin/orders/${ref}/dispute/${o}`, { reason })))
                          await refresh();
                      }}
                    >
                      {t(`disputeAction.${o}`)}
                    </Button>
                  ))}
                </div>
              </Card>
            </Section>
          )}
        </>
      )}
    </AdminGate>
  );
}
