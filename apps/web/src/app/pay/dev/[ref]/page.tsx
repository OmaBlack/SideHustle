'use client';
import { Button } from '@sidehustle/ui';
import { useTranslations } from 'next-intl';
import { use, useState } from 'react';
import { FormError, useSubmit } from '@/components/forms';
import { Banner, Page } from '@/components/Page';
import { post } from '@/lib/api';

/**
 * Stand-in for the Paystack checkout while there are no test keys (ticket 0.9
 * Part B). Paying here calls the API's dev completion endpoint, which runs the
 * same server-side payment path as a verified webhook.
 */
export default function DevPayPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = use(params);
  const t = useTranslations('devPay');
  const { busy, error, run } = useSubmit();
  const [done, setDone] = useState(false);
  return (
    <Page title={t('title')} lead={t('lead', { ref })} narrow>
      <Banner tone="warn">{t('warning')}</Banner>
      <FormError error={error} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="gold"
          disabled={busy || done}
          onClick={async () => {
            if (await run(() => post(`/payments/dev/${ref}/complete`))) {
              setDone(true);
              window.location.assign(`/orders/${ref}?paid=1`);
            }
          }}
        >
          {t('pay')}
        </Button>
        <Button variant="ghost" onClick={() => window.location.assign(`/orders/${ref}`)}>
          {t('cancel')}
        </Button>
      </div>
    </Page>
  );
}
