import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner, ErrorMessage } from '@/components/common';
import { ROUTES } from '@/config/routes';
import OrderSummary from './components/OrderSummary';
import ShippingForm from './components/ShippingForm';
import PaymentMethodSelector from './components/PaymentMethodSelector';
import DeliveryTypeSelector from './components/DeliveryTypeSelector';
import { useCheckout } from './hooks/useCheckout';
import { normalizeImageUrl } from '@/utils/imageOptimizer';
import './Checkout.css';

/**
 * Transform backend cart item to frontend format
 * Backend CartItem toJSON transforms:
 * - productId → product (populated Product object)
 * - variantId → variant (populated Variant object)
 * 
 * Handle both old structure (variant not populated) and new structure (variant populated)
 */
const transformCartItem = (item) => {
  // Get variant - now populated as full object with imageUrls
  const variant = item.variant || null;
  
  // Get product - directly from item.product (populated productId)
  // Fallback: if variant has productId populated (nested), use that
  const product = item.product || variant?.productId || null;
  
  // Get variant ID
  const variantIdStr = variant?._id || variant?.id || item.variantId;

  // Get the best image URL available
  // Priority: variant.imageUrls[0] > product.imageUrls[0] > placeholder
  const getImageUrl = () => {
    if (variant?.imageUrls?.length > 0) {
      return normalizeImageUrl(variant.imageUrls[0]);
    }
    if (product?.imageUrls?.length > 0) {
      return normalizeImageUrl(product.imageUrls[0]);
    }
    return '/placeholder.svg';
  };

  return {
    _id: variantIdStr || item._id || item.id,
    variantId: variantIdStr,
    product: product,
    variant: variant,
    quantity: item.quantity,
    price: item.price,
    imageUrl: getImageUrl(),
  };
};

const Checkout = () => {
  const navigate = useNavigate();

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  
  const {
    cartItems,
    paymentMethod,
    deliveryType,
    deliveryTypes,
    subtotal,
    shipping,
    shippingFees,
    shippingWeather,
    discount,
    loyaltyPointsDiscount,
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
  } = useCheckout();

  // Track selected address locally for form display
  const [selectedAddressId, setSelectedAddressId] = useState(null);

  // When address changes, notify the hook to recalculate shipping
  const onAddressSelect = useCallback((addressId) => {
    setSelectedAddressId(addressId);
    handleAddressChange(addressId);
  }, [handleAddressChange]);

  // Transform cart items for display
  const transformedItems = useMemo(() => {
    if (!cartItems) return [];
    return cartItems.map(transformCartItem);
  }, [cartItems]);

  // Redirect to cart if cart is empty (and not loading/submitting)
  useEffect(() => {
    if (!loading && !submitting && (!transformedItems || transformedItems.length === 0)) {
      navigate(ROUTES.CART, { replace: true });
    }
  }, [loading, submitting, transformedItems, navigate]);

  // Only show full loading for cart/order loading, not shipping fee updates
  if (loading && !cartItems?.length) {
    return (
      <div className="checkout-loading">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="checkout-error">
        <ErrorMessage message={error} />
        <Button onClick={() => navigate(ROUTES.CART)}>Back to Cart</Button>
      </div>
    );
  }

  // Show loading during order submission (even if cart is empty due to clearing)
  if (submitting) {
    return (
      <div className="checkout-loading">
        <LoadingSpinner />
      </div>
    );
  }

  // If cart is empty, redirect to cart page (which has the empty cart UI)
  // Show loading while redirect happens
  if (!transformedItems || transformedItems.length === 0) {
    return (
      <div className="checkout-loading">
        <LoadingSpinner />
      </div>
    );
  }

  const handleCheckout = () => {
    handleSubmitOrder(selectedAddressId);
  };

  return (
    <div className="checkout-container">
      {/* Header */}
      <div className="checkout-header">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(ROUTES.CART)}
          className="back-button"
        >
          <ChevronLeft size={20} />
          Back to Cart
        </Button>
        <h1 className="checkout-title">Checkout</h1>
      </div>

      <div className="checkout-content">
        {/* Left Column - Forms */}
        <div className="checkout-forms">
          {/* Shipping Information */}
          <ShippingForm
            selectedAddressId={selectedAddressId}
            onAddressSelect={onAddressSelect}
          />

          {/* Delivery Type Selection */}
          <DeliveryTypeSelector
            deliveryTypes={deliveryTypes}
            selectedType={deliveryType}
            onSelect={handleDeliveryTypeChange}
            shippingFees={shippingFees}
            weather={shippingWeather}
            loading={shippingLoading}
            orderValue={subtotal}
          />

          {/* Payment Method */}
          <PaymentMethodSelector
            selectedMethod={paymentMethod}
            onChange={handlePaymentMethodChange}
          />
        </div>

        {/* Right Column - Order Summary */}
        <div className="checkout-summary">
          <OrderSummary
            cartItems={transformedItems}
            subtotal={subtotal}
            shipping={shipping}
            discount={discount}
            loyaltyPointsDiscount={loyaltyPointsDiscount}
            total={total}
            onSubmit={handleCheckout}
            submitting={submitting}
            onDiscountApplied={handleDiscountApplied}
            onPointsApplied={handlePointsApplied}
            disabled={!selectedAddressId}
          />
        </div>
      </div>
    </div>
  );
};

export default Checkout;
