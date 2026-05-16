import React from 'react';
import { ShoppingCart, Star } from 'lucide-react';
import { formatPrice } from '@/utils/formatPrice';
import { parsePrice } from '@/utils/priceUtils';
import OptimizedImage from '@/components/ui/OptimizedImage';
import './ProductCard.css';

/**
 * Simplified Product Card Component
 * Style this component where it's used by adding custom CSS classes via the className prop
 * 
 * @param {Object} product - Product data object
 * @param {Function} onClick - Card click handler (navigates to product detail)
 * @param {Function} onQuickView - Quick view button handler
 * @param {Function} onAddToCart - Add to cart button handler
 * @param {boolean} showBadges - Show product badges (New, Featured, etc.)
 * @param {boolean} showCategory - Show category name below product name
 * @param {boolean} showQuickView - Show quick view overlay button on hover
 * @param {boolean} showRating - Show rating instead of add to cart button
 * @param {string} className - Additional CSS classes for custom styling
 * @param {React.ReactNode} children - Optional additional content (for custom buttons, badges, etc.)
 */
const ProductCard = ({ 
  product, 
  onClick,
  onQuickView,
  onAddToCart,
  showBadges = true,
  showCategory = true,
  showQuickView = true,
  showRating = false,
  className = '',
  children
}) => {
  if (!product) return null;

  // Handle price display - always show min price
  const hasVariants = product.variants && product.variants.length > 0;
  const minPrice = parsePrice(product.minPrice);
  const singlePrice = parsePrice(product.price);
  const priceDisplay = hasVariants && minPrice ? formatPrice(minPrice) : formatPrice(singlePrice);

  const imageUrl = product.imageUrls?.[0] || '/placeholder.svg';
  
  // Safely extract category name (check both category and categoryId for search results)
  let categoryName = 'Uncategorized';
  if (product.category && typeof product.category === 'object') {
    // Atlas Search returns category object
    categoryName = product.category.name || 'Uncategorized';
  } else if (Array.isArray(product.categoryId)) {
    categoryName = product.categoryId[0]?.name || 'Uncategorized';
  } else if (product.categoryId && typeof product.categoryId === 'object') {
    categoryName = product.categoryId.name || 'Uncategorized';
  } else if (typeof product.categoryId === 'string') {
    categoryName = product.categoryId;
  }
  
  // Calculate total stock: use variants sum if available, fallback to totalStock field
  const hasVariantsForStock = product.variants && product.variants.length > 0;
  const totalStock = hasVariantsForStock 
    ? product.variants.reduce((sum, v) => sum + (v.stockQuantity || 0), 0)
    : (product.totalStock ?? product.stockQuantity ?? 0);
  
  // Sold count for bestsellers
  const soldCount = product.totalUnitsSold || product.soldCount || 0;

  const handleCardClick = () => {
    onClick?.(product);
  };

  const handleAddToCart = (e) => {
    e.stopPropagation();
    onAddToCart?.(product);
  };

  const handleQuickView = (e) => {
    e.stopPropagation();
    onQuickView?.(product);
  };

  return (
    <div 
      className={`product-card ${totalStock === 0 ? 'out-of-stock' : ''} ${className}`} 
      onClick={handleCardClick}
    >
      <div className="product-image-wrapper">
        <OptimizedImage
          src={imageUrl}
          alt={product.name}
          className="product-image"
          containerClassName="w-full h-full"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
          aspectRatio="1/1"
          placeholder="blur"
          placeholderColor="#f3f4f6"
        />
        {showBadges && product.isNew && (
          <div className="badge-container">
            <span className="badge badge-new">New</span>
          </div>
        )}
        {totalStock === 0 && (
          <div className="out-of-stock-overlay">
            <span className="out-of-stock-text">Out of Stock</span>
          </div>
        )}
      </div>

      <div className="product-info">
        <h3 className="product-name">{product.name}</h3>
        {showCategory && (
          <p className="product-category">{categoryName}</p>
        )}
        
        <div className="product-footer">
          <div className="product-price">
            <span className="current-price">{priceDisplay}</span>
          </div>
          
          {soldCount > 0 && (
            <span className="product-sold" style={{ fontSize: '12px', color: '#64748b', marginRight: 'auto' }}>
              {soldCount.toLocaleString()} sold
            </span>
          )}
          
          {onAddToCart ? (
            <button 
              className="add-to-cart-btn" 
              onClick={handleAddToCart}
              aria-label="Add to cart"
            >
              <ShoppingCart size={18} />
            </button>
          ) : showRating ? (
            <div className="product-rating" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', color: '#64748b', marginRight: '8px' }}>
              <Star size={16} fill="#fbbf24" stroke="#fbbf24" />
              <span>{product.averageRating?.toFixed(1) || '0.0'}</span>
            </div>
          ) : null}
        </div>
      </div>

      {showQuickView && onQuickView && (
        <div className="product-hover-overlay">
          <button 
            className="quick-view-btn"
            onClick={handleQuickView}
          >
            Quick View
          </button>
        </div>
      )}

      {children}
    </div>
  );
};

export default ProductCard;
