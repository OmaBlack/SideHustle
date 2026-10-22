'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LinkProvider, ToastProvider, type LinkComponent } from '@sidehustle/ui';
import NextLink from 'next/link';
import { useState, type ReactNode } from 'react';

const Link: LinkComponent = ({ href, ...rest }) => <NextLink href={href} {...rest} />;

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Weak networks (plan section 9): retry reads with backoff, never retry writes blindly.
          queries: { retry: 2, refetchOnWindowFocus: false },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <LinkProvider value={Link}>
        <ToastProvider>{children}</ToastProvider>
      </LinkProvider>
    </QueryClientProvider>
  );
}
