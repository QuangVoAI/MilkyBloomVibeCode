import React, { useState, useRef, useEffect, memo } from 'react';
import { cn } from '@/utils/cn';
import { normalizeImageUrl } from '@/utils/imageOptimizer';

/**
 * Enterprise-grade Progressive Image Component
 * Features:
 * - Intersection Observer for lazy loading (like Instagram/Netflix)
 * - LQIP (Low Quality Image Placeholder) with blur effect
 * - Native lazy loading fallback
 * - Responsive srcset generation
 * - Smooth fade-in transition
 * - Memory-efficient: only loads images in viewport
 */

// Tiny 1x1 transparent placeholder
const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Generate blur placeholder (solid color or tiny image)
const generateBlurPlaceholder = (color = '#f3f4f6') => {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect fill='${encodeURIComponent(color)}' width='1' height='1'/%3E%3C/svg%3E`;
};

// Common image sizes for srcset
const DEFAULT_SIZES = [320, 480, 640, 768, 1024, 1280];

const OptimizedImage = memo(({
  src,
  alt = '',
  className = '',
  containerClassName = '',
  width,
  height,
  sizes = '100vw',
  priority = false, // Load immediately without lazy loading
  placeholder = 'blur', // 'blur' | 'empty'
  placeholderColor = '#f3f4f6',
  objectFit = 'cover',
  onLoad,
  onError,
  aspectRatio, // e.g., '16/9', '1/1', '4/3'
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || !containerRef.current) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '200px 0px', // Start loading 200px before entering viewport
        threshold: 0.01,
      }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [priority]);

  // Generate srcset for responsive images
  const generateSrcSet = (url) => {
    const normalized = normalizeImageUrl(url);
    if (!normalized || normalized.includes('placeholder') || normalized.startsWith('data:')) {
      return undefined;
    }

    return DEFAULT_SIZES
      .filter(size => !width || size <= width * 2) // Don't generate sizes larger than 2x original
      .map(size => `${normalized} ${size}w`)
      .join(', ');
  };

  const handleLoad = (e) => {
    setIsLoaded(true);
    onLoad?.(e);
  };

  const handleError = (e) => {
    setHasError(true);
    setIsLoaded(true);
    onError?.(e);
  };

  const placeholderSrc = placeholder === 'blur' 
    ? generateBlurPlaceholder(placeholderColor) 
    : PLACEHOLDER;

  const safeSrc = normalizeImageUrl(src, placeholderSrc);
  const imageSrc = isInView ? safeSrc : placeholderSrc;

  // Calculate aspect ratio style
  const aspectRatioStyle = aspectRatio ? { aspectRatio } : {};

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden bg-stone-100',
        containerClassName
      )}
      style={{
        ...aspectRatioStyle,
        width: width ? `${width}px` : undefined,
        height: height && !aspectRatio ? `${height}px` : undefined,
      }}
    >
      {/* Blur placeholder background */}
      {placeholder === 'blur' && !isLoaded && (
        <div
          className="absolute inset-0 bg-stone-200 animate-pulse"
          style={{ backgroundColor: placeholderColor }}
        />
      )}

      {/* Main image */}
      <img
        ref={imgRef}
        src={imageSrc}
        srcSet={isInView && src ? generateSrcSet(src) : undefined}
        sizes={sizes}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={handleLoad}
        onError={handleError}
        className={cn(
          'transition-opacity duration-300 ease-in-out',
          isLoaded ? 'opacity-100' : 'opacity-0',
          hasError && 'hidden',
          className
        )}
        style={{
          objectFit,
          width: '100%',
          height: '100%',
        }}
        {...props}
      />

      {/* Error fallback */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-100 text-stone-400">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}
    </div>
  );
});

OptimizedImage.displayName = 'OptimizedImage';

export default OptimizedImage;

/**
 * Hero Image - Special variant for above-the-fold hero images
 * Preloads immediately with higher priority
 */
export const HeroImage = memo((props) => (
  <OptimizedImage
    priority
    sizes="100vw"
    {...props}
  />
));

HeroImage.displayName = 'HeroImage';

/**
 * Product Image - Optimized for product cards
 */
export const ProductImage = memo((props) => (
  <OptimizedImage
    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
    aspectRatio="1/1"
    {...props}
  />
));

ProductImage.displayName = 'ProductImage';

/**
 * Thumbnail Image - Small thumbnails (cart, list items)
 */
export const ThumbnailImage = memo((props) => (
  <OptimizedImage
    sizes="100px"
    width={100}
    height={100}
    {...props}
  />
));

ThumbnailImage.displayName = 'ThumbnailImage';
