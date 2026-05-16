import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useOrders, useAuth } from '@/hooks';
import { useCartContext } from '@/context/CartContext';
import { ROUTES } from '@/config/routes';
import { payByCash, getShippingFeeByUser, getDeliveryTypes } from '@/services';

// Default delivery types (fallback)
const DEFAULT_DELIVERY_TYPES = [
  { id: 'economy', name: 'Economy Shipping', description: 'Delivered in 5-7 business days', estimatedDays: { min: 5, max: 7 }, available: true },
  { id: 'standard', name: 'Standard Shipping', description: 'Delivered in 3-5 business days', estimatedDays: { min: 3, max: 5 }, available: true },
  { id: 'express', name: 'Express Shipping', description: 'Delivered in 1-2 business days', estimatedDays: { min: 1, max: 2 }, available: true },
  { id: 'expedited', name: 'Expedited Shipping', description: 'Priority delivery with weather-adjusted fees', estimatedDays: { min: 0, max: 1 }, available: true },
];

// Estimate fees based on delivery type multipliers
const estimateFeesForTypes = (baseValue, types) => {
  const multipliers = { economy: 0.7, standard: 1, express: 1.5, expedited: 2 };
  const fees = {};
  types.forEach(type => {
    if (baseValue >= 500000 && type.id !== 'expedited') {
      fees[type.id] = 0; // Free shipping
    } else if (baseValue >= 500000 && type.id === 'expedited') {
      fees[type.id] = Math.round(50000 * (multipliers[type.id] || 1) * 0.7); // 30% off
    } else {
      fees[type.id] = Math.round(50000 * (multipliers[type.id] || 1));
    }
  });
  return fees;
};

export const useCheckout = () => {
  const navigate = useNavigate();
  const { cart, cartItems, cartSummary, loading: cartLoading, clearAllItems, refetch: refetchCart } = useCartContext();
  const { checkoutCart, loading: orderLoading } = useOrders();
  const { user } = useAuth();
  
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cashondelivery');
  const [deliveryType, setDeliveryType] = useState('standard');
  const [deliveryTypes, setDeliveryTypes] = useState(DEFAULT_DELIVERY_TYPES);
  const [discountInfo, setDiscountInfo] = useState({
    appliedCode: null,
    discountAmount: 0,
    isApplied: false,
  });
  const [loyaltyPointsUsed, setLoyaltyPointsUsed] = useState(0);
  const [shippingData, setShippingData] = useState(() => {
    // Initialize with estimated fees
    const initialFees = estimateFeesForTypes(0, DEFAULT_DELIVERY_TYPES);
    return {
      fee: initialFees.standard || 50000,
      fees: initialFees,
      weather: null,
      region: null,
    };
  });
  const [shippingLoading, setShippingLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState(null);

  // Calculate totals - shippingFee is derived from already-fetched fees, no re-fetch needed
  const subtotal = cartSummary.subtotal;
  const discount = discountInfo.discountAmount || 0;
  const shippingFee = shippingData.fees[deliveryType] ?? shippingData.fee;
  const total = Math.max(0, subtotal + shippingFee - discount - loyaltyPointsUsed);

  const loading = cartLoading || orderLoading;

  // Refetch cart on mount to ensure we have fresh data
  useEffect(() => {
    refetchCart();
  }, [refetchCart]);

  // Fetch delivery types on mount
  useEffect(() => {
    const fetchDeliveryTypes = async () => {
      try {
        const response = await getDeliveryTypes();
        if (response.success && response.deliveryTypes) {
          setDeliveryTypes(response.deliveryTypes);
        }
      } catch (err) {
        console.error('Error fetching delivery types:', err);
        // Keep default delivery types on error
      }
    };

    fetchDeliveryTypes();
  }, []);

  // Fetch shipping fees when address changes or subtotal changes (NOT when delivery type changes)
  // Delivery type just picks from already-fetched fees object
  const fetchShippingFees = useCallback(async (addressId) => {
    if (subtotal === 0) {
      setShippingData({ fee: 0, fees: {}, weather: null, region: null });
      return;
    }

    try {
      setShippingLoading(true);
      
      if (user?._id && addressId) {
        // Fetch fees for ALL delivery types at once (address-based)
        const allFees = {};
        let weatherData = null;
        let regionData = null;
        
        // Make parallel requests for all delivery types
        const promises = deliveryTypes.map(async (type) => {
          try {
            const response = await getShippingFeeByUser(user._id, {
              orderValue: subtotal,
              deliveryType: type.id,
              addressId, // Include the selected address
            });
            
            if (response.success) {
              return { 
                typeId: type.id, 
                fee: response.fee || 0,
                region: response.region,
                weather: response.weather,
              };
            }
          } catch (err) {
            console.error(`Error fetching fee for ${type.id}:`, err);
            return { typeId: type.id, fee: 50000 };
          }
        });

        const results = await Promise.all(promises);
        
        results.forEach(result => {
          if (result) {
            allFees[result.typeId] = result.fee;
            // Capture region and weather from first successful response
            if (!regionData && result.region) {
              regionData = result.region;
              weatherData = result.weather;
            }
          }
        });
        
        setShippingData({
          fees: allFees,
          fee: allFees.standard || 0,
          region: regionData,
          weather: weatherData,
        });
      } else {
        // For guests or no address selected, estimate based on threshold
        const estimatedFees = estimateFeesForTypes(subtotal, deliveryTypes);
        
        setShippingData({
          fee: estimatedFees.standard || 50000,
          fees: estimatedFees,
          weather: null,
          region: null,
        });
      }
    } catch (err) {
      console.error('Error fetching shipping fee:', err);
      const fallbackFees = estimateFeesForTypes(subtotal, deliveryTypes);
      setShippingData({
        fee: fallbackFees.standard || 50000,
        fees: fallbackFees,
        weather: null,
        region: null,
      });
    } finally {
      setShippingLoading(false);
    }
  }, [subtotal, user, deliveryTypes]); // Note: NO deliveryType dependency!

  // Fetch fees when address or subtotal changes
  useEffect(() => {
    fetchShippingFees(selectedAddressId);
  }, [selectedAddressId, subtotal, fetchShippingFees]);

  // Called from parent when address selection changes
  const handleAddressChange = useCallback((addressId) => {
    setSelectedAddressId(addressId);
  }, []);

  const handlePaymentMethodChange = (method) => {
    setPaymentMethod(method);
  };

  // Delivery type change is instant - just updates state, no API call
  const handleDeliveryTypeChange = (type) => {
    setDeliveryType(type);
  };

  const handleSubmitOrder = async (addressId) => {
    // Handle both addressId (string) and address object (for guests)
    const isGuestAddress = typeof addressId === 'object';
    
    if (!addressId) {
      toast.error('Please select a delivery address');
      return;
    }

    const cartId = cart?._id || cart?.id;
    if (!cartId) {
      toast.error('Cart not found');
      return;
    }

    // Prevent double submission
    if (submitting) {
      return;
    }

    // Check if cart has items before attempting checkout
    if (!cartItems || cartItems.length === 0) {
      toast.error('Your cart is empty');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Prepare checkout data
      let checkoutData;
      
      if (isGuestAddress) {
        // Use the same sessionId as the cart (not guestSessionId)
        const sessionId = localStorage.getItem('sessionId');
        
        // Store guest email for order verification later
        if (addressId.email) {
          localStorage.setItem('guestEmail', addressId.email);
        }
        
        checkoutData = {
          sessionId,
          guestInfo: {
            fullName: addressId.fullNameOfReceiver,
            email: addressId.email || '',
            phone: addressId.phone,
            addressLine: addressId.addressLine,
            lat: addressId.lat || null,
            lng: addressId.lng || null,
          },
          paymentMethod,
          deliveryType,
          discountCodeId: discountInfo.appliedCode?.discountCodeId || discountInfo.appliedCode?._id || null,
          pointsToUse: loyaltyPointsUsed,
        };
      } else {
        checkoutData = {
          addressId,
          paymentMethod,
          deliveryType,
          discountCodeId: discountInfo.appliedCode?.discountCodeId || discountInfo.appliedCode?._id || null,
          pointsToUse: loyaltyPointsUsed,
        };
      }

      // Submit order via cart checkout
      const order = await checkoutCart(checkoutData);

      // Get order ID first before clearing cart
      const orderId = order._id || order.id;

      // Clear cart after successful order.
      // This is non-critical: if it fails, the order is still valid and we
      // should not block the user from continuing to the success page.
      try {
        await clearAllItems();
      } catch (clearErr) {
        console.warn('Failed to clear cart after order placement:', clearErr);
      }

      // Redirect based on payment method
      // NOTE: Don't set submitting=false here, let the navigation happen while still "submitting"
      // This prevents the "Your cart is empty" flash
      if (paymentMethod === 'cod' || paymentMethod === 'cashondelivery') {
        try {
          await payByCash(orderId);
        } catch (err) {
          console.error('payByCash error:', err);
          toast.warning('Order placed but payment status not recorded. Please check your order.');
        }

        toast.success('Order placed successfully!', {
          description: `Order #${orderId}`,
        });
        navigate(`/orders/${orderId}`, {
          state: { orderSuccess: true },
          replace: true, // Prevent going back to checkout
        });
      } else {
        navigate(`/payment/${orderId}`, { replace: true });
      }
      
      // Keep submitting true - component will unmount during navigation
      return;
    } catch (err) {
      console.error('Error submitting order:', err);
      const errorMessage = err.message || 'Failed to submit order. Please try again.';
      setError(errorMessage);
      toast.error('Order failed', {
        description: errorMessage,
      });
      // Only set submitting false on error
      setSubmitting(false);
    }
  };

  const handleDiscountApplied = (info) => {
    setDiscountInfo(info);
  };

  const handlePointsApplied = (points) => {
    setLoyaltyPointsUsed(points);
  };

  return {
    cartItems,
    paymentMethod,
    deliveryType,
    deliveryTypes,
    subtotal,
    shipping: shippingFee,
    shippingFees: shippingData.fees,
    shippingWeather: shippingData.weather,
    discount: discountInfo.discountAmount || 0,
    loyaltyPointsDiscount: loyaltyPointsUsed,
    total,
    loading,
    shippingLoading,
    error,
    submitting,
    handlePaymentMethodChange,
    handleDeliveryTypeChange,
    handleAddressChange,
    handleSubmitOrder,
    handleDiscountApplied,
    handlePointsApplied,
  };
};
