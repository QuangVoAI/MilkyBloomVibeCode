import { API_BASE_URL } from './config';
import { handleResponse } from '../utils/apiHelpers';
import { getAuthToken } from '../utils/authHelpers';

export const getActiveBannerVideo = async () => {
  const response = await fetch(`${API_BASE_URL}/media/banner-video`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return handleResponse(response);
};

export const uploadBannerVideo = async (formData) => {
  const token = getAuthToken();
  const headers = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/media/banner-video`, {
    method: 'POST',
    headers,
    body: formData,
  });

  return handleResponse(response);
};
