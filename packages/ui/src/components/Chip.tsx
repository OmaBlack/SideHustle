'use client';
import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../format.js';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  selected?: boolean;
}

/** A filter chip: a toggle button that reports its state to assistive tech. */
export function Chip({ selected = false, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        'min-h-11 flex-none cursor-pointer rounded-full border px-3.5 py-2 text-[13.5px] font-semibold',
        selected ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-muted',
        className,
      )}
      {...rest}
    />
  );
}
