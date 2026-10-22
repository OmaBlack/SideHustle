import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from './form';

export async function generateMetadata() {
  return { title: (await getTranslations('auth'))('loginTitle') };
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
