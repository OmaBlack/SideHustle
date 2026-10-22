import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PortalNav } from '@/components/PortalNav';

export async function generateMetadata() {
  return { title: (await getTranslations('titles'))('vendor') };
}

export default function VendorLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PortalNav
        ns="vendorPortal"
        items={[
          { href: '/vendor', key: 'home' },
          { href: '/vendor/orders', key: 'orders' },
          { href: '/vendor/products', key: 'products' },
          { href: '/vendor/deals', key: 'deals' },
          { href: '/vendor/requests', key: 'requests' },
        ]}
      />
      {children}
    </>
  );
}
