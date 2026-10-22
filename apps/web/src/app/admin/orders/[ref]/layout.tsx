import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  return { title: (await getTranslations('titles'))('adminOrder', { ref: (await params).ref }) };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
