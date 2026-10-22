'use client';
import { REQUEST_PROJECT_TYPES } from '@sidehustle/schemas';
import { Button } from '@sidehustle/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { post } from '@/lib/api';
import { useMe } from '@/lib/session';
import { FormError, SelectField, TextArea, TextField, useSubmit } from './forms';
import { Banner } from './Page';

/** FR-VEN-03/04, UC-5: project type and description; login required to send. */
export function RequestForm({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const t = useTranslations('request');
  const me = useMe();
  const path = usePathname();
  const [projectType, setType] = useState<string>(REQUEST_PROJECT_TYPES[0]);
  const [brief, setBrief] = useState('');
  const [qty, setQty] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, fields, run } = useSubmit();
  if (sent)
    return (
      <Banner tone="good">
        {t('sent', { vendor: vendorName })} <Link href="/account#requests">{t('track')}</Link>
      </Banner>
    );
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() =>
          post('/requests', {
            vendorId,
            projectType,
            brief,
            ...(qty ? { quantityEstimate: Number(qty) } : {}),
          }),
        );
        if (ok) setSent(true);
      }}
    >
      <SelectField
        label={t('type')}
        value={projectType}
        onChange={(e) => setType(e.target.value)}
        error={fields.projectType}
      >
        {REQUEST_PROJECT_TYPES.map((k) => (
          <option key={k} value={k}>
            {t(`types.${k}`)}
          </option>
        ))}
      </SelectField>
      <TextArea
        label={t('brief')}
        hint={t('briefHint')}
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        error={fields.brief}
        maxLength={2000}
        required
      />
      <TextField
        label={t('qty')}
        inputMode="numeric"
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))}
        error={fields.quantityEstimate}
      />
      <FormError error={error} />
      {me.data ? (
        <Button type="submit" disabled={busy}>
          {t('send')}
        </Button>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(path)}`}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 font-bold text-on-accent no-underline"
        >
          {t('login')}
        </Link>
      )}
    </form>
  );
}
