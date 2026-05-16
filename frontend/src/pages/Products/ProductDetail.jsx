import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { LoadingSpinner, ErrorMessage } from '@/components/common';
import { Button } from '@/components/ui/button';
import { useProductDetail } from '@/hooks';
import { useCartContext } from '@/context/CartProvider';
import { ROUTES } from '@/config/routes';
import { getReviewStats } from '@/services/reviews.service';
import './ProductDetail.css';

// Lazy load below-the-fold components
const ProductImageGallery = lazy(() => import('./components/ProductImageGallery'));
const ProductInfo = lazy(() => import('./components/ProductInfo'));
const ProductVariantSelector = lazy(() => import('./components/ProductVariantSelector'));
const ProductActions = lazy(() => import('./components/ProductActions'));
const ProductTabs = lazy(() => import('./components/ProductTabs'));
const ReviewSection = lazy(() => import('./components/ReviewSection'));

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { addItem } = useCartContext();
  
  const {
    product,
    loading,
    error,
    variants,
    selectedVariant,
    quantity,
    price,
    originalPrice,
    stock,
    inStock,
    discount,
    handleQuantityChange,
    handleVariantChange,
  } = useProductDetail(id);

  const [addingToCart, setAddingToCart] = React.useState(false);
  const [reviewStats, setReviewStats] = useState({ averageRating: 0, total: 0 });

  // Fetch review stats for consistent rating display
  const refreshReviewStats = React.useCallback(() => {
    if (product?._id) {
      getReviewStats(product._id)
        .then(stats => setReviewStats(stats))
        .catch(err => console.error('Failed to fetch review stats:', err));
    }
  }, [product?._id]);

  useEffect(() => {
    refreshReviewStats();
  }, [refreshReviewStats]);

  // Scroll to reviews section if hash is #reviews
  useEffect(() => {
    if (location.hash === '#reviews' && !loading) {
      // Wait for component to render
      setTimeout(() => {
        const reviewsSection = document.getElementById('reviews');
        if (reviewsSection) {
          reviewsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 500);
    }
  }, [location.hash, loading]);

  // Collect all images: product images + all variant images
  const allImages = React.useMemo(() => {
    if (!product) return [];
    
    const images = [...(product.imageUrls || [])];
    
    // Add images from all variants
    if (variants && variants.length > 0) {
      variants.forEach(variant => {
        if (variant.imageUrls && variant.imageUrls.length > 0) {
          variant.imageUrls.forEach(img => {
            // Avoid duplicates
            if (!images.includes(img)) {
              images.push(img);
            }
          });
        }
      });
    }
    
    return images;
  }, [product, variants]);

  // Get the index of the selected variant's first image (for auto-scroll)
  const selectedVariantImageIndex = React.useMemo(() => {
    if (!selectedVariant || !selectedVariant.imageUrls || selectedVariant.imageUrls.length === 0) {
      return 0;
    }
    
    const variantFirstImage = selectedVariant.imageUrls[0];
    const index = allImages.indexOf(variantFirstImage);
    return index >= 0 ? index : 0;
  }, [selectedVariant, allImages]);

  const handleAddToCart = async () => {
    if (!selectedVariant) {
      toast.error('Please select a variant');
      return;
    }

    if (!inStock) {
      toast.error('This variant is out of stock');
      return;
    }

    try {
      setAddingToCart(true);
      
      // Show loading toast immediately
      const variantInfo = selectedVariant.attributes
        ?.map(attr => `${attr.name}: ${attr.value}`)
        .join(', ');
      
      const toastId = toast.loading(`Adding ${product.name} to cart...`, {
        description: `${variantInfo} • Quantity: ${quantity}`,
      });
      
      // Add to cart and update toast based on result
      // addItem expects (variantId, quantity)
      addItem(selectedVariant._id, quantity)
        .then(() => {
          toast.success(`${product.name} added to cart!`, {
            id: toastId,
            description: `${variantInfo} • Quantity: ${quantity}`,
          });
        })
        .catch(err => {
          toast.error('Failed to add to cart', {
            id: toastId,
            description: err.message || 'Please try again.',
          });
        })
        .finally(() => {
          setAddingToCart(false);
        });
    } catch (err) {
      toast.error('Failed to add to cart', {
        description: 'Please try again.',
      });
      setAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (!selectedVariant) {
      toast.error('Please select a variant');
      return;
    }

    if (!inStock) {
      toast.error('This variant is out of stock');
      return;
    }

    try {
      setAddingToCart(true);
      await addItem(selectedVariant._id, quantity);
      navigate(ROUTES.CHECKOUT);
    } catch (err) {
      console.error('Error adding to cart:', err);
      toast.error('Failed to add to cart', {
        description: 'Please try again.',
      });
    } finally {
      setAddingToCart(false);
    }
  };

  if (loading) {
    return (
      <div className="product-detail-loading">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="product-detail-error">
        <ErrorMessage
          title="Product not found"
          message={error || 'The product you are looking for does not exist'}
          onRetry={() => navigate('/products')}
          retryText="Back to Products"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-2 pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:pb-0 md:py-4">
      <div className="max-w-[1400px] mx-auto px-2 md:px-4">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/products')}
          className="mb-2 md:mb-3 rounded-none text-sm md:text-base h-9 md:h-10"
        >
          <ChevronLeft size={18} className="md:w-5 md:h-5" />
          Back to Products
        </Button>

        {/* Product Main Section */}
        <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] gap-4 md:gap-8 mb-6 md:mb-8 items-start">
          {/* Image Gallery */}
          <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-100px)] overflow-hidden">
            <ProductImageGallery 
              images={allImages}
              selectedVariantImageIndex={selectedVariantImageIndex}
              productName={product.name} 
            />
          </div>

          {/* Product Info */}
          <div>
            <ProductInfo
              product={product}
              rating={reviewStats.averageRating || 0}
              reviewCount={reviewStats.total || 0}
              price={price}
              originalPrice={originalPrice}
              inStock={inStock}
              stock={stock}
              discount={discount}
              selectedVariant={selectedVariant}
            />

            {/* Variants */}
            <ProductVariantSelector
              product={product}
              variants={variants}
              selectedVariant={selectedVariant}
              onVariantChange={handleVariantChange}
            />

            {/* Actions */}
            <ProductActions
              inStock={inStock}
              quantity={quantity}
              stock={stock}
              onQuantityChange={handleQuantityChange}
              onAddToCart={handleAddToCart}
              onBuyNow={handleBuyNow}
              selectedVariant={selectedVariant}
              loading={addingToCart}
            />
          </div>
        </div>

        {/* Product Details Tabs */}
        <ProductTabs product={product} />

        {/* Reviews Section - use product._id to ensure we pass MongoDB ObjectId, not slug */}
        <ReviewSection productId={product._id} onStatsChange={refreshReviewStats} />
      </div>

      {/* Mobile Bottom Action Bar */}
      <div className="hidden max-md:flex fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-2 md:p-3 z-[100] shadow-[0_-2px_10px_rgba(0,0,0,0.1)] gap-2">
        <button
          className="flex-1 h-11 text-sm font-semibold rounded-none bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          onClick={handleAddToCart}
          disabled={!selectedVariant || !inStock || addingToCart}
        >
          <ShoppingCart size={18} />
          Add to Cart
        </button>
        <button
          className="flex-1 h-11 text-sm font-semibold rounded-none bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          onClick={handleBuyNow}
          disabled={!selectedVariant || !inStock || addingToCart}
        >
          Buy Now
        </button>
      </div>
    </div>
  );
};

export default ProductDetail;
