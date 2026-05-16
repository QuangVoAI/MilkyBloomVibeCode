import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatPrice } from '@/utils/formatPrice';
import { parsePrice } from '@/utils/priceUtils';
import DiscountCodeInput from '@/components/common/DiscountCodeInput';
import LoyaltyPointsInput from './LoyaltyPointsInput';
import './OrderSummary.css';

const OrderSummary = ({
  cartItems,
  subtotal,
  shipping,
  discount,
  loyaltyPointsDiscount = 0,
  total,
  onSubmit,
  submitting,
  onDiscountApplied,
  onPointsApplied,
  disabled = false,
}) => {
  return (
    <Card className="order-summary-card">
      <h2 className="order-summary-title">Order Summary</h2>

      {/* Cart Items */}
      <div className="order-items">
        {cartItems.map((item) => {
          // Extract price, handling $numberDecimal format
          const price = parsePrice(
            item.price || item.variant?.price || item.product?.minPrice || item.product?.price || 0
          );
          
          // Use pre-computed imageUrl from transform, with fallbacks
          const imageUrl = item.imageUrl || 
            item.variant?.imageUrls?.[0] || 
            item.product?.imageUrls?.[0] || 
            '/placeholder.svg';
            
          const variantInfo = item.variant?.attributes?.length > 0 ? (
            item.variant.attributes.map((attr, idx) => (
              <React.Fragment key={`${item._id}-${attr.name}-${idx}`}>
                {attr.name}: {attr.value}{idx < item.variant.attributes.length - 1 ? ', ' : ''}
              </React.Fragment>
            ))
          ) : null;
          
          return (
            <div key={item._id} className="order-item">
              <img
                src={imageUrl}
                alt={item.product?.name || 'Product'}
                className="order-item-image"
                loading="lazy"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = '/placeholder.svg';
                }}
              />
              <div className="order-item-details">
                <h3 className="order-item-name">{item.product?.name || 'Product'}</h3>
                {variantInfo && <p className="order-item-variant">{variantInfo}</p>}
                <p className="order-item-quantity">Qty: {item.quantity || 0}</p>
              </div>
              <div className="order-item-price">
                {formatPrice(price * (item.quantity || 0))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Discount Code Input */}
      <DiscountCodeInput
        orderTotal={subtotal}
        onDiscountApplied={onDiscountApplied}
      />

      {/* Loyalty Points Input */}
      <LoyaltyPointsInput
        onPointsApplied={onPointsApplied}
        currentTotal={total}
      />

      {/* Price Breakdown */}
      <div className="order-totals">
        <div className="order-total-row">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="order-total-row">
          <span>Shipping</span>
          <span>{shipping === 0 ? 'FREE' : formatPrice(shipping)}</span>
        </div>
        {discount > 0 && (
          <div className="order-total-row order-discount">
            <span>Discount</span>
            <span className="discount-value">-{formatPrice(discount)}</span>
          </div>
        )}
        {loyaltyPointsDiscount > 0 && (
          <div className="order-total-row order-points-discount">
            <span>Loyalty Points</span>
            <span className="points-discount-value">-{formatPrice(loyaltyPointsDiscount)}</span>
          </div>
        )}
        <div className="order-total-row order-total-final">
          <span>Total</span>
          <span>{formatPrice(total)}</span>
        </div>
      </div>

      {/* Submit Button */}
      <Button
        size="lg"
        className="place-order-button"
        onClick={onSubmit}
        disabled={submitting || disabled}
      >
        {disabled ? 'Select Address' : 'Place Order'}
      </Button>
    </Card>
  );
};

export default OrderSummary;
