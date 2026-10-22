'use client';
import { Button, Chip } from '@sidehustle/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdminGate } from '@/components/AdminGate';
import { FormError, useSubmit } from '@/components/forms';
import { Card } from '@/components/Page';
import { useAdminQuery } from '@/lib/admin';
import { post } from '@/lib/api';

interface AdminVendor {
  id: string;
  name: string;
  slug: string;
  status: 'pending' | 'verified' | 'suspended';
  kycStatus: string;
  category: string;
  location: string;
  createdAt: string;
  licences: { id: string; licenceType: string; documentKey: string; status: string }[];
  staff: { name: string; email: string; phone: string; role: string }[];
}

/** FR-ADM-01, BR-10: review applications, request documents, approve, reject, suspend; licences (FR-ADM-08). */
export default function AdminVendors() {
  const t = useTranslations('admin');
  const [status, setStatus] = useState<string>('pending');
  const qc = useQueryClient();
  const q = useAdminQuery<{ vendors: AdminVendor[] }>(
    ['adminVendors', status],
    `/admin/vendors${status ? `?status=${status}` : ''}`,
  );
  const s = useSubmit();
  const act = async (path: string) => {
    if (await s.run(() => post(path))) await qc.invalidateQueries({ queryKey: ['adminVendors'] });
  };
  return (
    <AdminGate title={t('vendorsTitle')} denied={q.denied} ready={!!q.data}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('filter')}>
        {['pending', 'verified', 'suspended', ''].map((x) => (
          <Chip key={x} selected={status === x} onClick={() => setStatus(x)}>
            {t(`vendorStatus.${x || 'all'}`)}
          </Chip>
        ))}
      </div>
      <FormError error={s.error} />
      <ul className="flex flex-col gap-3">
        {(q.data?.vendors ?? []).map((v) => (
          <li key={v.id}>
            <Card className="flex flex-col gap-2">
              <p className="flex flex-wrap justify-between gap-2">
                <span className="font-bold">{v.name}</span>
                <span className="rounded-full bg-sunk px-2.5 py-0.5 text-[12.5px] font-bold">
                  {t(`vendorStatus.${v.status}`)} · {t(`kyc.${v.kycStatus}`)}
                </span>
              </p>
              <p className="text-[13px] text-muted">
                {v.category} · {v.location}
              </p>
              {v.staff.map((s) => (
                <p key={s.email} className="text-[13px]">
                  {s.name} · {s.email} · {s.phone}
                </p>
              ))}
              {v.licences.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-semibold">{l.licenceType}</span>
                  <span className="text-muted">{l.documentKey}</span>
                  <span>{t(`licence.${l.status}`)}</span>
                  {l.status === 'pending' && (
                    <>
                      <Button size="sm" onClick={() => act(`/admin/licences/${l.id}/approve`)}>
                        {t('approve')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => act(`/admin/licences/${l.id}/reject`)}>
                        {t('reject')}
                      </Button>
                    </>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {v.status === 'pending' && (
                  <Button size="sm" disabled={s.busy} onClick={() => act(`/admin/vendors/${v.id}/approve`)}>
                    {t('approve')}
                  </Button>
                )}
                {v.status === 'pending' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={s.busy}
                    onClick={() => act(`/admin/vendors/${v.id}/request_documents`)}
                  >
                    {t('requestDocs')}
                  </Button>
                )}
                {v.status === 'pending' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={s.busy}
                    onClick={() => act(`/admin/vendors/${v.id}/reject`)}
                  >
                    {t('reject')}
                  </Button>
                )}
                {v.status === 'verified' && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={s.busy}
                    onClick={() => act(`/admin/vendors/${v.id}/suspend`)}
                  >
                    {t('suspend')}
                  </Button>
                )}
                {v.status === 'suspended' && (
                  <Button size="sm" disabled={s.busy} onClick={() => act(`/admin/vendors/${v.id}/reinstate`)}>
                    {t('reinstate')}
                  </Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </AdminGate>
  );
}
