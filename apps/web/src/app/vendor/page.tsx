'use client';
import { Button } from '@sidehustle/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { Checkbox, FormError, SelectField, TextArea, TextField, useSubmit } from '@/components/forms';
import { Banner, Card, Page, Section } from '@/components/Page';
import { api, post } from '@/lib/api';
import type { Category } from '@/lib/types';
import { useVendor } from '@/lib/vendor';
import { PageLoading } from '@/components/PageLoading';

interface Licence {
  id: string;
  licenceType: string;
  documentKey: string;
  status: string;
  expiresAt: string | null;
}

/** Vendor home: application (ticket 3.1) or a dashboard with what needs doing, and licences (FR-ADM-08). */
export default function VendorHome() {
  const t = useTranslations('vendorPortal');
  const { vendor, loading } = useVendor();
  if (loading)
    return (
      <Page title={t('title')}>
        <PageLoading text={t('loading')} />
      </Page>
    );
  if (!vendor) return <Apply />;
  const v = vendor.vendor;
  return (
    <Page title={v.name} lead={t(`vendorStatus.${v.status}`)}>
      {v.status === 'pending' && <Banner tone="warn">{t('pendingNote')}</Banner>}
      {v.status === 'suspended' && <Banner tone="danger">{t('suspendedNote')}</Banner>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex flex-col gap-1">
          <p className="font-display text-3xl font-extrabold">{vendor.counts.awaitingConfirmation}</p>
          <p>{t('awaiting')}</p>
          <Link href="/vendor/orders" className="font-semibold text-accent">
            {t('openOrders')}
          </Link>
        </Card>
        <Card className="flex flex-col gap-1">
          <p className="font-display text-3xl font-extrabold">{vendor.counts.newRequests}</p>
          <p>{t('newRequests')}</p>
          <Link href="/vendor/requests" className="font-semibold text-accent">
            {t('openRequests')}
          </Link>
        </Card>
      </div>
      <Licences />
    </Page>
  );
}

function Licences() {
  const t = useTranslations('vendorPortal');
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['licences'],
    queryFn: () => api<{ licences: Licence[] }>('/vendor/licences').then((r) => r.licences),
  });
  const [f, setF] = useState({ licenceType: '', documentKey: '', expiresOn: '' });
  const s = useSubmit();
  return (
    <Section title={t('licences')}>
      <p className="text-[14px] text-muted">{t('licencesLead')}</p>
      <ul className="flex flex-col gap-2">
        {(list.data ?? []).map((l) => (
          <li
            key={l.id}
            className="flex justify-between rounded-card border border-line bg-surface p-3 text-[14px]"
          >
            <span className="font-semibold">{l.licenceType}</span>
            <span>{t(`licenceStatus.${l.status}`)}</span>
          </li>
        ))}
      </ul>
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await s.run(() =>
              post('/vendor/licences', {
                licenceType: f.licenceType,
                documentKey: f.documentKey,
                ...(f.expiresOn ? { expiresOn: f.expiresOn } : {}),
              }),
            )
          ) {
            setF({ licenceType: '', documentKey: '', expiresOn: '' });
            await qc.invalidateQueries({ queryKey: ['licences'] });
          }
        }}
      >
        <TextField
          label={t('licenceType')}
          hint={t('licenceTypeHint')}
          value={f.licenceType}
          onChange={(e) => setF({ ...f, licenceType: e.target.value })}
          error={s.fields.licenceType}
        />
        <TextField
          label={t('documentRef')}
          hint={t('documentRefHint')}
          value={f.documentKey}
          onChange={(e) => setF({ ...f, documentKey: e.target.value })}
          error={s.fields.documentKey}
        />
        <TextField
          label={t('expires')}
          type="date"
          value={f.expiresOn}
          onChange={(e) => setF({ ...f, expiresOn: e.target.value })}
        />
        <div className="sm:col-span-3">
          <FormError error={s.error} />
        </div>
        <Button type="submit" variant="ghost" disabled={s.busy}>
          {t('addLicence')}
        </Button>
      </form>
    </Section>
  );
}

function Apply() {
  const t = useTranslations('vendorPortal');
  const qc = useQueryClient();
  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: Category[] }>('/categories').then((r) => r.categories),
  });
  const [f, setF] = useState({
    name: '',
    categoryId: '',
    location: '',
    about: '',
    leadTimeText: '',
    shipsTo: '',
  });
  const [custom, setCustom] = useState(false);
  const s = useSubmit();
  const bind = (k: keyof typeof f) => ({
    value: f[k],
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }),
    error: s.fields[k],
  });
  return (
    <Page title={t('applyTitle')} lead={t('applyLead')} narrow>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await s.run(() => post('/vendor/apply', { ...f, acceptsCustom: custom })))
            await qc.invalidateQueries();
        }}
      >
        <TextField label={t('businessName')} {...bind('name')} required />
        <SelectField label={t('category')} {...bind('categoryId')} required>
          <option value="">{t('chooseCategory')}</option>
          {(cats.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField label={t('location')} hint={t('locationHint')} {...bind('location')} required />
        <TextArea label={t('about')} {...bind('about')} />
        <TextField label={t('leadTime')} hint={t('leadTimeHint')} {...bind('leadTimeText')} />
        <TextField label={t('shipsTo')} {...bind('shipsTo')} />
        <Checkbox checked={custom} onChange={setCustom} label={t('acceptsCustom')} />
        <FormError error={s.error} />
        <Button type="submit" disabled={s.busy}>
          {t('apply')}
        </Button>
      </form>
    </Page>
  );
}
