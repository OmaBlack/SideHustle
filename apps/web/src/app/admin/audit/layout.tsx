import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

export async function generateMetadata() {
  return { title: (await getTranslations('titles'))('adminAudit') };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
