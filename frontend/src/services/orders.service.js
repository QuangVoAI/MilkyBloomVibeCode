import apiClient from './config';

/**
 * Orders Service
 * Handles all order-related API calls
 * Backend routes:
 * - GET /orders - Get user's orders (auth required)
 * - GET /orders/:id - Get order detail (auth required)
 * - POST /orders - Create order
 * - POST /orders/checkout/cart - Checkout from cart (auth required)
 * - POST /orders/checkout/cart/guest - Checkout from cart (guest)
 * - PUT /orders/:id/status - Update order status (admin only)
 */

// Get all orders for authenticated user
export const getMyOrders = async (params = {}) => {
  const response = await apiClient.get('/orders', { params });
  return response;
};

// Get all orders (admin only) - using query params to differentiate
export const getAllOrders = async (params = {}) => {
  const response = await apiClient.get('/orders/admin/all', { params });
  return response;
};

// Get single order detail
export const getOrderById = async (orderId, options = {}) => {
  // Check if user is authenticated
  const token = localStorage.getItem('authToken');
  const lookupToken = options.lookupToken || localStorage.getItem(`orderLookupToken:${orderId}`);
  
  if (lookupToken) {
    try {
      const response = await apiClient.get(`/orders/${orderId}/guest`, {
        params: {
          lookupToken,
        },
      });
      return response;
    } catch (err) {
      const status = err.response?.status || err.status;
      if (!token || (status && status !== 403)) {
        throw err;
      }
      // If lookup token is stale but user is actually the owner, fall back to auth route.
    }
  }

  if (token) {
    // Authenticated user - backend will verify ownership
    const response = await apiClient.get(`/orders/${orderId}`);
    return response;
  } else {
    // Guest user - pass sessionId and stored email for verification
    const sessionId = localStorage.getItem('sessionId');
    const guestEmail = localStorage.getItem('guestEmail'); // Set during guest checkout
    
    const response = await apiClient.get(`/orders/${orderId}/guest`, {
      params: { 
        sessionId,
        email: guestEmail 
      }
    });
    return response;
  }
};

export const requestOrderLookupOtp = async (orderId) => {
  const response = await apiClient.post(`/orders/${orderId}/lookup/request-otp`, {});
  return response;
};

export const verifyOrderLookupOtp = async (orderId, otp) => {
  const response = await apiClient.post(`/orders/${orderId}/lookup/verify-otp`, { otp });
  return response;
};

// Create order directly
export const createOrder = async (orderData) => {
  const response = await apiClient.post('/orders', orderData);
  return response;
};

// Checkout from cart (authenticated user)
export const checkoutFromCart = async (checkoutData) => {
  // checkoutData should include: addressId, discountCodeId, pointsToUse, voucherId, paymentMethod, deliveryType
  const response = await apiClient.post('/orders/checkout/cart', checkoutData);
  return response;
};

// Checkout from cart (guest)
export const guestCheckoutFromCart = async (checkoutData) => {
  // checkoutData should include: sessionId, guestInfo (fullName, email, phone, addressLine, lat, lng), discountCodeId, pointsToUse
  const response = await apiClient.post('/orders/checkout/cart/guest', checkoutData);
  return response;
};

// Update order status (admin only)
export const updateOrderStatus = async (orderId, status) => {
  const response = await apiClient.put(`/orders/${orderId}/status`, { status });
  return response;
};

// Cancel order (user/guest can cancel their own pending orders)
export const cancelOrder = async (orderId) => {
  const response = await apiClient.put(`/orders/${orderId}/cancel`);
  return response;
};

// Get orders by discount code ID (admin only)
export const getOrdersByDiscountCode = async (discountCodeId) => {
  const response = await apiClient.get(`/orders/discount/${discountCodeId}`);
  return response;
};

export default {
  getMyOrders,
  getAllOrders,
  getOrderById,
  requestOrderLookupOtp,
  verifyOrderLookupOtp,
  createOrder,
  checkoutFromCart,
  guestCheckoutFromCart,
  updateOrderStatus,
  cancelOrder,
  getOrdersByDiscountCode,
};
