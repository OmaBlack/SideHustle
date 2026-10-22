import { cx } from '../format.js';

export interface SkeletonProps {
  /** Tailwind sizing, e.g. "h-24 w-full". */
  className?: string;
}

/** Placeholder block shaped like content that is still loading. Decorative; pair it with one role="status" message. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div aria-hidden="true" className={cx('rounded-card bg-sunk motion-safe:animate-pulse', className)} />
  );
}
