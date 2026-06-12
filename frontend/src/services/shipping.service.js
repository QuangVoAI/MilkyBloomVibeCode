import apiClient, { API_BASE_URL } from './config';

/**
 * Shipping Service
 * Handles all shipping-related API calls
 */

// Get available delivery types
export const getDeliveryTypes = async (region = null) => {
  const params = region ? { region } : {};
  const response = await apiClient.get('/shipping/delivery-types', { params });
  return response;
};

// Calculate shipping fee for guest (no login required)
export const getShippingFee = async (params) => {
  const response = await apiClient.post('/shipping/fee', params);
  return response;
};

// Calculate shipping fee for logged-in user
export const getShippingFeeByUser = async (userId, params = {}) => {
  const url = new URL(`${API_BASE_URL}/shipping/fee/${userId}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const token = localStorage.getItem('authToken');
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    credentials: 'include',
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({
    message: `HTTP error! status: ${response.status}`,
  }));

  if (!response.ok) {
    const error = new Error(data.message || `HTTP error! status: ${response.status}`);
    error.status = response.status;
    error.response = { status: response.status, data };
    throw error;
  }

  return data;
};

export default {
  getDeliveryTypes,
  getShippingFee,
  getShippingFeeByUser,
};
