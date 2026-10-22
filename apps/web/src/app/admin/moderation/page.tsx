'use client';
import { Button } from '@sidehustle/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AdminGate } from '@/components/AdminGate';
import { FormError, useSubmit } from '@/components/forms';
import { Card, Section } from '@/components/Page';
import { useAdminQuery } from '@/lib/admin';
import { post } from '@/lib/api';
import type { DealView } from '@/lib/types';

interface AdminRequest {
  id: string;
  vendor: string;
  buyer: string;
  projectType: string;
  brief: string;
  status: string;
  hiddenAt: string | null;
}

/** FR-ADM-02: moderate deals and custom-request content, remove violations. */
export default function Moderation() {
  const t = useTranslations('admin');
  const qc = useQueryClient();
  const deals = useAdminQuery<{ deals: DealView[] }>(['adminDeals'], '/admin/deals');
  const reqs = useAdminQuery<{ requests: AdminRequest[] }>(['adminRequests'], '/admin/requests');
  const s = useSubmit();
  const act = async (path: string, body: unknown, key: string) => {
    if (await s.run(() => post(path, body))) await qc.invalidateQueries({ queryKey: [key] });
  };
  return (
    <AdminGate title={t('moderationTitle')} denied={deals.denied} ready={!!deals.data && !!reqs.data}>
      <FormError error={s.error} />
      <Section title={t('deals')}>
        <ul className="flex flex-col gap-2">
          {(deals.data?.deals ?? []).map((d) => (
            <li key={d.id}>
              <Card className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{d.headline}</p>
                  <p className="text-[12.5px] text-muted">
                    {d.vendor.name} · {d.kind === 'promo' ? `${d.discountPct}%` : t('launch')} ·{' '}
                    {t(`moderation.${d.moderationStatus}`)}
                  </p>
                  {d.detail && <p className="text-[13px]">{d.detail}</p>}
                </div>
                {d.moderationStatus !== 'approved' && (
                  <Button size="sm" onClick={() => act(`/admin/deals/${d.id}/approve`, {}, 'adminDeals')}>
                    {t('approve')}
                  </Button>
                )}
                {d.moderationStatus !== 'rejected' && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      act(`/admin/deals/${d.id}/remove`, { reason: 'Content rules' }, 'adminDeals')
                    }
                  >
                    {t('remove')}
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t('requests')}>
        <ul className="flex flex-col gap-2">
          {(reqs.data?.requests ?? [])
            .filter((r) => !r.hiddenAt)
            .map((r) => (
              <li key={r.id}>
                <Card className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-muted">
                      {r.buyer} → {r.vendor} · {r.status}
                    </p>
                    <p className="text-[14px]">{r.brief}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      act(`/admin/requests/${r.id}/hide`, { reason: 'Content rules' }, 'adminRequests')
                    }
                  >
                    {t('hide')}
                  </Button>
                </Card>
              </li>
            ))}
        </ul>
      </Section>
    </AdminGate>
  );
}
