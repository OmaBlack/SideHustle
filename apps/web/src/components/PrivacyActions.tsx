'use client';
import { Button, PhoneInput } from '@sidehustle/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { post, put } from '@/lib/api';
import { FormError, TextField, useSubmit } from './forms';

/** NDPA rights on the account page: download my data, correct email or phone, delete my account. */
export function PrivacyActions({ email, phone }: { email: string; phone: string }) {
  const t = useTranslations('account');
  const qc = useQueryClient();
  const router = useRouter();
  const [contact, setContact] = useState({ email: '', phone: '', password: '' });
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const change = useSubmit();
  const erase = useSubmit();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <a
          href="/v1/me/data-export"
          download
          className="inline-flex min-h-11 items-center justify-center self-start rounded-full px-5 font-bold text-ink no-underline shadow-[inset_0_0_0_1px_var(--line)]"
        >
          {t('export')}
        </a>
        <p className="text-[12.5px] text-muted">{t('exportHint')}</p>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const body = {
            ...(contact.email ? { email: contact.email } : {}),
            ...(contact.phone ? { phone: contact.phone } : {}),
            password: contact.password,
          };
          if (await change.run(() => put('/me/contact', body))) {
            setContact({ email: '', phone: '', password: '' });
            await qc.invalidateQueries();
          }
        }}
      >
        <h3 className="text-base font-extrabold">{t('changeContact')}</h3>
        <p className="text-[12.5px] text-muted">{t('changeContactHint', { email, phone })}</p>
        <TextField
          label={t('newEmail')}
          type="email"
          autoComplete="email"
          value={contact.email}
          onChange={(e) => setContact({ ...contact, email: e.target.value })}
          error={change.fields.email}
        />
        <PhoneInput
          label={t('newPhone')}
          value={contact.phone}
          onChange={(e) => setContact({ ...contact, phone: e.target.value })}
          error={change.fields.phone}
        />
        <TextField
          label={t('currentPassword')}
          type="password"
          autoComplete="current-password"
          value={contact.password}
          onChange={(e) => setContact({ ...contact, password: e.target.value })}
          error={change.fields.password}
        />
        <FormError error={change.fields.password ? null : change.error} />
        <Button
          type="submit"
          variant="ghost"
          disabled={change.busy || !contact.password || (!contact.email && !contact.phone)}
        >
          {t('saveContact')}
        </Button>
      </form>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <h3 className="text-base font-extrabold">{t('delete')}</h3>
        <p className="text-[13px]">{t('deleteExplain')}</p>
        {!confirmDelete ? (
          <Button variant="danger" className="self-start" onClick={() => setConfirmDelete(true)}>
            {t('delete')}
          </Button>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await erase.run(() => post('/me/delete', { password: deletePassword }))) {
                await qc.invalidateQueries();
                router.push('/account/deleted');
              }
            }}
          >
            <TextField
              label={t('currentPassword')}
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              error={erase.fields.password}
            />
            <FormError error={erase.fields.password ? null : erase.error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="danger" disabled={erase.busy || !deletePassword}>
                {t('deleteForever')}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                {t('cancel')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
