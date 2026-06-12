import React, { useState, useEffect, useRef } from 'react';
import { Search, X, TrendingUp, Clock } from 'lucide-react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { searchProducts } from '@/services/products.service';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/utils/formatPrice';
import { buildProductPath } from '@/utils/productRouting';
import './AdvancedSearchBar.css';

/**
 * Advanced search bar with expand animation, suggestions, and product preview
 * Similar to Nike's search experience
 */
const AdvancedSearchBar = ({ 
  placeholder = 'Search products...',
  className = ''
}) => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [originalPosition, setOriginalPosition] = useState(null);
  const searchRef = useRef(null);
  const navigate = useNavigate();

  // Sync search query with URL params when on products page
  useEffect(() => {
    if (location.pathname === '/products') {
      const urlSearch = searchParams.get('search');
      if (urlSearch && urlSearch !== searchQuery) {
        setSearchQuery(urlSearch);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, searchParams]);

  // Popular/Trending searches
  const trendingSearches = ['Pikachu Plush', 'Pokemon Keychain', 'Anime Figure', 'Stickers'];

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await searchProducts({ keyword: searchQuery, limit: 6 });
        setSearchResults(response.products || response || []);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchClick = () => {
    if (searchRef.current && !isExpanded) {
      const rect = searchRef.current.getBoundingClientRect();
      setOriginalPosition({
        top: rect.top,
        left: rect.left,
        width: rect.width,
      });
    }
    setIsExpanded(true);
  };

  const handleClear = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleProductClick = (productOrId) => {
    saveRecentSearch(searchQuery);
    navigate(buildProductPath(productOrId));
    setIsExpanded(false);
    setSearchQuery('');
  };

  const handleSuggestionClick = (suggestion) => {
    setSearchQuery(suggestion);
    saveRecentSearch(suggestion);
  };

  const handleViewAllResults = () => {
    if (searchQuery.trim()) {
      saveRecentSearch(searchQuery);
      navigate(`/products?search=${encodeURIComponent(searchQuery)}`);
      setIsExpanded(false);
      setSearchQuery('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      handleViewAllResults();
    } else if (e.key === 'Escape') {
      setIsExpanded(false);
    }
  };

  const saveRecentSearch = (query) => {
    if (!query.trim()) return;
    
    const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  };

  return (
    <>
      {/* Backdrop overlay when expanded */}
      {isExpanded && <div className="search-backdrop" onClick={() => setIsExpanded(false)} />}

      <div 
        ref={searchRef}
        className={`advanced-search-container ${isExpanded ? 'expanded' : ''} ${className}`}
        style={
          isExpanded && originalPosition
            ? {
                '--original-top': `${originalPosition.top}px`,
                '--original-left': `${originalPosition.left}px`,
                '--original-width': `${originalPosition.width}px`,
              }
            : {}
        }
      >
        {/* Search Input */}
        <div className="search-input-wrapper">
          <Search className="search-icon" size={20} />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={handleSearchClick}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="search-input"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              className="clear-button"
            >
              <X size={18} />
            </Button>
          )}
        </div>

        {/* Dropdown Panel */}
        {isExpanded && (
          <div className="search-dropdown">
            {!searchQuery ? (
              // Show suggestions when no search query
              <div className="suggestions-section">
                {/* Recent Searches */}
                {recentSearches.length > 0 && (
                  <div className="suggestion-group">
                    <div className="suggestion-header">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-muted-foreground" />
                        <h4 className="text-sm font-medium">Recent Searches</h4>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearRecentSearches}
                        className="text-xs"
                      >
                        Clear
                      </Button>
                    </div>
                    <div className="suggestion-list">
                      {recentSearches.map((search, index) => (
                        <button
                          key={index}
                          className="suggestion-item"
                          onClick={() => handleSuggestionClick(search)}
                        >
                          <Clock size={14} />
                          <span>{search}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trending Searches */}
                <div className="suggestion-group">
                  <div className="suggestion-header">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={16} className="text-muted-foreground" />
                      <h4 className="text-sm font-medium">Trending</h4>
                    </div>
                  </div>
                  <div className="suggestion-list">
                    {trendingSearches.map((search, index) => (
                      <button
                        key={index}
                        className="suggestion-item"
                        onClick={() => handleSuggestionClick(search)}
                      >
                        <TrendingUp size={14} />
                        <span>{search}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              // Show search results
              <div className="results-section">
                {isLoading ? (
                  <div className="loading-state">
                    <div className="spinner" />
                    <p className="text-sm text-muted-foreground">Searching...</p>
                  </div>
                ) : searchResults.length > 0 ? (
                  <>
                    <div className="results-header">
                      <h4 className="text-sm font-medium">Products</h4>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={handleViewAllResults}
                        className="text-xs"
                      >
                        View All Results
                      </Button>
                    </div>
                    <div className="results-grid">
                      {searchResults.map((product) => (
                        <button
                          key={product._id}
                          className="result-card"
                          onClick={() => handleProductClick(product._id)}
                        >
                          <div className="result-image">
                            <img
                              src={product.imageUrls?.[0] || '/placeholder.svg'}
                              alt={product.name}
                              loading="lazy"
                            />
                          </div>
                          <div className="result-info">
                            <h5 className="result-name">{product.name}</h5>
                            <p className="result-category">
                              {product.category?.name || product.categoryId?.[0]?.name || product.categoryId?.name || 'Uncategorized'}
                            </p>
                            <p className="result-price">{formatPrice(product.minPrice || product.price)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <Search size={48} className="text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">
                      No products found for "{searchQuery}"
                    </p>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={handleClear}
                    >
                      Clear search
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default AdvancedSearchBar;
