'use client';
import { PRODUCT_INTERESTS, NIGERIAN_STATES } from '@sidehustle/schemas';
import { Button, Chip, PhoneInput, StateSelect } from '@sidehustle/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Checkbox, FormError, TextField, useSubmit } from '@/components/forms';
import { Page } from '@/components/Page';
import { post } from '@/lib/api';
import { safeNext, useAfterLogin } from '@/lib/session';

/** FR-ACC-01..03, NFR-PRV-01: sign-up with consent; form values survive a failed submit. */
function Signup() {
  const t = useTranslations('auth');
  const tc = useTranslations('interests');
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'), '/kits');
  const after = useAfterLogin();
  const [f, setF] = useState({ name: '', businessName: '', phone: '', email: '', state: '', password: '' });
  const [interests, setInterests] = useState<string[]>([]);
  const [acceptTerms, setAccept] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const { busy, error, fields, run } = useSubmit();
  const bind = (k: keyof typeof f) => ({
    value: f[k],
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }),
    error: fields[k],
  });
  return (
    <Page title={t('signupTitle')} lead={t('signupLead')} narrow>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => post('/auth/signup', { ...f, interests, acceptTerms, marketing }))) {
            await after();
            router.replace(`/verify?next=${encodeURIComponent(next)}`);
          }
        }}
      >
        <TextField label={t('name')} autoComplete="name" {...bind('name')} required />
        <TextField
          label={t('businessName')}
          autoComplete="organization"
          hint={t('businessHint')}
          {...bind('businessName')}
        />
        <PhoneInput label={t('phone')} hint={t('phoneHint')} {...bind('phone')} required />
        <TextField label={t('email')} type="email" autoComplete="email" {...bind('email')} required />
        <StateSelect
          label={t('state')}
          placeholder={t('statePlaceholder')}
          states={NIGERIAN_STATES}
          {...bind('state')}
          required
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-semibold">{t('interests')}</legend>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_INTERESTS.map((k) => (
              <Chip
                key={k}
                selected={interests.includes(k)}
                onClick={() =>
                  setInterests(interests.includes(k) ? interests.filter((x) => x !== k) : [...interests, k])
                }
              >
                {tc(k)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <TextField
          label={t('password')}
          type="password"
          autoComplete="new-password"
          hint={t('passwordHint')}
          {...bind('password')}
          required
        />
        <Checkbox
          checked={acceptTerms}
          onChange={setAccept}
          label={
            <>
              {t('acceptTerms')} <Link href="/privacy">{t('privacy')}</Link>
            </>
          }
        />
        {fields.acceptTerms && (
          <p role="alert" className="text-[12.5px] text-danger">
            {fields.acceptTerms}
          </p>
        )}
        <Checkbox
          checked={marketing}
          onChange={setMarketing}
          label={t('marketing')}
          hint={t('marketingHint')}
        />
        <FormError error={error} />
        <Button type="submit" disabled={busy}>
          {t('createAccount')}
        </Button>
      </form>
      <p className="text-[14px]">
        {t('haveAccount')}{' '}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-accent">
          {t('login')}
        </Link>
      </p>
    </Page>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <Signup />
    </Suspense>
  );
}
