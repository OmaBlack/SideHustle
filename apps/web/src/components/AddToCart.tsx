'use client';
import { Button, useToast } from '@sidehustle/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, post } from '@/lib/api';
import { pendingCart, useMe, type PendingLine } from '@/lib/session';

/**
 * Adds a line and confirms with a toast (FR-CART-04). Logged out, the line is
 * kept for after sign-in and the visitor is sent to log in, then back (UC-1 step 3).
 */
export function useAddToCart() {
  const t = useTranslations('cart');
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async (line: PendingLine) => {
    setError(null);
    if (!me.data) {
      pendingCart.add(line);
      router.push(`/login?next=${encodeURIComponent('/cart')}&from=${encodeURIComponent(path)}`);
      return false;
    }
    setBusy(true);
    try {
      const r = await post<{ cart: unknown }>('/cart/lines', line);
      qc.setQueryData(['cart'], r.cart);
      toast(t('added'));
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.title : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { add, busy, error };
}

export function AddKitButton({ kitId, available }: { kitId: string; available: boolean }) {
  const t = useTranslations('kit');
  const { add, busy, error } = useAddToCart();
  return (
    <div className="flex flex-col gap-2">
      <Button variant="gold" disabled={!available || busy} onClick={() => add({ kind: 'kit', kitId })}>
        {available ? t('add') : t('unavailable')}
      </Button>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
