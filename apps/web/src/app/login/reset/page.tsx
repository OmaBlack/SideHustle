'use client';
import { Button } from '@sidehustle/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { FormError, TextField, useSubmit } from '@/components/forms';
import { Banner, Page } from '@/components/Page';
import { post } from '@/lib/api';

function Reset() {
  const t = useTranslations('auth');
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, fields, run } = useSubmit();
  return (
    <Page title={t('resetTitle')} narrow>
      {done ? (
        <Banner tone="good">
          {t('resetDone')} <Link href="/login">{t('login')}</Link>
        </Banner>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => post('/auth/password-reset/confirm', { token, password }))) setDone(true);
          }}
        >
          <TextField
            label={t('newPassword')}
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fields.password}
            hint={t('passwordHint')}
            required
          />
          <FormError error={error} />
          <Button type="submit" disabled={busy}>
            {t('resetSave')}
          </Button>
        </form>
      )}
    </Page>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  );
}
