import apiClient from './config';
import { API_BASE_URL, ENDPOINTS } from './config';
import { handleResponse, createUrl } from '../utils/apiHelpers';
import { getAuthHeaders } from '../utils/authHelpers';

/**
 * Get all users with optional filters
 * @param {Object} params - Query parameters
 * @param {string} params.search - Search query
 * @param {string} params.role - Filter by role (admin/customer)
 * @param {string} params.isVerified - Filter by verification status
 * @param {string} params.socialProvider - Filter by social login provider
 * @param {string} params.sortBy - Sort field
 * @param {string} params.sortOrder - Sort order (asc/desc)
 * @param {number} params.page - Page number
 * @param {number} params.limit - Items per page
 * @returns {Promise<Array>}
 */
export const getUsers = async (params = {}) => {
  const url = createUrl(`${API_BASE_URL}${ENDPOINTS.USERS}`, params);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  return handleResponse(response);
};

/**
 * Get user by ID
 * @param {string} id - User ID
 * @returns {Promise<Object>}
 */
export const getUserById = async (id) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.USERS}/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  return handleResponse(response);
};

/**
 * Get user by email
 * @param {string} email - User email
 * @returns {Promise<Object>}
 */
export const getUserByEmail = async (email) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.USERS}?email=${encodeURIComponent(email)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  const result = await handleResponse(response);
  return Array.isArray(result?.users) ? result.users[0] || null : result?.data?.[0] || result || null;
};

/**
 * Get user by phone
 * @param {string} phone - User phone number
 * @returns {Promise<Object>}
 */
export const getUserByPhone = async (phone) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.USERS}?phone=${encodeURIComponent(phone)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  const result = await handleResponse(response);
  return Array.isArray(result?.users) ? result.users[0] || null : result?.data?.[0] || result || null;
};

/**
 * Get user by username
 * @param {string} username - Username
 * @returns {Promise<Object>}
 */
export const getUserByUsername = async (username) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.USERS}?username=${encodeURIComponent(username)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  const result = await handleResponse(response);
  return Array.isArray(result?.users) ? result.users[0] || null : result?.data?.[0] || result || null;
};

/**
 * Create
 * @param {Object} userData
 * @returns {Promise<Object>}
 */
export const createUser = async (userData) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.USERS}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(userData),
  });
  
  return handleResponse(response);
};

/**
 * Update
 * @param {string} id
 * @param {Object} userData
 * @returns {Promise<Object>}
 */
export const updateUser = async (id, userData) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.USERS}?id=${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(userData),
  });
  
  return handleResponse(response);
};

/**
 * Patch
 * @param {string} id
 * @param {Object} userData
 * @returns {Promise<Object>}
 */
export const patchUser = async (id, userData) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.USERS}?id=${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(userData),
  });
  
  return handleResponse(response);
};

/**
 * Delete
 * @param {string} id
 * @returns {Promise<Object>}
 */
export const deleteUser = async (id) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.USERS}?id=${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  return handleResponse(response);
};

/**
 * Verify user account
 * @param {string} id - User ID
 * @param {string} token - Verification token
 * @returns {Promise<Object>}
 */
export const verifyUser = async (id, token) => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.USERS}/verify?id=${id}&token=${encodeURIComponent(token)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  return handleResponse(response);
};

/**
 * Set user password
 * @param {string} id - User ID
 * @param {string} password - New password
 * @param {string} confirmPassword - Password confirmation
 * @param {string} currentPassword - Current password for verification
 * @returns {Promise<Object>}
 */
export const setUserPassword = async (id, passwordOrPayload, confirmPassword, currentPassword) => {
  const payload =
    passwordOrPayload && typeof passwordOrPayload === 'object'
      ? passwordOrPayload
      : {
          password: passwordOrPayload,
          confirmPassword,
          currentPassword,
        };

  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.USERS}/set-password?id=${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  
  return handleResponse(response);
};

/**
 * Upload user avatar
 * @param {string} id - User ID
 * @param {File} file - Avatar image file
 * @returns {Promise<Object>}
 */
export const uploadAvatar = async (id, file) => {
  const formData = new FormData();
  formData.append('avatar', file);
  
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.USERS}/avatar?id=${id}`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
    },
    body: formData,
  });
  
  return handleResponse(response);
};

/**
 * Update user avatar
 * @param {string} id - User ID
 * @param {File} file - New avatar image file
 * @returns {Promise<Object>}
 */
export const updateAvatar = async (id, file) => {
  const formData = new FormData();
  formData.append('avatar', file);
  
  const response = await apiClient.patch(`/users/avatar?id=${id}`, formData);
  
  return response;
};

/**
 * Get distinct values for filter dropdowns (roles, providers)
 * @returns {Promise<Object>} - { roles: [{value, label}], providers: [{value, label}] }
 */
export const getDistinctValues = async () => {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.USERS}/distinct`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });
  
  return handleResponse(response);
};
