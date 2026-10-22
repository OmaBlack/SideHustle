'use client';
import { Button, OrderProgress, formatNaira } from '@sidehustle/ui';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { use } from 'react';
import { FormError, useSubmit } from '@/components/forms';
import { Banner, Card, Page, Section } from '@/components/Page';
import { api, post } from '@/lib/api';
import { useRequireLogin } from '@/lib/session';
import type { OrderView } from '@/lib/types';

const FINAL = ['delivered', 'completed', 'refunded', 'cancelled', 'expired'];

/** FR-CHK-08, FR-ORD-02..04: confirmation, per-fulfilment four-step progress and tracking; polls until settled. */
export default function OrderPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = use(params);
  const t = useTranslations('order');
  const ts = useTranslations('orders');
  const f = useFormatter();
  const me = useRequireLogin();
  const justPaid = useSearchParams().get('paid') === '1';
  const order = useQuery({
    queryKey: ['order', ref],
    queryFn: () => api<{ order: OrderView }>(`/orders/${ref}`).then((r) => r.order),
    enabled: !!me.data,
    refetchInterval: (q) => (q.state.data && FINAL.includes(q.state.data.status) ? false : 10_000),
  });
  const retry = useSubmit();
  const o = order.data;
  if (!o)
    return (
      <Page title={ref}>
        <p role="status">{t('loading')}</p>
      </Page>
    );
  const steps = [t('steps.paid'), t('steps.confirmed'), t('steps.dispatched'), t('steps.delivered')] as const;
  return (
    <Page
      title={t('title', { ref: o.ref })}
      lead={
        <span>
          {ts(`status.${o.status}`)} ·{' '}
          {f.dateTime(new Date(o.createdAt), { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      }
    >
      {o.status === 'pending_payment' && (
        <Banner tone="warn">
          <span className="flex flex-wrap items-center justify-between gap-2">
            {justPaid
              ? t('confirming')
              : t('awaitingPayment', {
                  time: f.dateTime(new Date(o.expiresAt), { hour: 'numeric', minute: '2-digit' }),
                })}
            {!justPaid && (
              <Button
                size="sm"
                onClick={async () => {
                  const r = await retry.run(() =>
                    post<{ payment: { authorizationUrl: string } | null }>(`/orders/${o.ref}/pay`),
                  );
                  if (r?.payment) window.location.assign(r.payment.authorizationUrl);
                }}
              >
                {t('payNow')}
              </Button>
            )}
          </span>
        </Banner>
      )}
      <FormError error={retry.error} />
      {o.status !== 'pending_payment' && o.payment?.status === 'success' && justPaid && (
        <Banner tone="good">{t('paid', { ref: o.ref, total: formatNaira(o.totalKobo) })}</Banner>
      )}
      {o.status === 'expired' && <Banner tone="danger">{t('expired')}</Banner>}
      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          {o.fulfilments.map((fl) => (
            <Section key={fl.id} title={fl.vendor?.name ?? t('hub')}>
              <Card className="flex flex-col gap-3">
                {['paid', 'in_fulfilment', 'delivered', 'completed', 'disputed'].includes(o.status) ||
                fl.status === 'rejected' ? (
                  <OrderProgress
                    steps={steps}
                    done={fl.stepsDone}
                    label={t('progress', { name: fl.vendor?.name ?? t('hub') })}
                    overrideText={
                      fl.status === 'rejected' ? t('rejected', { reason: fl.rejectReason ?? '' }) : undefined
                    }
                  />
                ) : null}
                {fl.trackingRef && <p className="text-[13px]">{t('tracking', { ref: fl.trackingRef })}</p>}
                <ul className="text-[13.5px]">
                  {fl.items.map((i, n) => (
                    <li
                      key={n}
                      className="flex justify-between gap-2 border-t border-line py-1.5 first:border-0"
                    >
                      <span>
                        {i.name} × {i.qty}
                        {i.optionText && <span className="block text-[12px] text-muted">{i.optionText}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>
          ))}
        </div>
        <Card className="flex h-fit flex-col gap-2">
          <h2 className="text-lg font-extrabold">{t('summary')}</h2>
          <ul className="text-[13.5px]">
            {o.lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-2 py-1">
                <span>
                  {l.name}
                  {l.kind === 'product' ? ` × ${l.qty}` : ''}
                </span>
                <span className="tabular-nums">{formatNaira(l.totalKobo)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-line pt-2">
            <span>{t('subtotal')}</span>
            <span className="tabular-nums">{formatNaira(o.subtotalKobo)}</span>
          </div>
          {o.discountKobo > 0 && (
            <div className="flex justify-between">
              <span>{t('discount')}</span>
              <span className="tabular-nums">−{formatNaira(o.discountKobo)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>{t('delivery')}</span>
            <span className="tabular-nums">{formatNaira(o.deliveryFeeKobo)}</span>
          </div>
          <div className="flex justify-between font-extrabold">
            <span>{t('total')}</span>
            <span className="tabular-nums">{formatNaira(o.totalKobo)}</span>
          </div>
          <p className="text-[12.5px] text-muted">
            {ts.has(`delivery.${o.deliveryMethod}`) ? ts(`delivery.${o.deliveryMethod}`) : o.deliveryMethod} ·{' '}
            {o.recipient}
          </p>
        </Card>
      </div>
    </Page>
  );
}
