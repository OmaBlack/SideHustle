import { cx } from '../format.js';

export interface MonogramProps {
  name: string;
  /** Vendor brand colour; falls back to the accent. */
  color?: string | null;
  size?: number;
  className?: string;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Vendor monogram for quick recognition (SRS 4.1). Decorative: the vendor name is always shown next to it. */
export function Monogram({ name, color, size = 44, className }: MonogramProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-grid flex-none place-items-center rounded-full font-display font-extrabold',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: color ?? 'var(--accent)',
        color: '#fff',
      }}
    >
      {initials(name)}
    </span>
  );
}
