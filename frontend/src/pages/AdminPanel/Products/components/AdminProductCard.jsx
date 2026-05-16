import React from 'react';
import { Package, Eye, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { formatPrice } from '@/utils/formatPrice';
import { parsePrice } from '@/utils/priceUtils';
import OptimizedImage from '@/components/ui/OptimizedImage';
import './AdminProductCard.css';

/**
 * Admin-specific Product Card with management features
 */
const AdminProductCard = ({ 
  product, 
  onClick,
  onEdit,
  onDelete,
  showBadges = true,
  showStock = true,
  showRating = true,
  showCategory = true
}) => {
  if (!product) return null;

  const hasVariants = product.variants && product.variants.length > 0;
  const minPrice = parsePrice(product.minPrice);
  const singlePrice = parsePrice(product.price);
  const priceDisplay = hasVariants && minPrice ? formatPrice(minPrice) : formatPrice(singlePrice);

  const imageUrl = product.imageUrls?.[0] || '/placeholder.svg';
  const categoryName = product.category?.name || product.categoryId?.[0]?.name || product.categoryId?.name || 'Uncategorized';
  
  // Calculate total stock: use variants sum if available, fallback to totalStock field
  const totalStock = hasVariants 
    ? product.variants.reduce((sum, v) => sum + (v.stockQuantity || 0), 0)
    : (product.totalStock ?? 0);

  const handleCardClick = () => {
    onClick?.(product);
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit?.(product);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete?.(product._id);
  };

  return (
    <div 
      className={`admin-product-card ${totalStock === 0 ? 'out-of-stock' : ''}`}
      onClick={handleCardClick}
    >
      <div className="admin-product-image">
        <OptimizedImage 
          src={imageUrl} 
          alt={product.name} 
          className="w-full h-full object-cover"
          containerClassName="w-full h-full"
          aspectRatio="1/1"
          placeholder="blur"
        />
        
        {showBadges && (
          <div className="badge-stack">
            {product.isNew && <span className="badge badge-new">New</span>}
            {product.isFeatured && <span className="badge badge-featured">Featured</span>}
          </div>
        )}
        
        {/* Priority: Disabled > Out of Stock > Archived > Draft */}
        {product.status === 'Disabled' ? (
          <>
            <div className="disabled-mask"></div>
            <div className="caution-ribbon">
              <span className="caution-icon">DISABLED</span>
            </div>
          </>
        ) : totalStock === 0 ? (
          <div className="disabled-overlay">
            <span className="disabled-text">Out of Stock</span>
          </div>
        ) : product.status === 'Archived' ? (
          <div className="archived-overlay">
            <span className="archived-text">Archived</span>
          </div>
        ) : product.status === 'Draft' ? (
          <div className="draft-overlay">
            <span className="draft-text">Draft</span>
          </div>
        ) : null}
      </div>

      <div className="admin-product-content">
        {showCategory && (
          <p className="admin-product-category">{categoryName}</p>
        )}
        
        <h3 className="admin-product-name">{product.name}</h3>

        <div className="admin-product-price-section">
          <p className="admin-product-price">{priceDisplay}</p>
          {product.originalPrice && (
            <p className="admin-product-original-price">
              {formatPrice(product.originalPrice.$numberDecimal || product.originalPrice)}
            </p>
          )}
        </div>

        {(showStock || showRating) && (
          <div className="admin-product-meta">
            {showStock && (
              <div className="admin-product-stock">
                <Package size={16} />
                <span className={totalStock === 0 ? 'out-of-stock' : ''}>
                  Stock: {totalStock}
                </span>
              </div>
            )}
            <div className="admin-product-sold">
              <span>📦</span>
              <span>Sold: {(product.totalUnitsSold || 0).toLocaleString()}</span>
            </div>
            {showRating && product.averageRating !== undefined && (
              <div className="admin-product-rating">
                <span>⭐</span>
                <span>{product.averageRating.toFixed(1)}</span>
              </div>
            )}
          </div>
        )}

        <div className="admin-product-actions">
          {onClick && (
            <button className="action-btn action-view" onClick={handleCardClick}>
              <Eye size={16} />
            </button>
          )}
          {onEdit && (
            <button className="action-btn action-edit" onClick={handleEdit}>
              <Edit size={16} />
            </button>
          )}
          {onDelete && (
            <button className="action-btn action-delete" onClick={handleDelete}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminProductCard;
