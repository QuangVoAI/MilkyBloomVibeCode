import { API_BASE_URL, ENDPOINTS } from './config';
import { handleResponse, createUrl } from '../utils/apiHelpers';
import { getAuthHeaders } from '../utils/authHelpers';

/**
 * Get all products with optional filters
 * @param {Object} params - Query parameters
 * @returns {Promise<Array|Object>}
 */
export const getProducts = async (params = {}) => {
  const url = createUrl(`${API_BASE_URL}${ENDPOINTS.PRODUCTS}`, params);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
      ...getAuthHeaders(),
    },
    keepalive: true,
  });
  
  return handleResponse(response);
};

/**
 * Check if a string is a valid MongoDB ObjectId
 * @param {string} str - String to check
 * @returns {boolean}
 */
const isValidObjectId = (str) => {
  if (!str || typeof str !== 'string') return false;
  return /^[a-fA-F0-9]{24}$/.test(str);
};

/**
 * Get a single product by ID or slug
 * @param {string} idOrSlug - Product ID or slug
 * @returns {Promise<Object>}
 */
export const getProductById = async (idOrSlug) => {
  // Determine if we should use the ID or slug endpoint
  const endpoint = isValidObjectId(idOrSlug)
    ? `${API_BASE_URL}${ENDPOINTS.PRODUCTS}/${idOrSlug}`
    : `${API_BASE_URL}${ENDPOINTS.PRODUCTS}/slug/${idOrSlug}`;
    
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
      ...getAuthHeaders(),
    },
    keepalive: true,
  });
  
  return handleResponse(response);
};

/**
 * Create a new product
 * @param {Object} productData - Product data
 * @returns {Promise<Object>}
 */
export const createProduct = async (productData) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PRODUCTS}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(productData),
  });
  
  return handleResponse(response);
};

/**
 * Update a product (full update)
 * @param {string} id - Product ID
 * @param {Object} productData - Product data
 * @returns {Promise<Object>}
 */
export const updateProduct = async (id, productData) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PRODUCTS}/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(productData),
  });
  
  return handleResponse(response);
};

/**
 * Partially update a product (JSON only - images handled separately)
 * @param {string} id - Product ID
 * @param {Object} productData - Partial product data
 * @returns {Promise<Object>}
 */
export const patchProduct = async (id, productData) => {
  const isFormData = productData instanceof FormData;
  
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PRODUCTS}/${id}`, {
    method: 'PATCH',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...getAuthHeaders(),
    },
    body: isFormData ? productData : JSON.stringify(productData),
  });
  
  return handleResponse(response);
};

/**
 * Delete a product
 * @param {string} id - Product ID
 * @returns {Promise<Object>}
 */
export const deleteProduct = async (id) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PRODUCTS}/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  return handleResponse(response);
};

/**
 * Delete multiple products
 * @param {Array<string>} ids - Array of product IDs
 * @returns {Promise<Object>}
 */
export const bulkDeleteProducts = async (ids) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PRODUCTS}/bulk-delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ ids }),
  });
  
  return handleResponse(response);
};

/**
 * Upload product images
 * @param {string} productId - Product ID
 * @param {FormData} formData - Form data containing images
 * @returns {Promise<Object>}
 */
export const uploadProductImages = async (productId, formData) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PRODUCTS}/${productId}/images`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
    },
    body: formData,
  });
  
  return handleResponse(response);
};

/**
 * Upload images to the backend image store (no productId needed)
 * @param {FormData} formData - Form data containing images
 * @returns {Promise<Object>} Object with imageUrls array
 */
export const uploadImages = async (formData) => {
  // Get auth token without Content-Type (let browser set multipart boundary)
  const token = localStorage.getItem('authToken');
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PRODUCTS}/images/upload`, {
    method: 'POST',
    headers: headers,
    body: formData,
  });
  
  return handleResponse(response);
};

/**
 * Upload variant images to the backend image store (no variantId needed)
 * @param {FormData} formData - Form data containing variant images
 * @returns {Promise<Object>} Object with imageUrls array
 */
export const uploadVariantImages = async (formData) => {
  const token = localStorage.getItem('authToken');
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE_URL}/variants/images/upload`, {
    method: 'POST',
    headers: headers,
    body: formData,
  });
  
  return handleResponse(response);
};

/**
 * Delete product images
 * @param {string} productId - Product ID
 * @param {Array<string>} imageUrls - Array of image URLs to delete
 * @returns {Promise<Object>}
 */
export const deleteProductImage = async (productId, imageUrls) => {
  // Support both single URL string or array of URLs
  const removeImages = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
  
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PRODUCTS}/${productId}/images`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ removeImages }),
  });
  
  return handleResponse(response);
};

/**
 * Get product categories
 * @returns {Promise<Array>}
 */
export const getProductCategories = async () => {
  const response = await fetch(`${API_BASE_URL}/categories`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
      ...getAuthHeaders(),
    },
    keepalive: true,
  });
  
  return handleResponse(response);
};

/**
 * Search products (alias for getProducts with search parameter)
 * @param {Object} params - Search parameters
 * @returns {Promise<Array|Object>}
 */
export const searchProducts = getProducts;

/**
 * Get all variants for a product
 * @param {string} productId - Product ID
 * @returns {Promise<Object>} - Object with variants array and total count
 */
export const getProductVariants = async (productId) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.PRODUCTS}/${productId}/variants`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  return handleResponse(response);
};

/**
 * Get a single variant by ID
 * @param {string} variantId - Variant ID
 * @returns {Promise<Object>}
 */
export const getVariantById = async (variantId) => {
  const response = await fetch(`${API_BASE_URL}/variants/${variantId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  return handleResponse(response);
};

/**
 * Create a new variant for a product
 * @param {string} productId - Product ID
 * @param {Object} variantData - Variant data
 * @returns {Promise<Object>}
 */
export const createVariant = async (productId, variantData) => {
  const response = await fetch(`${API_BASE_URL}/variants/${productId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(variantData),
  });
  
  return handleResponse(response);
};

/**
 * Update a variant
 * @param {string} variantId - Variant ID
 * @param {Object} variantData - Variant data
 * @returns {Promise<Object>}
 */
export const updateVariant = async (variantId, variantData) => {
  const response = await fetch(`${API_BASE_URL}/variants/${variantId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(variantData),
  });
  
  return handleResponse(response);
};

/**
 * Delete a variant
 * @param {string} variantId - Variant ID
 * @returns {Promise<Object>}
 */
export const deleteVariant = async (variantId) => {
  const response = await fetch(`${API_BASE_URL}/variants/${variantId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  return handleResponse(response);
};

/**
 * Upload images for an existing variant
 * @param {string} variantId - Variant ID
 * @param {FormData} formData - Form data containing images
 * @returns {Promise<Object>}
 */
export const uploadVariantImagesForVariant = async (variantId, formData) => {
  // Get auth token without Content-Type (let browser set multipart boundary)
  const token = localStorage.getItem('authToken');
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE_URL}/variants/${variantId}/images`, {
    method: 'POST',
    headers: headers,
    body: formData,
  });
  
  return handleResponse(response);
};

/**
 * Delete variant images
 * @param {string} variantId - Variant ID
 * @param {Array<string>} imageUrls - Array of image URLs to delete
 * @returns {Promise<Object>}
 */
export const deleteVariantImages = async (variantId, imageUrls) => {
  const removeImages = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
  
  const response = await fetch(`${API_BASE_URL}/variants/${variantId}/images`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ removeImages }),
  });
  
  return handleResponse(response);
};
