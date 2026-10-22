'use client';
import { Button, formatNaira } from '@sidehustle/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAdminQuery } from '@/lib/admin';
import { del, post, put } from '@/lib/api';
import { Checkbox, FormError, NairaField, SelectField, TextField, useSubmit } from './forms';
import { Card, Section, TableScroll } from './Page';

export type Column =
  | { key: string; label: string; type: 'text' | 'int' | 'naira' | 'bool' | 'list' | 'bps' }
  | {
      key: string;
      label: string;
      type: 'select';
      options: { value: string; label: string }[];
      nullable?: boolean;
    };

type Row = Record<string, unknown> & { id: string };

/** Admin editor for one configuration table: list, add, edit, delete. Every change is audited by the API. */
export function CrudTable({
  title,
  path,
  columns,
  blank,
}: {
  title: string;
  path: string;
  columns: Column[];
  blank: Record<string, unknown>;
}) {
  const t = useTranslations('admin');
  const qc = useQueryClient();
  const q = useAdminQuery<{ items: Row[] }>(['crud', path], `/admin/${path}`);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>(blank);
  const s = useSubmit();
  const refresh = () => qc.invalidateQueries({ queryKey: ['crud', path] });
  const pick = (r: Record<string, unknown>) =>
    Object.fromEntries(columns.map((c) => [c.key, r[c.key] ?? blank[c.key] ?? null]));
  const show = (c: Column, v: unknown) => {
    if (v === null || v === undefined || v === '') return '–';
    if (c.type === 'naira') return formatNaira(Number(v));
    if (c.type === 'bps') return `${Number(v) / 100}%`;
    if (c.type === 'bool') return v ? t('yes') : t('no');
    if (c.type === 'list') return (v as string[]).join(', ') || t('allStates');
    if (c.type === 'select') return c.options.find((o) => o.value === v)?.label ?? String(v);
    return String(v);
  };
  const field = (c: Column) => {
    const v = draft[c.key];
    const err = s.fields[c.key];
    const set = (x: unknown) => setDraft({ ...draft, [c.key]: x });
    if (c.type === 'naira')
      return <NairaField key={c.key} label={c.label} valueKobo={Number(v ?? 0)} onKobo={set} error={err} />;
    if (c.type === 'bool') return <Checkbox key={c.key} label={c.label} checked={!!v} onChange={set} />;
    if (c.type === 'select')
      return (
        <SelectField
          key={c.key}
          label={c.label}
          value={String(v ?? '')}
          onChange={(e) => set(e.target.value || null)}
          error={err}
        >
          {c.nullable && <option value="">–</option>}
          {c.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectField>
      );
    if (c.type === 'list')
      return (
        <TextField
          key={c.key}
          label={c.label}
          hint={t('listHint')}
          value={((v as string[]) ?? []).join(', ')}
          onChange={(e) =>
            set(
              e.target.value
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
            )
          }
          error={err}
        />
      );
    if (c.type === 'int' || c.type === 'bps')
      return (
        <TextField
          key={c.key}
          label={c.label}
          inputMode="numeric"
          value={v === null || v === undefined ? '' : String(v)}
          onChange={(e) => set(Number(e.target.value.replace(/[^\d]/g, '') || 0))}
          error={err}
        />
      );
    return (
      <TextField
        key={c.key}
        label={c.label}
        value={String(v ?? '')}
        onChange={(e) => set(e.target.value)}
        error={err}
      />
    );
  };
  return (
    <Section
      title={title}
      action={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing('new');
            setDraft(blank);
          }}
        >
          {t('add')}
        </Button>
      }
    >
      {editing && (
        <Card>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await s.run(() =>
                  editing === 'new' ? post(`/admin/${path}`, draft) : put(`/admin/${path}/${editing}`, draft),
                )
              ) {
                setEditing(null);
                await refresh();
              }
            }}
          >
            {columns.map(field)}
            <div className="sm:col-span-2">
              <FormError error={s.error} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={s.busy}>
                {t('save')}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                {t('cancel')}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <TableScroll label={title}>
        <table className="w-full min-w-[480px] text-left text-[13.5px]">
          <thead className="text-muted">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="py-2 pr-2">
                  {c.label}
                </th>
              ))}
              <th>
                <span className="sr-only">{t('actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.items ?? []).map((r) => (
              <tr key={r.id} className="border-t border-line">
                {columns.map((c) => (
                  <td key={c.key} className="py-2 pr-2">
                    {show(c, r[c.key])}
                  </td>
                ))}
                <td className="whitespace-nowrap text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(r.id);
                      setDraft(pick(r));
                    }}
                  >
                    {t('edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!window.confirm(t('deleteConfirm'))) return;
                      await s.run(() => del(`/admin/${path}/${r.id}`));
                      await refresh();
                    }}
                  >
                    {t('delete')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Section>
  );
}
