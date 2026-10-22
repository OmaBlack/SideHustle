'use client';
import { Button, EmptyState, formatNaira } from '@sidehustle/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError, NairaField, TextArea, useSubmit } from '@/components/forms';
import { Card, Page } from '@/components/Page';
import { api, post } from '@/lib/api';
import { useVendor } from '@/lib/vendor';

interface Req {
  id: string;
  projectType: string;
  brief: string;
  quantityEstimate: number | null;
  status: string;
  vendorReply: string | null;
  quotedAmountKobo: number | null;
  createdAt: string;
  buyer: { name: string; businessName: string | null };
}

/** FR-VP-08, UC-5: reply, send a quote or decline. */
export default function VendorRequests() {
  const t = useTranslations('vendorPortal');
  const tr = useTranslations('request');
  const f = useFormatter();
  const { vendor } = useVendor();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['vendorRequests'],
    queryFn: () => api<{ requests: Req[] }>('/vendor/requests').then((r) => r.requests),
    enabled: !!vendor,
  });
  return (
    <Page title={t('requestsTitle')}>
      {list.data?.length === 0 && <EmptyState title={t('noRequests')} />}
      <ul className="flex flex-col gap-3">
        {(list.data ?? []).map((r) => (
          <li key={r.id}>
            <RequestCard
              r={r}
              onDone={() => qc.invalidateQueries({ queryKey: ['vendorRequests'] })}
              labels={{
                type: tr(`types.${r.projectType}`),
                status: tr(`status.${r.status}`),
                when: f.dateTime(new Date(r.createdAt), { day: 'numeric', month: 'short' }),
              }}
            />
          </li>
        ))}
      </ul>
    </Page>
  );
}

function RequestCard({
  r,
  onDone,
  labels,
}: {
  r: Req;
  onDone: () => void;
  labels: { type: string; status: string; when: string };
}) {
  const t = useTranslations('vendorPortal');
  const [reply, setReply] = useState('');
  const [amount, setAmount] = useState(0);
  const s = useSubmit();
  const open = r.status === 'new' || r.status === 'quoted';
  const act = async (path: string, body: unknown) => {
    if (await s.run(() => post(`/vendor/requests/${r.id}/${path}`, body))) {
      setReply('');
      onDone();
    }
  };
  return (
    <Card className="flex flex-col gap-2">
      <p className="flex flex-wrap justify-between gap-2">
        <span className="font-bold">{r.buyer.businessName || r.buyer.name}</span>
        <span className="rounded-full bg-sunk px-2.5 py-0.5 text-[12.5px] font-bold">{labels.status}</span>
      </p>
      <p className="text-[12.5px] text-muted">
        {labels.type} · {labels.when}
        {r.quantityEstimate ? ` · ${t('qtyEstimate', { n: r.quantityEstimate })}` : ''}
      </p>
      <p className="text-[14px]">{r.brief}</p>
      {r.vendorReply && (
        <p className="text-[13.5px]">
          <span className="font-semibold">{t('yourReply')}</span> {r.vendorReply}
        </p>
      )}
      {r.quotedAmountKobo && (
        <p className="font-bold">{t('quoted', { amount: formatNaira(r.quotedAmountKobo) })}</p>
      )}
      {open && (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
          <TextArea
            label={t('reply')}
            rows={2}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            error={s.fields.reply}
          />
          <NairaField
            label={t('quoteAmount')}
            valueKobo={amount}
            onKobo={setAmount}
            error={s.fields.amountKobo}
          />
          <FormError error={s.error} />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={s.busy || !reply.trim()}
              onClick={() => act('reply', { reply })}
            >
              {t('sendReply')}
            </Button>
            <Button
              size="sm"
              disabled={s.busy || amount < 100}
              onClick={() => act('quote', { amountKobo: amount, reply })}
            >
              {t('sendQuote')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={s.busy}
              onClick={() => act('decline', reply ? { reply } : {})}
            >
              {t('decline')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
