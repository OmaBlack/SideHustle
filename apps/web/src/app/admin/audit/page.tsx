'use client';
import { useFormatter, useTranslations } from 'next-intl';
import { AdminGate } from '@/components/AdminGate';
import { useAdminQuery } from '@/lib/admin';

interface Entry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  actorName: string | null;
  at: string;
  diff: unknown;
}

/** FR-ADM-06: the immutable audit log, newest first. */
export default function Audit() {
  const t = useTranslations('admin');
  const f = useFormatter();
  const q = useAdminQuery<{ entries: Entry[] }>(['audit'], '/admin/audit-log');
  return (
    <AdminGate title={t('auditTitle')} denied={q.denied} ready={!!q.data} lead={t('auditLead')}>
      <ol className="flex flex-col gap-2">
        {(q.data?.entries ?? []).map((e) => (
          <li key={e.id} className="rounded-card border border-line bg-surface p-3 text-[13.5px]">
            <p className="flex flex-wrap justify-between gap-2">
              <span className="font-semibold">{e.action}</span>
              <span className="text-muted">
                {f.dateTime(new Date(e.at), {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </p>
            <p className="text-muted">
              {e.actorName ?? t('system')} · {e.entity} {e.entityId.slice(0, 8)}
            </p>
            {e.diff != null && (
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-sunk p-2 text-[12px]">
                {JSON.stringify(e.diff, null, 1)}
              </pre>
            )}
          </li>
        ))}
      </ol>
    </AdminGate>
  );
}
