'use client';
import { Button } from '@sidehustle/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { FormError, TextField, useSubmit } from '@/components/forms';
import { Banner, Page } from '@/components/Page';
import { post } from '@/lib/api';
import { pendingCart, safeNext, useAfterLogin } from '@/lib/session';

/** FR-ACC-05/06, AC-09: sign in, then return to the page the visitor was going to. */
export function LoginForm() {
  const t = useTranslations('auth');
  const sp = useSearchParams();
  const router = useRouter();
  const next = safeNext(sp.get('next'));
  const after = useAfterLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const { busy, error, fields, run } = useSubmit();
  const reset = useSubmit();
  const pending = typeof window !== 'undefined' && pendingCart.read().length > 0;
  return (
    <Page title={t('loginTitle')} lead={sp.get('next') ? t('loginToContinue') : undefined} narrow>
      {pending && <Banner>{t('pendingCart')}</Banner>}
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => post('/auth/login', { email, password }))) {
            await after();
            router.replace(next);
          }
        }}
      >
        <TextField
          label={t('email')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fields.email}
          required
        />
        <TextField
          label={t('password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fields.password}
          required
        />
        <FormError error={error} />
        <Button type="submit" disabled={busy}>
          {t('login')}
        </Button>
      </form>
      <p className="text-[14px]">
        {t('noAccount')}{' '}
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-accent">
          {t('signup')}
        </Link>
      </p>
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        {resetSent ? (
          <Banner tone="good">{t('resetSent')}</Banner>
        ) : (
          <Button
            variant="ghost"
            disabled={reset.busy || !email}
            onClick={async () => {
              if (await reset.run(() => post('/auth/password-reset', { email }))) setResetSent(true);
            }}
          >
            {t('forgot')}
          </Button>
        )}
        <p className="text-[12.5px] text-muted">{t('forgotHint')}</p>
        <FormError error={reset.error} />
      </div>
    </Page>
  );
}
