'use client';
import { Field, controlClass } from '@sidehustle/ui';
import {
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ApiError } from '@/lib/api';

/** Form state for API calls: field errors under each input (FR-ACC-02), a summary otherwise, and no data loss. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        setError(
          e.title + (e.body.detail && !Object.keys(e.fields).length ? `: ${String(e.body.detail)}` : ''),
        );
      } else setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, fields, run, setError };
}

export function TextField({
  label,
  hint,
  error,
  ...rest
}: { label: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(c) => <input {...c} {...rest} className={controlClass} />}
    </Field>
  );
}

export function TextArea({
  label,
  hint,
  error,
  ...rest
}: { label: string; hint?: string; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(c) => <textarea {...c} {...rest} rows={rest.rows ?? 4} className={controlClass} />}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(c) => (
        <select {...c} {...rest} className={controlClass}>
          {children}
        </select>
      )}
    </Field>
  );
}

/** Naira input that reads and writes kobo. */
export function NairaField({
  label,
  hint,
  error,
  valueKobo,
  onKobo,
  ...rest
}: { label: string; hint?: string; error?: string; valueKobo: number; onKobo: (k: number) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(c) => (
        <div className="flex overflow-hidden rounded-field border border-line bg-surface">
          <span aria-hidden="true" className="bg-sunk px-3 py-2.5 font-semibold">
            ₦
          </span>
          <input
            {...c}
            {...rest}
            inputMode="numeric"
            className="min-h-11 w-full min-w-0 border-0 bg-transparent px-3 text-ink outline-none"
            value={valueKobo ? String(Math.round(valueKobo / 100)) : ''}
            onChange={(e) => onKobo(Number(e.target.value.replace(/[^\d]/g, '') || 0) * 100)}
          />
        </div>
      )}
    </Field>
  );
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-field border border-danger px-3 py-2 text-[14px] text-danger">
      {error}
    </p>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1.5 text-[14px]">
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 flex-none accent-[var(--accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="block text-[12.5px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}
