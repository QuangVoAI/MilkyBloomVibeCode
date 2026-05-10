import React, { useState, useEffect } from 'react';
import { SearchBar, LoadingSpinner } from '@/components/common';
import ChatWidget from '@/components/ChatWidget';

/**
 * Reusable Admin Panel Layout with sticky header behavior
 * Handles scroll detection and sticky header shadow automatically
 */
const AdminLayout = ({ 
  header,
  stats,
  filters,
  children,
  loading,
  error,
  onRetry
}) => {
  const [stickyScrolled, setStickyScrolled] = useState(false);

  // Handle scroll for sticky header shadow
  useEffect(() => {
    const scrollContainer = document.querySelector('.admin-scroll-container');
    if (!scrollContainer) return;

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      setStickyScrolled(scrollTop > 20);
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className='h-full flex flex-col'>
      <div className='flex-1 overflow-y-auto px-6 admin-scroll-container'>
        <div className='py-6'>
          {/* Header Section */}
          {header}

          {/* Sticky Search and Filter Section */}
          <div 
            className={`sticky top-0 z-40 bg-white transition-shadow duration-300 ${stickyScrolled ? 'shadow-md' : ''}`}
          >
            {filters}
          </div>

          {/* Stats Section */}
          {stats && (
            <div className='mb-6'>
              {stats}
            </div>
          )}

          {/* Content Section */}
          {error ? (
            <div className='text-center py-12'>
              <h3 className='text-lg font-semibold text-red-600 mb-2'>Error Loading Data</h3>
              <p className='text-gray-600 mb-4'>{error}</p>
              <button 
                onClick={onRetry}
                className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'
              >
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className='text-center py-12'>
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            children
          )}
        </div>
      </div>
      <ChatWidget />
    </div>
  );
};

export default AdminLayout;
