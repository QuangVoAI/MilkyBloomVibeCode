import React from 'react';
import { useNavigate } from 'react-router-dom';
import { normalizeImageUrl } from '@/utils/imageOptimizer';
import { buildProductPath } from '@/utils/productRouting';

const HeroSlide = ({ product, isFirst = false }) => {
  const navigate = useNavigate();
  
  const productImage = normalizeImageUrl(product.imageUrls?.[0]);
  const description = product.description?.length > 100
    ? product.description.substring(0, 100) + '...'
    : product.description;

  return (
    <div className="item">
      <img 
        src={productImage} 
        alt={product.name} 
        loading={isFirst ? "eager" : "lazy"}
        fetchPriority={isFirst ? "high" : "auto"}
      />
      <div className="introduce">
        <div className="tag">Top Picks</div>
        <div className="name">{product.name || 'Featured Product'}</div>
        <div className="des">{description}</div>
        <button className="cta-button" onClick={() => navigate(buildProductPath(product))}>
          Shop Now <span className="arrow">→</span>
        </button>
      </div>
    </div>
  );
};

export default HeroSlide;
