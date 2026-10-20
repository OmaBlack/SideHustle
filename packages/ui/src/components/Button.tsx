import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../format.js';

export type ButtonVariant = 'primary' | 'gold' | 'ghost' | 'danger';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent',
  gold: 'bg-gold text-on-gold',
  ghost: 'bg-transparent text-ink shadow-[inset_0_0_0_1px_var(--line)]',
  danger: 'bg-danger text-on-danger',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border-0 font-bold no-underline',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'px-5 py-3' : 'px-3.5 py-2 text-[13.5px]',
        variants[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    />
  );
}
