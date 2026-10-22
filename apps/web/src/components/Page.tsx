import type { ReactNode } from 'react';
import { cx } from '@sidehustle/ui';

/** Page frame: one <main>, one <h1>, consistent gutters at 320px and up. */
export function Page({
  title,
  lead,
  children,
  actions,
  narrow,
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  narrow?: boolean;
}) {
  return (
    <main
      className={cx('mx-auto flex flex-col gap-5 px-4 py-6', narrow ? 'max-w-[640px]' : 'max-w-[1080px]')}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-[clamp(26px,6vw,38px)] font-extrabold">{title}</h1>
          {lead && <div className="max-w-[62ch] text-muted">{lead}</div>}
        </div>
        {actions}
      </div>
      {children}
    </main>
  );
}

export function Section({
  title,
  children,
  id,
  action,
}: {
  title: string;
  children: ReactNode;
  id?: string;
  action?: ReactNode;
}) {
  return (
    <section aria-labelledby={id ? `${id}-h` : undefined} id={id} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={id ? `${id}-h` : undefined} className="text-xl font-extrabold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-card border border-line bg-surface p-4', className)}>{children}</div>;
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'good' | 'danger';
  children: ReactNode;
}) {
  const tones = {
    info: 'bg-accent-soft text-ink',
    warn: 'bg-warn-soft text-ink',
    good: 'bg-good-soft text-ink',
    danger: 'border border-danger text-ink',
  };
  return <div className={cx('rounded-field px-3 py-2.5 text-[14px]', tones[tone])}>{children}</div>;
}

/**
 * Wide tables scroll sideways on small screens; the region is focusable so keyboard users can scroll it.
 * `relative` keeps sr-only (absolute) labels inside the scroller instead of widening the page.
 */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="relative overflow-x-auto">
      {children}
    </div>
  );
}
