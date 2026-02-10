import { createTRPCProxyClient, httpLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@/backend/trpc/app-router";

export const trpc = createTRPCReact<AppRouter>();

const DEFAULT_BACKEND_URL = "https://ambassadorostg.onrender.com";
const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/+$/, '');

export const getApiBaseUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
  if (envUrl && envUrl.startsWith('http')) {
    const normalized = normalizeBaseUrl(envUrl);
    console.log('[tRPC] EXPO_PUBLIC_RORK_API_BASE_URL:', normalized);
    return normalized;
  }

  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const apiParam = params.get('api');
      if (apiParam && apiParam.startsWith('http')) {
        const normalized = normalizeBaseUrl(apiParam);
        try {
          localStorage.setItem('RORK_API_BASE_URL', normalized);
        } catch {
        }
        console.log('[tRPC] API base URL from query param:', normalized);
        return normalized;
      }

      const stored = localStorage.getItem('RORK_API_BASE_URL');
      if (stored && stored.startsWith('http')) {
        const normalized = normalizeBaseUrl(stored);
        console.log('[tRPC] API base URL from localStorage:', normalized);
        return normalized;
      }
    } catch {
    }
  }

  console.log('[tRPC] Using default backend:', DEFAULT_BACKEND_URL);
  return DEFAULT_BACKEND_URL;
};

export const isBackendEnabled = () => !!getApiBaseUrl();

const baseUrl = getApiBaseUrl();
console.log('[tRPC] Full API URL:', `${baseUrl}/api/trpc`);

const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

const fetchWithRetry = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (!baseUrl) {
        throw new Error('Backend URL is not set');
      }
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
