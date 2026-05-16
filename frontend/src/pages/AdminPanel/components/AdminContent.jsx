import { LoadingSpinner } from '@/components/common';

/**
 * Reusable Admin Content Wrapper with sticky header behavior
 * Used by Users, Products, Orders pages
 */
const AdminContent = ({
  header,
  stats,
  filters,
  children,
  loading,
  error,
  onRetry,
}) => {
  return (
    <div className='admin-page-content px-4 sm:px-6 py-4 sm:py-6'>
      {header && <div className='admin-card'>{header}</div>}

      {filters && <div className='admin-card'>{filters}</div>}

      {stats && <div className='admin-card'>{stats}</div>}

      {error ? (
        <div className='admin-card text-center'>
          <h3 className='text-lg font-semibold text-red-600 mb-2'>Error Loading Data</h3>
          <p className='text-gray-600 mb-4'>{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'
            >
              Retry
            </button>
          )}
        </div>
      ) : loading ? (
        <div className='admin-card flex items-center justify-center py-12'>
          <LoadingSpinner size='lg' />
        </div>
      ) : (
        children
      )}
    </div>
  );
};

export default AdminContent;
