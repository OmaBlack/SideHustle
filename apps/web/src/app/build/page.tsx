import { getTranslations } from 'next-intl/server';
import { Builder } from './builder';

export async function generateMetadata() {
  return { title: (await getTranslations('build'))('title') };
}

export default function BuildPage() {
  return <Builder />;
}
