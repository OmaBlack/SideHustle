import type { ReactNode } from 'react';
import { PortalNav } from '@/components/PortalNav';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PortalNav
        ns="admin"
        items={[
          { href: '/admin', key: 'overview' },
          { href: '/admin/vendors', key: 'vendors' },
          { href: '/admin/moderation', key: 'moderation' },
          { href: '/admin/orders', key: 'orders' },
          { href: '/admin/kits', key: 'kits' },
          { href: '/admin/hub', key: 'hub' },
          { href: '/admin/settings', key: 'settings' },
          { href: '/admin/audit', key: 'audit' },
        ]}
      />
      {children}
    </>
  );
}
