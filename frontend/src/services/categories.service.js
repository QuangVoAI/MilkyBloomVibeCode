import { API_BASE_URL, ENDPOINTS } from './config';
import { handleResponse } from '../utils/apiHelpers';
import { getAuthHeaders } from '../utils/authHelpers';

// Simple in-memory cache for categories
let categoriesCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get all categories (with caching to reduce API calls)
 * @param {Object|boolean} options - Options object or forceRefresh boolean for backwards compatibility
 * @param {number} options.limit - Limit number of categories returned
 * @param {boolean} options.forceRefresh - Force fetch from server
 * @returns {Promise<Array>}
 */
export const getCategories = async (options = {}) => {
  // Backwards compatibility: if boolean passed, treat as forceRefresh
  const opts = typeof options === 'boolean' 
    ? { forceRefresh: options } 
    : options;
  
  const { limit, forceRefresh = false } = opts;
  
  // Return cached data if valid, not forcing refresh, and same limit
  const now = Date.now();
  if (!forceRefresh && !limit && categoriesCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return categoriesCache;
  }
  
  try {
    // Build URL with query params
    const url = new URL(`${API_BASE_URL}${ENDPOINTS.CATEGORIES}`);
    if (limit) url.searchParams.append('limit', limit);
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
    });
    
    const data = await handleResponse(response);
    
    // Handle different response formats
    let categories;
    // If data is wrapped in a 'categories' property
    if (data && data.categories) {
      categories = Array.isArray(data.categories) ? data.categories : [];
    }
    // If data is wrapped in a 'data' property
    else if (data && data.data) {
      categories = Array.isArray(data.data) ? data.data : [];
    }
    // If data is already an array
    else {
      categories = Array.isArray(data) ? data : [];
    }
    
    // Only update full cache when fetching all (no limit)
    if (!limit) {
      categoriesCache = categories;
      cacheTimestamp = now;
    }
    
    return categories;
  } catch (error) {
    console.error('Categories service error:', error);
    // Return cached data on error (if available)
    if (categoriesCache) {
      console.log('Returning cached categories due to error');
      // If limit requested, slice from cache
      return limit ? categoriesCache.slice(0, limit) : categoriesCache;
    }
    throw error;
  }
};

/**
 * Clear categories cache (call after create/update/delete)
 */
export const clearCategoriesCache = () => {
  categoriesCache = null;
  cacheTimestamp = 0;
};

/**
 * Get a single category by ID
 * @param {string} id - Category ID
 * @returns {Promise<Object>}
 */
export const getCategoryById = async (id) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.CATEGORIES}/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  return handleResponse(response);
};

/**
 * Get category by slug
 * @param {string} slug - Category slug
 * @returns {Promise<Object>}
 */
export const getCategoryBySlug = async (slug) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.CATEGORIES}/slug/${slug}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  return handleResponse(response);
};

/**
 * Create a new category
 * @param {Object} categoryData - Category data
 * @returns {Promise<Object>}
 */
export const createCategory = async (categoryData) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.CATEGORIES}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(categoryData),
  });
  
  const result = await handleResponse(response);
  clearCategoriesCache(); // Clear cache after create
  return result;
};

/**
 * Update a category
 * @param {string} id - Category ID
 * @param {Object} categoryData - Category data
 * @returns {Promise<Object>}
 */
export const updateCategory = async (id, categoryData) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.CATEGORIES}/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(categoryData),
  });
  
  const result = await handleResponse(response);
  clearCategoriesCache(); // Clear cache after update
  return result;
};

/**
 * Delete a category
 * @param {string} id - Category ID
 * @returns {Promise<Object>}
 */
export const deleteCategory = async (id) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.CATEGORIES}/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  const result = await handleResponse(response);
  clearCategoriesCache(); // Clear cache after delete
  return result;
};
