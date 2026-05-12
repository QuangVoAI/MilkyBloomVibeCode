import { useState, useEffect } from 'react';
import { getOrderById } from '@/services/orders.service';

/**
 * Hook to fetch detailed order information
 * Uses the backend endpoint GET /orders/:id
 * Returns order with items, history, shipping, payment details
 */
export const useOrderDetail = (orderId, lookupToken = '') => {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);
  const [errorCode, setErrorCode] = useState(null);

  useEffect(() => {
    const fetchOrderDetail = async () => {
      if (!orderId) {
        setError('Order ID is required');
        setErrorStatus(400);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        setErrorStatus(null);
        setErrorCode(null);
        
        const response = await getOrderById(orderId, { lookupToken });
        
        if (response.success) {
          setOrder(response.data);
        } else {
          setError(response.message || 'Failed to load order details');
          setErrorStatus(response.status || null);
          setErrorCode(response.code || response.data?.code || null);
        }
      } catch (err) {
        console.error('Error fetching order detail:', err);
        setError(err.response?.data?.message || err.message || 'Failed to load order details');
        setErrorStatus(err.response?.status || err.status || null);
        setErrorCode(err.response?.data?.code || err.response?.data?.errorCode || null);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderDetail();
  }, [orderId, lookupToken]);

  return { order, loading, error, errorStatus, errorCode };
};
