'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Prototype hash links (#k-skin, #p-shea, #v-luxe, #market) still work (plan section 9). */
export function HashRedirect() {
  const router = useRouter();
  useEffect(() => {
    const h = window.location.hash.slice(1);
    const m = /^(k|p|v)-(.+)$/.exec(h);
    if (m)
      router.replace(
        `/${{ k: 'kits', p: 'products', v: 'vendors' }[m[1] as 'k']}/${encodeURIComponent(m[2]!)}`,
      );
    else if (h === 'market') document.getElementById('market')?.scrollIntoView();
  }, [router]);
  return null;
}
