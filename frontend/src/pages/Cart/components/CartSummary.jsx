import React, { useState, useEffect } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatPrice } from '@/utils/formatPrice';
import { getShippingFeeByUser } from '@/services';
import { useAuth } from '@/hooks';
import './CartSummary.css';

const CartSummary = ({ subtotal, onCheckout, onContinueShopping }) => {
  const { user } = useAuth();
  const [shipping, setShipping] = useState(0);
  
  const total = subtotal + shipping;

  // Fetch shipping fee from backend
  useEffect(() => {
    const fetchShippingFee = async () => {
      if (subtotal === 0) {
        setShipping(0);
        return;
      }

      try {
        if (user?._id) {
          const response = await getShippingFeeByUser(user._id, {
            orderValue: subtotal,
            deliveryType: 'standard',
          });
          
          if (response.success) {
            setShipping(response.fee || 0);
          }
        } else {
          // For guests, estimate (will be calculated accurately at checkout)
          setShipping(subtotal >= 500000 ? 0 : 50000);
        }
      } catch (err) {
        const normalizedMessage = String(err?.message || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\u0111/g, 'd')
          .toLowerCase();
        if (!normalizedMessage.includes('dia chi mac dinh')) {
          console.error('Error fetching shipping fee:', err);
        }
        setShipping(subtotal >= 500000 ? 0 : 50000);
      }
    };

    fetchShippingFee();
  }, [subtotal, user]);

  return (
    <Card className="cart-summary-card">
      <h2 className="cart-summary-title">Order Summary</h2>

      {/* Price Breakdown */}
      <div className="summary-details">
        <div className="summary-row">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="summary-row">
          <span>Shipping</span>
          <span>{shipping === 0 ? 'FREE' : formatPrice(shipping)}</span>
        </div>
        {shipping === 0 && (
          <p className="free-shipping-notice">
            🎉 You got free shipping!
          </p>
        )}
        {shipping > 0 && subtotal < 500000 && (
          <p className="free-shipping-notice">
            Add {formatPrice(500000 - subtotal)} more for free shipping
          </p>
        )}
        <div className="summary-row summary-total">
          <span>Total</span>
          <span>{formatPrice(total)}</span>
        </div>
      </div>

      {/* Note: Discount codes can be applied at checkout */}

      {/* Action Buttons */}
      <div className="summary-actions">
        <Button
          size="lg"
          onClick={onCheckout}
          className="checkout-btn"
        >
          <ShoppingCart size={20} className="mr-2" />
          Proceed to Checkout
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={onContinueShopping}
          className="continue-btn"
        >
          Continue Shopping
        </Button>
      </div>
    </Card>
  );
};

export default CartSummary;
