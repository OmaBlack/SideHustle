import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  body?: string;
  /** Usually a Button, e.g. "Clear search" (FR-SRCH-03). */
  action?: ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line px-4 py-10 text-center"
    >
      <p className="text-base font-bold">{title}</p>
      {body && <p className="max-w-[48ch] text-[13.5px] text-muted">{body}</p>}
      {action}
    </div>
  );
}
