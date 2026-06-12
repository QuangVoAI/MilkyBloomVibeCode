const normalizeApiBaseUrl = (value) => value.replace(/\/+$/, '');

const hasScheme = (value) => /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

const resolveConfiguredBaseUrl = (value, { localProtocol = 'http', remoteProtocol = 'https' } = {}) => {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (hasScheme(trimmed)) return normalizeApiBaseUrl(trimmed);

  const protocol = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(trimmed)
    ? localProtocol
    : remoteProtocol;

  return normalizeApiBaseUrl(`${protocol}://${trimmed}`);
};

const ensureApiPath = (value) => {
  const normalized = normalizeApiBaseUrl(value);
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
};

const resolveApiBaseUrl = () => {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (configured) {
    return ensureApiPath(resolveConfiguredBaseUrl(configured, {
      localProtocol: 'http',
      remoteProtocol: 'https',
    }));
  }

  if (import.meta.env.DEV) {
    return 'http://localhost:6969/api';
  }

  return `${window.location.origin}/api`;
};

export const API_BASE_URL = resolveApiBaseUrl();
export const APP_BASE_URL = API_BASE_URL.endsWith('/api')
  ? API_BASE_URL.slice(0, -4)
  : API_BASE_URL;

// API Endpoints
export const ENDPOINTS = {
  PRODUCTS: '/products',
  USERS: '/users',
  AUTH: '/auth',
  ORDERS: '/orders',
  CART: '/carts',
  CATEGORIES: '/categories',
};

// Default
export const getDefaultHeaders = () => ({
  'Content-Type': 'application/json',
});

export const REQUEST_TIMEOUT = 15000;

// API Client with optimizations
const apiClient = {
  async request(method, url, options = {}) {
    const {
      data,
      params,
      headers = {},
      signal,
      suppressNetworkErrorLog = false,
      ...fetchOptions
    } = options;
    
    // Build URL with query params
    let fullUrl = `${API_BASE_URL}${url}`;
    if (params) {
      // Filter out undefined values to prevent "undefined" strings in URL
      const cleanParams = Object.entries(params).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          acc[key] = value;
        }
        return acc;
      }, {});
      
      const queryString = new URLSearchParams(cleanParams).toString();
      if (queryString) {
        fullUrl += `?${queryString}`;
      }
    }

    // Get auth token if exists
    const token = localStorage.getItem('authToken');
    
    // Get guest sessionId if user is not logged in
    const sessionId = !token ? localStorage.getItem('guestSessionId') : null;
    
    // Check if data is FormData
    const isFormData = data instanceof FormData;
    
    const defaultHeaders = {
      ...(isFormData ? {} : getDefaultHeaders()), // Don't set Content-Type for FormData
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(sessionId && { 'X-Session-Id': sessionId }),
      ...headers,
    };

    const config = {
      method,
      headers: defaultHeaders,
      cache: 'no-store', // Prevent browser caching
      ...(signal ? {} : { keepalive: true }), // Avoid Chrome fetch failures on externally abortable requests
      signal, // Support abort controller
      ...fetchOptions,
    };

    if (data) {
      // Don't stringify FormData
      config.body = isFormData ? data : JSON.stringify(data);
    }

    try {
      // Add timeout using AbortController (proper way)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      
      // Merge with any existing signal
      if (signal) {
        signal.addEventListener('abort', () => controller.abort());
      }
      config.signal = controller.signal;

      const response = await fetch(fullUrl, config);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: `HTTP error! status: ${response.status}`,
        }));
        
        // Handle rate limiting (429) - throw special error to prevent retry loops
        if (response.status === 429) {
          const rateLimitError = new Error('Too many requests. Please slow down.');
          rateLimitError.status = 429;
          rateLimitError.retryAfter = response.headers.get('Retry-After') || 60;
          throw rateLimitError;
        }
        
        // Don't log 404 errors (expected for non-existent resources)
        if (response.status !== 404) {
          console.error('API Error Response:', error);
        }
        
        // Handle expired token - auto logout
        if (response.status === 401 && (error.message === 'Invalid token' || error.message === 'Unauthorized')) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          window.dispatchEvent(new Event('userLoggedOut'));
        }
        
        const apiError = new Error(error.message || `HTTP error! status: ${response.status}`);
        apiError.status = response.status;
        apiError.response = {
          status: response.status,
          data: error,
        };
        throw apiError;
      }

      const result = await response.json();
      
      return result;
    } catch (error) {
      // Handle abort/timeout
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      // Don't log 404, timeout, or rate limit errors for cleaner console
      const is404 = error.message?.includes('404') || 
                    error.message?.includes('Cart not found') || 
                    error.message?.includes('Không tìm thấy');
      const isTimeout = error.message?.includes('timeout');
      const isRateLimit = error.status === 429 || error.message?.includes('Too many requests');
      const isNetworkFetchFailure =
        error.name === 'TypeError' && error.message === 'Failed to fetch';
      
      if (!is404 && !isTimeout && !isRateLimit && !(suppressNetworkErrorLog && isNetworkFetchFailure)) {
        console.error('API request failed:', error);
      }
      throw error;
    }
  },

  get(url, options) {
    return this.request('GET', url, options);
  },

  post(url, data, options = {}) {
    return this.request('POST', url, { ...options, data });
  },

  put(url, data, options = {}) {
    return this.request('PUT', url, { ...options, data });
  },

  patch(url, data, options = {}) {
    return this.request('PATCH', url, { ...options, data });
  },

  delete(url, options) {
    return this.request('DELETE', url, options);
  },
};

export default apiClient;
