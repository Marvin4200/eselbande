'use client';

import { SessionProvider } from 'next-auth/react';
import { apiPath } from '@/lib/clientPaths';

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider basePath={apiPath('/api/auth')} refetchInterval={30} refetchOnWindowFocus={true}>{children}</SessionProvider>;
}
