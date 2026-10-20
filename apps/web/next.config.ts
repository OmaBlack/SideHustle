import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sidehustle/ui', '@sidehustle/schemas'],
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  // Workspace packages use NodeNext-style '.js' specifiers for TypeScript files.
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return cfg;
  },
};

export default withNextIntl(config);
