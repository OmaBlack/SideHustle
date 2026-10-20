'use client';
import { useId, type ReactNode } from 'react';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** Renders the control with the ids that tie it to its label, hint and error. */
  children: (control: FieldControlProps) => ReactNode;
}

export const controlClass =
  'w-full min-w-0 min-h-11 rounded-field border border-line bg-surface px-3 py-2.5 text-ink aria-[invalid=true]:border-danger';

/** Label, control, hint and inline error (plan section 9). */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, ...(error ? { 'aria-invalid': true as const } : {}) })}
      {hint && (
        <p id={hintId} className="text-[12.5px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
