import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState, type ReactNode } from 'react';
import { BUILD } from '@/constants/build';
import { queryStorage, requestPersistentStorage } from '@/platform/queryStorage';
import { dataMode } from '@/repositories';

const WEEK = 7 * 86_400_000;

const persister = queryStorage ? createAsyncStoragePersister({ storage: queryStorage, key: 'eii.queries', throttleTime: 2000 }) : undefined;

/**
 * App-wide providers. Server data is cached on the device and shown instantly on the next open,
 * then refreshed in the background (spec §114, §143, §146).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // gcTime must outlive the persisted cache, or restored data is dropped straight away.
          queries: { staleTime: 60_000, gcTime: WEEK, retry: 1, refetchOnWindowFocus: true },
        },
      }),
  );

  useEffect(() => requestPersistentStorage(), []);

  if (!persister) return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return (
    <PersistQueryClientProvider
      client={client}
      // A new app version or data source starts with a fresh cache.
      persistOptions={{ persister, maxAge: WEEK, buster: `${BUILD.version}:${dataMode}` }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
