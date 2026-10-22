'use client';
import { Button } from '@sidehustle/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { FormError, TextField, useSubmit } from '@/components/forms';
import { Banner, Card, Page, Section } from '@/components/Page';
import { post } from '@/lib/api';
import { safeNext, useMe } from '@/lib/session';

/** FR-ACC-04: phone by OTP and email by link, before the first checkout. */
function Verify() {
  const t = useTranslations('verify');
  const sp = useSearchParams();
  const next = safeNext(sp.get('next'), '/kits');
  const emailToken = sp.get('email_token');
  const me = useMe();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [emailDone, setEmailDone] = useState(false);
  const sendOtp = useSubmit();
  const checkOtp = useSubmit();
  const sendEmail = useSubmit();
  const linkCheck = useSubmit();
  const tried = useRef(false);
  useEffect(() => {
    if (!emailToken || tried.current) return;
    tried.current = true;
    void linkCheck
      .run(() => post('/auth/verify-email', { token: emailToken }))
      .then(async (ok) => {
        if (ok) {
          setEmailDone(true);
          await qc.invalidateQueries({ queryKey: ['me'] });
        }
      });
  }, [emailToken, linkCheck, qc]);
  const u = me.data;
  if (emailToken && !u) {
    return (
      <Page title={t('title')} narrow>
        {emailDone ? <Banner tone="good">{t('emailDone')}</Banner> : <FormError error={linkCheck.error} />}
      </Page>
    );
  }
  if (!u)
    return (
      <Page title={t('title')} narrow>
        <p>
          {t('loginFirst')} <Link href={`/login?next=${encodeURIComponent('/verify')}`}>{t('login')}</Link>
        </p>
      </Page>
    );
  const both = u.phoneVerified && u.emailVerified;
  return (
    <Page title={t('title')} lead={t('lead')} narrow>
      {both && (
        <Banner tone="good">
          {t('allDone')} <Link href={next}>{t('continue')}</Link>
        </Banner>
      )}
      <Section title={t('phone')}>
        <Card className="flex flex-col gap-3">
          {u.phoneVerified ? (
            <p>✓ {t('phoneDone', { phone: u.phone })}</p>
          ) : (
            <>
              <p className="text-[14px]">{t('phoneHow', { phone: u.phone })}</p>
              <Button
                variant="ghost"
                disabled={sendOtp.busy}
                onClick={async () => {
                  const r = await sendOtp.run(() => post<{ devCode?: string }>('/me/verify/phone/send'));
                  if (r?.devCode) setDevCode(r.devCode);
                }}
              >
                {t('sendCode')}
              </Button>
              {devCode && <Banner>{t('devCode', { code: devCode })}</Banner>}
              <FormError error={sendOtp.error} />
              <form
                className="flex flex-col gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await checkOtp.run(() => post('/me/verify/phone', { code })))
                    await qc.invalidateQueries({ queryKey: ['me'] });
                }}
              >
                <TextField
                  label={t('code')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  error={checkOtp.fields.code}
                />
                <FormError error={checkOtp.fields.code ? null : checkOtp.error} />
                <Button type="submit" disabled={checkOtp.busy || code.length !== 6}>
                  {t('verifyPhone')}
                </Button>
              </form>
            </>
          )}
        </Card>
      </Section>
      <Section title={t('email')}>
        <Card className="flex flex-col gap-3">
          {u.emailVerified ? (
            <p>✓ {t('emailDoneFor', { email: u.email })}</p>
          ) : (
            <>
              <p className="text-[14px]">{t('emailHow', { email: u.email })}</p>
              <Button
                variant="ghost"
                disabled={sendEmail.busy}
                onClick={async () => {
                  const r = await sendEmail.run(() => post<{ devToken?: string }>('/me/verify/email/send'));
                  if (r?.devToken) setDevToken(r.devToken);
                }}
              >
                {t('sendLink')}
              </Button>
              {devToken && (
                <Banner>
                  <Link href={`/verify?email_token=${devToken}&next=${encodeURIComponent(next)}`}>
                    {t('devLink')}
                  </Link>
                </Banner>
              )}
              <FormError error={sendEmail.error ?? linkCheck.error} />
            </>
          )}
        </Card>
      </Section>
    </Page>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
