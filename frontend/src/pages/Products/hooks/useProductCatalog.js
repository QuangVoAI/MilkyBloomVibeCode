import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getProducts, getProductCategories } from '@/services/products.service';

const normalizeCategoryFilterValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[object Object]') return '';
    return trimmed;
  }
  if (typeof value === 'object') {
    return value._id || value.id || value.slug || '';
  }
  return String(value);
};

/**
 * Custom hook for managing product catalog state and data fetching
 * 
 * PAGINATION CONFIGURATION:
 * - Products per page: 24 (divisible by 2, 3, 4, 6 for responsive grids)
 * - Desktop grid: 4 columns (220px cards)
 * - Tablet grid: 3 columns (180px cards)
 * - Mobile grid: 2 columns
 * - Backend limit: Default 20, we override with explicit value
 */
export const useProductCatalog = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  
  // Products per page: 24 works well with grid layouts (2, 3, 4, 6 columns)
  const PRODUCTS_PER_PAGE = 24;

  // Get filters from URL (memoized to prevent unnecessary re-renders)
  const filters = useMemo(() => ({
    search: searchParams.get('search') || '',
    category: normalizeCategoryFilterValue(searchParams.get('category') || ''),
    brand: searchParams.get('brand') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    rating: searchParams.get('rating') || '',
    sortBy: searchParams.get('sortBy') || 'createdAt',
    sortOrder: searchParams.get('sortOrder') || 'desc',
  }), [searchParams]);

  useEffect(() => {
    const rawCategory = searchParams.get('category');
    const normalizedCategory = normalizeCategoryFilterValue(rawCategory);

    if (rawCategory && normalizedCategory !== rawCategory) {
      const nextParams = new URLSearchParams(searchParams);
      if (normalizedCategory) {
        nextParams.set('category', normalizedCategory);
      } else {
        nextParams.delete('category');
      }
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch products with debouncing and abort control
  const abortControllerRef = useRef(null);
  
  useEffect(() => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const fetchProducts = async () => {
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      
      try {
        setLoading(true);
        setError(null);

        const params = {
          page: currentPage,
          limit: PRODUCTS_PER_PAGE, // Explicit limit to override backend default (20)
        };

        // Add sort parameter (backend expects "field:order" format)
        if (filters.sortBy && filters.sortOrder) {
          params.sort = `${filters.sortBy}:${filters.sortOrder}`;
        }

        // Add filters if present (using correct backend parameter names)
        if (filters.search) params.keyword = filters.search;
        if (filters.category) params.categoryId = filters.category;
        // Brand filtering not supported by backend yet
        // if (filters.brand) params.brand = filters.brand;
        if (filters.minPrice) params.minPrice = filters.minPrice;
        if (filters.maxPrice) params.maxPrice = filters.maxPrice;
        if (filters.rating) params.minRating = filters.rating;

        const response = await getProducts(params);
        
        // Mock returns { products: [...], pagination: { total, totalPages, page, limit, hasMore } }
        // Backend returns { products: [...], pagination: { totalProducts, totalPages, currentPage, limit } }
        setProducts(response.products || response || []);
        setTotalPages(response.pagination?.totalPages || 1);
        setTotalProducts(response.pagination?.total || response.pagination?.totalProducts || response.length || 0);
      } catch (err) {
        console.error('Error fetching products:', err);
        setError(err.message || 'Failed to load products');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [currentPage, filters]); // filters is memoized by searchParams

  // Fetch metadata (categories)
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const categoriesData = await getProductCategories();
        setCategories(categoriesData || []);
      } catch (err) {
        console.error('Error fetching metadata:', err);
      }
    };

    fetchMetadata();
  }, []);

  // Update filter in URL
  const handleFilterChange = useCallback((filterName, value) => {
    const newParams = new URLSearchParams(searchParams);
    const normalizedValue =
      filterName === 'category' ? normalizeCategoryFilterValue(value) : value;
    
    if (normalizedValue) {
      newParams.set(filterName, normalizedValue);
    } else {
      newParams.delete(filterName);
    }
    
    setCurrentPage(1);
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  // Update multiple filters at once
  const handleMultipleFilters = useCallback((filtersObj) => {
    const newParams = new URLSearchParams(searchParams);
    
    Object.entries(filtersObj).forEach(([key, value]) => {
      const normalizedValue =
        key === 'category' ? normalizeCategoryFilterValue(value) : value;

      if (normalizedValue) {
        newParams.set(key, normalizedValue);
      } else {
        newParams.delete(key);
      }
    });
    
    setCurrentPage(1);
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  // Update sort
  const handleSortChange = useCallback((newSortBy, newSortOrder) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sortBy', newSortBy);
    newParams.set('sortOrder', newSortOrder);
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchParams({});
    setCurrentPage(1);
  }, [setSearchParams]);

  // Check if any filters are active
  const hasActiveFilters = filters.search || filters.category || 
                          filters.minPrice || filters.maxPrice || filters.rating;

  return {
    products,
    categories,
    loading,
    error,
    currentPage,
    totalPages,
    totalProducts,
    filters,
    hasActiveFilters,
    setCurrentPage,
    handleFilterChange,
    handleMultipleFilters,
    handleSortChange,
    clearFilters,
  };
};
