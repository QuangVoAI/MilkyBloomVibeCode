/**
 * Prefetching utilities for optimistic data loading
 * Speeds up navigation by loading data before user clicks
 */

// DNS prefetch for API domain
export const prefetchDNS = (domain) => {
  const link = document.createElement('link');
  link.rel = 'dns-prefetch';
  link.href = domain;
  document.head.appendChild(link);
};

// Preconnect to API (includes DNS + TCP + TLS)
export const preconnectAPI = (url) => {
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = url;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
};

// Prefetch data on link hover/focus
export const prefetchOnHover = (fetchFn, delay = 200) => {
  let timeoutId = null;
  let prefetched = false;

  const prefetch = () => {
    if (!prefetched) {
      prefetched = true;
      fetchFn();
    }
  };

  const onMouseEnter = () => {
    timeoutId = setTimeout(prefetch, delay);
  };

  const onMouseLeave = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const onFocus = () => {
    prefetch();
  };

  return {
    onMouseEnter,
    onMouseLeave,
    onFocus,
  };
};

// Initialize API preconnection on app load
export const initAPIPreconnect = () => {
  const apiDomain = new URL(APP_BASE_URL).origin;
  
  // Preconnect to API domain
  preconnectAPI(apiDomain);
  
  // Also prefetch DNS for common CDN/image hosts
  prefetchDNS('https://cdn.jsdelivr.net');
};
import { APP_BASE_URL } from '@/services/config'
