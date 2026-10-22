'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useRequireLogin } from './session';

/** Admin pages load only for admins; the API enforces it regardless (NFR-SEC-02). */
export function useAdminQuery<T>(key: unknown[], path: string) {
  const me = useRequireLogin();
  const isAdmin = me.data?.role === 'admin';
  const q = useQuery({ queryKey: key, queryFn: () => api<T>(path), enabled: isAdmin });
  return { ...q, me, isAdmin, denied: me.isSuccess && !!me.data && !isAdmin };
}
