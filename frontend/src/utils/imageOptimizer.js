/**
 * Image utilities for the GridFS-backed catalog.
 * Keep image URLs safe, predictable, and easy to render.
 */

import { API_BASE_URL } from '@/services/config';

// Browser format support cache
let formatSupportCache = null;

const LEGACY_SEED_IMAGE_PREFIX = '/seed-images/';
const GRIDFS_IMAGE_PATH_PATTERN = /\/api\/media\/images\/([a-fA-F0-9]{24})\/stream(?:\?.*)?$/;
const PLACEHOLDER_IMAGE = '/placeholder.svg';

const getBackendOrigin = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return new URL(API_BASE_URL, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
};

const rewriteGridFsUrl = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  const backendOrigin = getBackendOrigin();
  if (!backendOrigin) return trimmed;

  try {
    const parsed = new URL(trimmed, backendOrigin);
    if (!parsed.pathname.includes('/api/media/images/')) {
      return trimmed;
    }

    const match = parsed.pathname.match(/\/api\/media\/images\/([a-fA-F0-9]{24})\/stream/);
    if (!match) {
      return trimmed;
    }

    const search = parsed.search || '';
    return `${backendOrigin}/api/media/images/${match[1]}/stream${search}`;
  } catch {
    return trimmed;
  }
};

export const normalizeImageUrl = (url, fallback = '/placeholder.svg') => {
  if (!url || typeof url !== 'string') return fallback;

  const trimmed = url.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith(LEGACY_SEED_IMAGE_PREFIX)) return fallback;
  if (trimmed.startsWith('/placeholder')) return trimmed;

  if (GRIDFS_IMAGE_PATH_PATTERN.test(trimmed) || trimmed.includes('/api/media/images/')) {
    return rewriteGridFsUrl(trimmed);
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (trimmed.includes('/api/media/images/')) {
      return rewriteGridFsUrl(trimmed);
    }

    return trimmed;
  }

  return fallback;
};

/**
 * Keep the URL stable for browser rendering.
 * We no longer optimize through a CDN, so this is just a safe passthrough.
 */
export const getOptimizedImageUrl = (url) => {
  const normalized = normalizeImageUrl(url);
  if (normalized.startsWith('/placeholder') || normalized.startsWith('data:')) {
    return normalized;
  }

  return normalized;
};

/**
 * Generate srcset for responsive images
 * Common sizes optimized for modern devices
 */
export const generateSrcSet = (url, sizes = [320, 480, 640, 768, 1024, 1280]) => {
  const normalized = normalizeImageUrl(url);
  if (!normalized || normalized.startsWith('/placeholder') || normalized.startsWith('data:')) {
    return '';
  }

  return sizes.map(size => `${normalized} ${size}w`).join(', ');
};

/**
 * Preload critical images (above the fold)
 * Use for hero images, first visible products
 */
export const preloadImage = (url, options = {}) => {
  if (!url || typeof window === 'undefined') return;

  const normalized = normalizeImageUrl(url);
  if (!normalized || normalized.startsWith('/placeholder')) return;

  const { 
    as = 'image',
    type = 'image/webp',
    fetchPriority = 'high'
  } = options;

  // Check if already preloaded
  const existing = document.querySelector(`link[rel="preload"][href="${normalized}"]`);
  if (existing) return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = as;
  link.href = normalized;
  link.fetchPriority = fetchPriority;
  if (type) link.type = type;
  
  document.head.appendChild(link);
};

/**
 * Preload multiple critical images in parallel
 */
export const preloadImages = (urls, options = {}) => {
  urls.forEach(url => preloadImage(url, options));
};

/**
 * Preconnect to the backend origin that serves GridFS images.
 * Call once at app startup if you want a small connection warmup.
 */
export const preconnectImageCDN = () => {
  if (typeof window === 'undefined') return;

  let backendOrigin = null;
  try {
    backendOrigin = new URL(API_BASE_URL, window.location.origin).origin;
  } catch {
    backendOrigin = window.location.origin;
  }

  [backendOrigin].filter(Boolean).forEach(origin => {
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = origin;
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);

    const dnsPrefetch = document.createElement('link');
    dnsPrefetch.rel = 'dns-prefetch';
    dnsPrefetch.href = origin;
    document.head.appendChild(dnsPrefetch);
  });
};

/**
 * Get image format support (cached)
 */
export const getImageFormatSupport = async () => {
  if (formatSupportCache) return formatSupportCache;

  const formats = { webp: false, avif: false };

  // Check WebP
  try {
    const webpData = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
    const img = new Image();
    img.src = webpData;
    await img.decode();
    formats.webp = true;
  } catch {
    formats.webp = false;
  }

  // Check AVIF
  try {
    const avifData = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQ==';
    const img = new Image();
    img.src = avifData;
    await img.decode();
    formats.avif = true;
  } catch {
    formats.avif = false;
  }

  formatSupportCache = formats;
  return formats;
};

/**
 * Get recommended sizes attribute based on usage context
 */
export const getImageSizes = (usage = 'product-card') => {
  const sizesMap = {
    'product-card': '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px',
    'product-detail': '(max-width: 768px) 100vw, 600px',
    'hero': '100vw',
    'thumbnail': '100px',
    'cart-item': '80px',
    'category': '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px',
  };

  return sizesMap[usage] || sizesMap['product-card'];
};

/**
 * Generate blur placeholder SVG (LQIP - Low Quality Image Placeholder)
 */
export const generateBlurPlaceholder = (color = '#e5e7eb', width = 1, height = 1) => {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}'%3E%3Crect fill='${encodeURIComponent(color)}' width='${width}' height='${height}'/%3E%3C/svg%3E`;
};

/**
 * Check if image is in viewport (for manual lazy loading)
 */
export const isImageInViewport = (element, offset = 200) => {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return (
    rect.top <= (window.innerHeight || document.documentElement.clientHeight) + offset &&
    rect.bottom >= -offset
  );
};

export default {
  getOptimizedImageUrl,
  generateSrcSet,
  preloadImage,
  preloadImages,
  preconnectImageCDN,
  getImageFormatSupport,
  getImageSizes,
  generateBlurPlaceholder,
  isImageInViewport,
};
