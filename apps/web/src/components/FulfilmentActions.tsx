'use client';
import { Button } from '@sidehustle/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { post } from '@/lib/api';
import type { FulfilmentView } from '@/lib/types';
import { FormError, TextField, useSubmit } from './forms';

/** Confirm or reject within 24 hours, then dispatch with tracking and mark delivered (FR-VP-07, UC-6). */
export function FulfilmentActions({
  f,
  base,
  onDone,
}: {
  f: FulfilmentView;
  base: '/vendor' | '/admin';
  onDone: () => void;
}) {
  const t = useTranslations('fulfil');
  const [reason, setReason] = useState('');
  const [tracking, setTracking] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const s = useSubmit();
  const act = async (action: string, body: unknown = {}) => {
    if (await s.run(() => post(`${base}/fulfilments/${f.id}/${action}`, body))) onDone();
  };
  return (
    <div className="flex flex-col gap-2">
      {f.status === 'awaiting_confirmation' && !rejecting && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={s.busy} onClick={() => act('confirm')}>
            {t('confirm')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(true)}>
            {t('reject')}
          </Button>
        </div>
      )}
      {rejecting && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act('reject', { reason });
          }}
        >
          <TextField
            label={t('reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={s.fields.reason}
          />
          <Button size="sm" variant="danger" type="submit" disabled={s.busy}>
            {t('rejectRefund')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
            {t('cancel')}
          </Button>
        </form>
      )}
      {f.status === 'confirmed' && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act('dispatch', { trackingRef: tracking });
          }}
        >
          <TextField
            label={t('tracking')}
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            error={s.fields.trackingRef}
          />
          <Button size="sm" type="submit" disabled={s.busy}>
            {t('dispatch')}
          </Button>
        </form>
      )}
      {f.status === 'dispatched' && (
        <Button size="sm" variant="ghost" disabled={s.busy} onClick={() => act('deliver')}>
          {t('delivered')}
        </Button>
      )}
      <FormError error={s.error} />
    </div>
  );
}
