import apiClient from './config';

/**
 * Cart Service
 * Handles all cart-related API calls
 * 
 * Backend endpoints:
 * - GET /carts/user/:userId - Get cart by user ID (auth required)
 * - GET /carts/session/:sessionId - Get cart by session ID (guest)
 * - POST /carts - Create new cart
 * - POST /carts/:cartId/items - Add item to cart { variantId, quantity }
 * - POST /carts/:cartId/remove-item - Remove/decrease item { variantId, quantity }
 * - DELETE /carts/:cartId/clear - Clear all items
 */

// Get all carts (admin only)
export const getAllCarts = async () => {
  return await apiClient.get('/carts');
};

// Get cart by user ID
export const getCartByUser = async (userId, options = {}) => {
  return await apiClient.get(`/carts/user/${userId}`, options);
};

// Get cart by session ID (for guests)
export const getCartBySession = async (sessionId, options = {}) => {
  return await apiClient.get(`/carts/session/${sessionId}`, {
    params: { allowEmpty: true },
    ...options,
  });
};

// Create cart
export const createCart = async (cartData) => {
  return await apiClient.post('/carts', cartData);
};

// Clear cart
export const clearCart = async (cartId) => {
  return await apiClient.delete(`/carts/${cartId}/clear`);
};

// Delete cart
export const deleteCart = async (cartId) => {
  return await apiClient.delete(`/carts/${cartId}`);
};

/**
 * Add item to cart
 * @param {Object} params - { cartId, variantId, quantity, signal }
 * @returns {Promise<Object>} - Updated cart with items
 */
export const addItemToCart = async ({ cartId, variantId, quantity, signal }) => {
  const response = await apiClient.post(`/carts/${cartId}/items`, { variantId, quantity }, { signal });
  return response;
};

/**
 * Remove/decrease item from cart
 * @param {string} cartId - Cart ID
 * @param {Object} itemData - { variantId, quantity, signal }
 * @returns {Promise<Object>} - Updated cart
 */
export const removeItemFromCart = async (cartId, itemData) => {
  const { signal, ...data } = itemData;
  const response = await apiClient.post(`/carts/${cartId}/remove-item`, data, { signal });
  return response;
};

// Legacy aliases for backwards compatibility
export const createCartItem = ({ cartId, variantId, quantity }) => 
  addItemToCart({ cartId, variantId, quantity });
export const updateCartItem = async ({ cartId, variantId, quantity }) => {
  // For quantity updates, we need to calculate the difference
  // and call addItem or removeItem accordingly
  return await addItemToCart({ cartId, variantId, quantity });
};
export const deleteCartItem = removeItemFromCart;
export const getCartItems = async (cartId) => {
  // Items are included in the cart response
  const cart = await getCartBySession(cartId).catch(() => null);
  return cart?.items || [];
};

export default {
  getAllCarts,
  getCartByUser,
  getCartBySession,
  createCart,
  clearCart,
  deleteCart,
  addItemToCart,
  removeItemFromCart,
  // Legacy
  createCartItem,
  updateCartItem,
  deleteCartItem,
  getCartItems,
};
