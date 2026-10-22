'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api, post } from './api';
import type { CartView, Me } from './types';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: Me | null }>('/me').then((r) => r.user),
    staleTime: 30_000,
  });
}

export function useCart(enabled: boolean) {
  return useQuery({
    queryKey: ['cart'],
    queryFn: () => api<{ cart: CartView }>('/cart').then((r) => r.cart),
    enabled,
  });
}

/** FR-ACC-06 / AC-09: send logged-out visitors to sign in, then back to where they were going. */
export function useRequireLogin() {
  const me = useMe();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (me.isSuccess && !me.data) {
      const next = path + (typeof window !== 'undefined' ? window.location.search : '');
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [me.isSuccess, me.data, path, router]);
  return me;
}

const PENDING = 'sh.pendingCart';
export type PendingLine = Record<string, unknown>;

/** Lines a visitor tried to add before logging in; merged into the account after login (plan section 9). */
export const pendingCart = {
  read(): PendingLine[] {
    try {
      return JSON.parse(sessionStorage.getItem(PENDING) ?? '[]') as PendingLine[];
    } catch {
      return [];
    }
  },
  add(line: PendingLine) {
    try {
      sessionStorage.setItem(PENDING, JSON.stringify([...pendingCart.read(), line]));
    } catch {
      /* storage blocked: the line is simply not kept */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(PENDING);
    } catch {
      /* ignore */
    }
  },
};

/** After login or signup: merge any pending draft lines and refresh the session queries. */
export function useAfterLogin() {
  const qc = useQueryClient();
  return async () => {
    const lines = pendingCart.read();
    if (lines.length) {
      await post('/cart/merge', { lines }).catch(() => undefined);
      pendingCart.clear();
    }
    await qc.invalidateQueries();
  };
}

/** Only same-site paths are allowed as a return target. */
export function safeNext(next: string | null | undefined, fallback = '/') {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
