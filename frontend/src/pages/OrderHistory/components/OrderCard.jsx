import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Clock, CheckCircle, XCircle, Truck, ChevronRight, CreditCard } from 'lucide-react';
import Badge from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/utils/formatPrice';
import { normalizeImageUrl } from '@/utils/imageOptimizer';
import { ROUTES } from '@/config/routes';
import './OrderCard.css';

// Helper to parse MongoDB Decimal128
const parseDecimal = (value) => {
  if (!value) return 0;
  if (typeof value === 'object' && value.$numberDecimal) {
    return parseFloat(value.$numberDecimal);
  }
  return parseFloat(value) || 0;
};

const OrderCard = ({ order }) => {
  const navigate = useNavigate();

  const getStatusIcon = (status) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return <Clock size={16} />;
      case 'confirmed':
        return <Package size={16} />;
      case 'shipping':
        return <Truck size={16} />;
      case 'delivered':
        return <CheckCircle size={16} />;
      case 'cancelled':
      case 'returned':
        return <XCircle size={16} />;
      default:
        return <Package size={16} />;
    }
  };

  const getStatusVariant = (status) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'secondary';
      case 'confirmed':
        return 'default';
      case 'shipping':
        return 'default';
      case 'delivered':
        return 'success';
      case 'cancelled':
      case 'returned':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleClick = () => {
    navigate(`${ROUTES.ORDER_HISTORY}/${order._id}`);
  };

  // Check if order can be retried for payment
  const canRetryPayment = () => {
    const isPending = order.status?.toLowerCase() === 'pending';
    const isUnpaid = !order.isPaid && (order.paymentStatus?.toLowerCase() !== 'paid' && order.payment?.status?.toLowerCase() !== 'paid');
    const isOnlinePayment = ['zalopay', 'momo', 'vietqr'].includes(order.paymentMethod?.toLowerCase());
    return isPending && isUnpaid && isOnlinePayment;
  };

  const handleRetryPayment = (e) => {
    e.stopPropagation(); // Prevent card click
    navigate(`/payment/${order._id}`);
  };

  const totalAmount = parseDecimal(order.totalAmount);
  const itemCount = order.items?.length || 0;
  const firstItemName =
    order.items?.[0]?.productId?.name ||
    order.items?.[0]?.product?.name ||
    order.items?.[0]?.variantId?.productId?.name ||
    'Sản phẩm';

  // Get first item image for preview
  const previewImage = normalizeImageUrl(
    order.items?.[0]?.variantId?.imageUrls?.[0] ||
      order.items?.[0]?.productId?.imageUrls?.[0],
    '/placeholder.svg',
  );

  const showRetryButton = canRetryPayment();

  return (
    <div className="order-card order-card-clickable" onClick={handleClick}>
      <div className="order-card-content">
        <div className="order-preview-image">
          <img
            src={previewImage}
            alt="Order preview"
            loading="lazy"
            onError={(event) => {
              event.currentTarget.src = '/placeholder.svg';
            }}
          />
          {itemCount > 1 && (
            <span className="item-count-badge">+{itemCount - 1}</span>
          )}
        </div>
        
        <div className="order-info">
          <div className="order-header-info">
            <span className="order-id">Order #{order._id.slice(-8).toUpperCase()}</span>
            <span className="order-date">{formatDate(order.createdAt)}</span>
          </div>
          
          <div className="order-meta">
            <span className="item-summary">
              <span className="item-summary-name">{firstItemName}</span>
              <span className="item-summary-count">
                {itemCount > 1 ? `+${itemCount - 1} món` : '1 món'}
              </span>
            </span>
            <Badge variant={getStatusVariant(order.status)} className="order-status-badge">
              {getStatusIcon(order.status)}
              {order.status}
            </Badge>
          </div>
          
          {/* Retry Payment Button for stuck pending orders */}
          {showRetryButton && (
            <Button 
              size="sm" 
              variant="outline"
              className="retry-payment-btn"
              onClick={handleRetryPayment}
            >
              <CreditCard size={14} />
              Pay Now
            </Button>
          )}
        </div>
        
        <div className="order-end">
          <span className="order-total">{formatPrice(totalAmount)}</span>
          <ChevronRight size={20} className="chevron-icon" />
        </div>
      </div>
    </div>
  );
};

export default OrderCard;
