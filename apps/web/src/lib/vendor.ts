'use client';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { useRequireLogin } from './session';

export interface VendorMe {
  vendor: {
    id: string;
    slug: string;
    name: string;
    status: 'pending' | 'verified' | 'suspended';
    kycStatus: string;
    categoryId: string;
    location: string;
    brandColor: string | null;
  };
  staffRole: 'owner' | 'staff';
  counts: { awaitingConfirmation: number; newRequests: number };
}

/** The signed-in user's vendor, or null when they are not on a vendor team. */
export function useVendor() {
  const me = useRequireLogin();
  const q = useQuery({
    queryKey: ['vendorMe'],
    queryFn: () =>
      api<VendorMe>('/vendor/me').catch((e) => {
        if (e instanceof ApiError && e.status === 403) return null;
        throw e;
      }),
    enabled: !!me.data,
  });
  return { me, vendor: q.data, loading: !me.data || q.isLoading };
}
