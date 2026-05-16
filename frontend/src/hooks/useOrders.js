import { useState, useEffect, useCallback } from 'react';
import {
  getMyOrders,
  getAllOrders,
  getOrderById,
  createOrder,
  checkoutFromCart,
  guestCheckoutFromCart,
  updateOrderStatus,
  cancelOrder,
} from '../services';
import { useAuth } from './useAuth';

/**
 * Custom hook for order management
 * Handles order creation, fetching, and status updates
 * Backend response format: { success: true/false, order/orders: {...}, message?: '...' }
 */
export const useOrders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  // Fetch user's orders with pagination
  const fetchMyOrders = useCallback(async (params = {}) => {
    const userId = user?._id || user?.id;
    if (!userId) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await getMyOrders(params);
      
      // Backend returns { success: true, orders: [...], total, page, limit, totalPages }
      let ordersArray = [];
      
      if (Array.isArray(response)) {
        // Direct array response (legacy)
        ordersArray = response;
      } else if (response?.success && response?.orders) {
        // Wrapped in success object with pagination
        ordersArray = response.orders;
        const nextPagination = {
          total: response.total || ordersArray.length,
          page: response.page || 1,
          limit: response.limit || 10,
          totalPages: response.totalPages || 1
        };
        setPagination(nextPagination);
      } else if (response?.orders) {
        // Just orders property
        ordersArray = response.orders;
      }
      
      setOrders(ordersArray);
      return ordersArray;
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to fetch orders';
      setError(errorMsg);
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch all orders (admin only)
  const fetchAllOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await getAllOrders();
      // Backend returns { success: true, orders: [...] }
      if (response.success && response.orders) {
        setOrders(response.orders);
      } else {
        throw new Error(response.message || 'Failed to fetch all orders');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to fetch all orders';
      setError(errorMsg);
      console.error('Error fetching all orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch single order by ID
  const fetchOrderById = useCallback(async (orderId) => {
    try {
      setLoading(true);
      setError(null);

      const response = await getOrderById(orderId);
      // Backend returns { success: true, data: {...} }
      if (response.success && response.data) {
        setCurrentOrder(response.data);
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to fetch order details');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to fetch order details';
      setError(errorMsg);
      console.error('Error fetching order details:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize orders on mount
  useEffect(() => {
    const userId = user?._id || user?.id;
    if (userId) {
      fetchMyOrders();
    }
  }, [user, fetchMyOrders]);

  // Create order directly
  const placeOrder = useCallback(
    async (orderData) => {
      try {
        setLoading(true);
        setError(null);

        const response = await createOrder(orderData);
        // Backend returns { success: true, order: {...} }
        if (response.success && response.order) {
          setCurrentOrder(response.order);
          return response.order;
        } else {
          throw new Error(response.message || 'Failed to create order');
        }
      } catch (err) {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to create order';
        setError(errorMsg);
        console.error('Error creating order:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Checkout from cart
  const checkoutCart = useCallback(
    async (checkoutData) => {
      try {
        setLoading(true);
        setError(null);

        const userId = user?._id || user?.id;
        const response = userId
          ? await checkoutFromCart(checkoutData) 
          : await guestCheckoutFromCart(checkoutData);

        // Backend returns { success: true, data: {...} }
        if (response.success && response.data) {
          setCurrentOrder(response.data);

          // Refresh orders list
          const userId = user?._id || user?.id;
          if (userId) {
            await fetchMyOrders();
          }

          return response.data;
        } else {
          throw new Error(response.message || 'Failed to checkout from cart');
        }
      } catch (err) {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to checkout from cart';
        setError(errorMsg);
        console.error('Error checking out from cart:', err);
        console.error('Error response:', err.response);
        console.error('Error details:', err.response?.data);
        throw new Error(errorMsg);
      } finally {
        setLoading(false);
      }
    },
    [user, fetchMyOrders]
  );

  // Update order status (admin only)
  const updateStatus = useCallback(
    async (orderId, status) => {
      try {
        setLoading(true);
        setError(null);

        const response = await updateOrderStatus(orderId, status);
        // Backend returns { success: true, order: {...}, newBadges: [...] }
        if (response.success && response.order) {
          const updatedOrder = response.order;

          // Update orders list
          setOrders((prev) => prev.map((order) => (order._id === orderId ? updatedOrder : order)));

          // Update current order if it's the one being updated
          if (currentOrder?._id === orderId) {
            setCurrentOrder(updatedOrder);
          }

          // New badges unlocked
          if (response.newBadges && response.newBadges.length > 0) {
            // TODO: Show badge notification to user
          }

          return updatedOrder;
        } else {
          throw new Error(response.message || 'Failed to update order status');
        }
      } catch (err) {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to update order status';
        setError(errorMsg);
        console.error('Error updating order status:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [currentOrder]
  );

  // Cancel order
  const cancelCurrentOrder = useCallback(
    async (orderId) => {
      try {
        setLoading(true);
        setError(null);

        const response = await cancelOrder(orderId);
        // Backend returns { success: true, order: {...} }
        if (response.success && response.order) {
          const cancelledOrder = response.order;

          // Update orders list
          setOrders((prev) => prev.map((order) => (order._id === orderId ? cancelledOrder : order)));

          // Update current order if it's the one being cancelled
          if (currentOrder?._id === orderId) {
            setCurrentOrder(cancelledOrder);
          }

          // Refresh orders list
          const userId = user?._id || user?.id;
          if (userId) {
            await fetchMyOrders();
          }

          return cancelledOrder;
        } else {
          throw new Error(response.message || 'Failed to cancel order');
        }
      } catch (err) {
        const errorMsg = err.response?.data?.message || err.message || 'Failed to cancel order';
        setError(errorMsg);
        console.error('Error cancelling order:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [currentOrder, user, fetchMyOrders]
  );

  // Filter orders by status
  const getOrdersByStatus = useCallback(
    (status) => {
      return orders.filter((order) => order.status === status);
    },
    [orders]
  );

  // Calculate order statistics
  const orderStats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    confirmed: orders.filter((o) => o.status === 'confirmed').length,
    shipping: orders.filter((o) => o.status === 'shipping').length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
    returned: orders.filter((o) => o.status === 'returned').length,
    totalSpent: orders.reduce((sum, order) => {
      const amount = order.totalAmount?.$numberDecimal || order.totalAmount || 0;
      return sum + parseFloat(amount);
    }, 0),
  };

  return {
    orders,
    currentOrder,
    loading,
    error,
    pagination,
    orderStats,
    fetchMyOrders,
    fetchAllOrders,
    fetchOrderById,
    placeOrder,
    checkoutCart,
    updateStatus,
    cancelCurrentOrder,
    getOrdersByStatus,
  };
};
