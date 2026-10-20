import { cx } from '../format.js';

export interface MarginBadgeProps {
  /** Already-localised text, e.g. "50% margin". */
  children: string;
  className?: string;
}

/** Gold badge for the resale margin. Margins are estimates (BR-12); the page says so nearby. */
export function MarginBadge({ children, className }: MarginBadgeProps) {
  return (
    <span
      className={cx(
        'whitespace-nowrap rounded-md bg-gold px-1.5 py-0.5 text-xs font-extrabold text-on-gold tabular-nums',
        className,
      )}
    >
      {children}
    </span>
  );
}
