import { createTRPCProxyClient, httpLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@/backend/trpc/app-router";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  const url = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
  console.log('[tRPC] EXPO_PUBLIC_RORK_API_BASE_URL:', url ? url : '(not set)');
  if (!url) {
    console.error('[tRPC] CRITICAL: EXPO_PUBLIC_RORK_API_BASE_URL is not set!');
    return '';
  }
  return url;
};

const baseUrl = getBaseUrl();
console.log('[tRPC] Full API URL:', `${baseUrl}/api/trpc`);

const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

const fetchWithRetry = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[tRPC] Fetch attempt ${attempt + 1}:`, url);
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(15000),
      });
      
      // Check if backend returned error page (HTML instead of JSON)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html') && !response.ok) {
        throw new Error('Backend temporarily unavailable');
      }
      
      console.log('[tRPC] Response status:', response.status);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`[tRPC] Attempt ${attempt + 1} failed:`, lastError.message);
      
      if (attempt < MAX_RETRIES) {
        console.log(`[tRPC] Retrying in ${RETRY_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  
  // Silent fail - let the calling code handle with fallbacks
  console.log('[tRPC] Backend unavailable, using local data');
  throw new Error('Backend temporarily unavailable');
};

const linkOptions = {
  url: `${baseUrl}/api/trpc`,
  transformer: superjson,
  fetch: fetchWithRetry,
};

// React Query client for hooks
export const trpcReactClient = trpc.createClient({
  links: [httpLink(linkOptions)],
});

// Vanilla client for imperative calls (outside of React components/hooks)
export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [httpLink(linkOptions)],
});
