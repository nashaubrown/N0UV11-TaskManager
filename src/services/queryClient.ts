import { QueryClient } from '@tanstack/react-query'

/** Shared TanStack Query client. Phase 2 wires queries to the real API;
 *  Phase 3 layers offline persistence on top of this client. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
