import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, ChevronDown, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { normalizeImageUrl } from '@/utils/imageOptimizer';
import './ProductImageGallery.css';

const ProductImageGallery = ({ images = [], selectedVariantImageIndex = 0, productName }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const thumbnailsRef = React.useRef(null);
  const [showUpArrow, setShowUpArrow] = useState(false);
  const [showDownArrow, setShowDownArrow] = useState(false);

  // Ensure we have at least one image (fallback to placeholder)
  const imageList = useMemo(() => {
    const safeImages = (images || [])
      .map((image) => normalizeImageUrl(image))
      .filter(Boolean);

    return safeImages.length > 0 ? safeImages : ['/placeholder.png'];
  }, [images]);

  // Auto-scroll to selected variant's image when variant changes
  useEffect(() => {
    if (selectedVariantImageIndex >= 0 && selectedVariantImageIndex < imageList.length) {
      setCurrentIndex(selectedVariantImageIndex);
      
      // Scroll thumbnail into view
      if (thumbnailsRef.current) {
        const thumbnailElements = thumbnailsRef.current.children;
        if (thumbnailElements[selectedVariantImageIndex]) {
          thumbnailElements[selectedVariantImageIndex].scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
          });
        }
      }
    }
  }, [selectedVariantImageIndex, imageList.length]);

  // Check if scroll buttons should be shown
  const checkScrollButtons = () => {
    if (thumbnailsRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = thumbnailsRef.current;
      setShowUpArrow(scrollTop > 0);
      setShowDownArrow(scrollTop + clientHeight < scrollHeight - 10);
    }
  };

  React.useEffect(() => {
    checkScrollButtons();
    const container = thumbnailsRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollButtons);
      window.addEventListener('resize', checkScrollButtons);
      return () => {
        container.removeEventListener('scroll', checkScrollButtons);
        window.removeEventListener('resize', checkScrollButtons);
      };
    }
  }, [imageList]);

  const handleScroll = (direction) => {
    if (thumbnailsRef.current) {
      const scrollAmount = 100; // Scroll by thumbnail height
      thumbnailsRef.current.scrollBy({
        top: direction === 'up' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleThumbnailClick = (index) => {
    setCurrentIndex(index);
  };

  const openFullscreen = (index) => {
    setFullscreenIndex(index);
    setIsFullscreen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeFullscreen = () => {
    setIsFullscreen(false);
    document.body.style.overflow = '';
  };

  const navigateFullscreen = (direction) => {
    if (direction === 'next') {
      setFullscreenIndex((prev) => (prev + 1) % imageList.length);
    } else {
      setFullscreenIndex((prev) => (prev - 1 + imageList.length) % imageList.length);
    }
  };

  // Close fullscreen on ESC key and navigate with arrow keys
  useEffect(() => {
    const handleKeyboard = (e) => {
      if (!isFullscreen) return;
      
      if (e.key === 'Escape') {
        closeFullscreen();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFullscreenIndex((prev) => (prev - 1 + imageList.length) % imageList.length);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFullscreenIndex((prev) => (prev + 1) % imageList.length);
      }
    };

    if (isFullscreen) {
      window.addEventListener('keydown', handleKeyboard);
      return () => window.removeEventListener('keydown', handleKeyboard);
    }
  }, [isFullscreen, fullscreenIndex, imageList.length]);

  return (
    <>
      <div className="product-image-gallery-nike">
      {/* Side Thumbnails */}
      <div className="thumbnails-column">
        {showUpArrow && (
          <Button
            variant="outline"
            size="icon"
            className="thumbnail-scroll-btn up"
            onClick={() => handleScroll('up')}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        )}
        
        <div className="thumbnails-scroll-container" ref={thumbnailsRef}>
          {imageList.map((image, index) => (
            <div
              key={index}
              className={`thumbnail-item ${index === currentIndex ? 'active' : ''}`}
              onClick={() => handleThumbnailClick(index)}
            >
              <img
                src={image}
                alt={`${productName} thumbnail ${index + 1}`}
                className="thumbnail-image"
                loading="lazy"
              />
            </div>
          ))}
        </div>

        {showDownArrow && (
          <Button
            variant="outline"
            size="icon"
            className="thumbnail-scroll-btn down"
            onClick={() => handleScroll('down')}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Main Image */}
      <div className="main-image-container">
        <img
          src={imageList[currentIndex]}
          alt={`${productName} - Image ${currentIndex + 1}`}
          className="main-image"
          onClick={() => openFullscreen(currentIndex)}
          style={{ cursor: 'pointer' }}
        />
      </div>
    </div>

    {/* Fullscreen Modal - Rendered via Portal to escape stacking context */}
    {isFullscreen && createPortal(
      <div className="image-fullscreen-modal" onClick={closeFullscreen}>
        <Button
          variant="ghost"
          size="icon"
          className="fullscreen-close-btn"
          onClick={closeFullscreen}
        >
          <X size={24} />
        </Button>

        {imageList.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="fullscreen-nav-btn prev"
              onClick={(e) => {
                e.stopPropagation();
                navigateFullscreen('prev');
              }}
            >
              <ChevronLeft size={32} />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="fullscreen-nav-btn next"
              onClick={(e) => {
                e.stopPropagation();
                navigateFullscreen('next');
              }}
            >
              <ChevronRight size={32} />
            </Button>
          </>
        )}

        <div className="fullscreen-image-wrapper" onClick={(e) => e.stopPropagation()}>
          <div className="fullscreen-counter">
            {fullscreenIndex + 1} / {imageList.length}
          </div>
          <img
            src={imageList[fullscreenIndex]}
            alt={`${productName} - Image ${fullscreenIndex + 1}`}
            className="fullscreen-image"
          />
        </div>
      </div>,
      document.body
    )}
    </>
  );
};

export default ProductImageGallery;
