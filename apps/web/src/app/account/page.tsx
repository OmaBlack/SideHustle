'use client';
import { NIGERIAN_STATES, PRODUCT_INTERESTS } from '@sidehustle/schemas';
import { Button, Chip, StateSelect, formatNaira, useToast } from '@sidehustle/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FormError, TextField, useSubmit } from '@/components/forms';
import { Banner, Card, Page, Section } from '@/components/Page';
import { PrivacyActions } from '@/components/PrivacyActions';
import { api, del, post, put } from '@/lib/api';
import { useRequireLogin } from '@/lib/session';
import type { Me } from '@/lib/types';

interface Account {
  user: Me;
  stats: { orderCount: number; unitsBought: number; stockValueKobo: number };
  consents: { purpose: string; grantedAt: string; withdrawnAt: string | null }[];
  dataRequests: { id: string; kind: string; status: string; createdAt: string }[];
}
interface Session {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastSeenAt: string;
  current: boolean;
}
interface Req {
  id: string;
  vendor: { name: string; slug: string };
  projectType: string;
  brief: string;
  status: string;
  vendorReply: string | null;
  quotedAmountKobo: number | null;
  createdAt: string;
}

/** FR-ACC-05/07/08, FR-VEN-05 (status), NFR-PRV-01. */
export default function AccountPage() {
  const t = useTranslations('account');
  const tr = useTranslations('request');
  const ti = useTranslations('interests');
  const f = useFormatter();
  const me = useRequireLogin();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const acct = useQuery({
    queryKey: ['account'],
    queryFn: () => api<Account>('/me/account'),
    enabled: !!me.data,
  });
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api<{ sessions: Session[] }>('/me/sessions').then((r) => r.sessions),
    enabled: !!me.data,
  });
  const requests = useQuery({
    queryKey: ['myRequests'],
    queryFn: () => api<{ requests: Req[] }>('/me/requests').then((r) => r.requests),
    enabled: !!me.data,
  });
  const [form, setForm] = useState({ name: '', businessName: '', state: '', interests: [] as string[] });
  const save = useSubmit();
  useEffect(() => {
    const u = acct.data?.user;
    if (u)
      setForm({ name: u.name, businessName: u.businessName, state: u.state ?? '', interests: u.interests });
  }, [acct.data?.user]);
  const a = acct.data;
  if (!a)
    return (
      <Page title={t('title')}>
        <p role="status">{t('loading')}</p>
      </Page>
    );
  const marketing = a.consents.some((c) => c.purpose === 'marketing' && !c.withdrawnAt);
  return (
    <Page
      title={t('title')}
      lead={a.user.email}
      actions={
        <Button
          variant="ghost"
          onClick={async () => {
            await post('/auth/logout');
            await qc.invalidateQueries();
            router.push('/');
          }}
        >
          {t('logout')}
        </Button>
      }
    >
      {(!a.user.phoneVerified || !a.user.emailVerified) && (
        <Banner tone="warn">
          {t('verify')} <Link href="/verify">{t('verifyNow')}</Link>
        </Banner>
      )}
      <dl className="grid grid-cols-3 gap-3">
        {[
          [t('orders'), String(a.stats.orderCount)],
          [t('units'), String(a.stats.unitsBought)],
          [t('stockValue'), formatNaira(a.stats.stockValueKobo)],
        ].map(([k, v]) => (
          <Card key={k}>
            <dt className="text-[12.5px] text-muted">{k}</dt>
            <dd className="font-display text-xl font-extrabold tabular-nums">{v}</dd>
          </Card>
        ))}
      </dl>
      <div className="flex flex-wrap gap-3 text-[14px]">
        <Link href="/orders" className="font-semibold text-accent">
          {t('myOrders')}
        </Link>
        <Link href="/build" className="font-semibold text-accent">
          {t('savedKits')}
        </Link>
        {a.user.vendorId ? (
          <Link href="/vendor" className="font-semibold text-accent">
            {t('vendorPortal')}
          </Link>
        ) : (
          <Link href="/vendor" className="font-semibold text-accent">
            {t('becomeVendor')}
          </Link>
        )}
      </div>
      <Section title={t('profile')}>
        <form
          className="flex max-w-[560px] flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await save.run(() => put('/me/profile', form))) {
              await qc.invalidateQueries({ queryKey: ['account'] });
              toast(t('saved'));
            }
          }}
        >
          <TextField
            label={t('name')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={save.fields.name}
          />
          <TextField
            label={t('businessName')}
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            error={save.fields.businessName}
          />
          <StateSelect
            label={t('state')}
            placeholder={t('statePlaceholder')}
            states={NIGERIAN_STATES}
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            error={save.fields.state}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-semibold">{t('interests')}</legend>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_INTERESTS.map((k) => (
                <Chip
                  key={k}
                  selected={form.interests.includes(k)}
                  onClick={() =>
                    setForm({
                      ...form,
                      interests: form.interests.includes(k)
                        ? form.interests.filter((x) => x !== k)
                        : [...form.interests, k],
                    })
                  }
                >
                  {ti(k)}
                </Chip>
              ))}
            </div>
          </fieldset>
          <FormError error={save.error} />
          <Button type="submit" disabled={save.busy}>
            {t('save')}
          </Button>
        </form>
      </Section>
      <Section title={t('requests')} id="requests">
        {(requests.data ?? []).length === 0 ? (
          <p className="text-[14px] text-muted">{t('noRequests')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.data!.map((r) => (
              <li key={r.id}>
                <Card className="flex flex-col gap-1">
                  <p className="flex flex-wrap justify-between gap-2">
                    <Link href={`/vendors/${r.vendor.slug}`} className="font-bold text-ink">
                      {r.vendor.name}
                    </Link>
                    <span className="rounded-full bg-sunk px-2.5 py-0.5 text-[12.5px] font-bold">
                      {tr(`status.${r.status}`)}
                    </span>
                  </p>
                  <p className="text-[12.5px] text-muted">
                    {tr(`types.${r.projectType}`)} ·{' '}
                    {f.dateTime(new Date(r.createdAt), { day: 'numeric', month: 'short' })}
                  </p>
                  <p className="text-[14px]">{r.brief}</p>
                  {r.vendorReply && (
                    <p className="text-[14px]">
                      <span className="font-semibold">{tr('reply')}</span> {r.vendorReply}
                    </p>
                  )}
                  {r.quotedAmountKobo && (
                    <p className="font-bold">{tr('quote', { amount: formatNaira(r.quotedAmountKobo) })}</p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={t('sessions')}>
        <ul className="flex flex-col gap-2">
          {(sessions.data ?? []).map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface p-3 text-[13.5px]"
            >
              <span>
                <span className="block font-semibold">
                  {s.current ? t('thisDevice') : (s.userAgent ?? t('unknownDevice')).slice(0, 60)}
                </span>
                <span className="text-muted">
                  {t('lastSeen', {
                    when: f.dateTime(new Date(s.lastSeenAt), {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    }),
                  })}
                </span>
              </span>
              {!s.current && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await del(`/me/sessions/${s.id}`);
                    await qc.invalidateQueries({ queryKey: ['sessions'] });
                  }}
                >
                  {t('signOutDevice')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t('privacy')}>
        <Card className="flex flex-col gap-3">
          <label className="flex min-h-11 items-center gap-2.5 text-[14px]">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={marketing}
              onChange={async (e) => {
                await put('/me/consents/marketing', { granted: e.target.checked });
                await qc.invalidateQueries({ queryKey: ['account'] });
              }}
            />
            {t('marketing')}
          </label>
          <PrivacyActions email={a.user.email} phone={a.user.phone} />
          {a.dataRequests.length > 0 && (
            <ul className="text-[13px] text-muted">
              {a.dataRequests.map((r) => (
                <li key={r.id}>
                  {t('dataRequest', {
                    kind: t(`kind.${r.kind}`),
                    status: t(`jobStatus.${r.status}`),
                    when: f.dateTime(new Date(r.createdAt), { day: 'numeric', month: 'short' }),
                  })}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </Page>
  );
}
