import React from 'react';
import { Link } from 'react-router-dom';
import { useOrderHistory } from './hooks/useOrderHistory';
import { useAuth } from '@/hooks';
import ErrorMessage from '@/components/common/ErrorMessage';

import Pagination from '@/components/common/Pagination';
import OrderHistoryList from './components/OrderHistoryList';
import OrderHistoryFilters from './components/OrderHistoryFilters';
import { LogIn, ShoppingBag } from 'lucide-react';
import './OrderHistory.css';

const OrderHistorySkeleton = () => (
  <div className="order-history-page">
    <div className="order-history-container">
      <div className="order-history-skeleton-header">
        <div className="order-history-skeleton-line skeleton-title" />
        <div className="order-history-skeleton-line skeleton-count" />
      </div>
      <div className="order-history-skeleton-filter" />
      {[0, 1, 2].map((item) => (
        <div className="order-history-skeleton-card" key={item}>
          <div className="order-history-skeleton-image" />
          <div className="order-history-skeleton-body">
            <div className="order-history-skeleton-line skeleton-wide" />
            <div className="order-history-skeleton-line skeleton-medium" />
          </div>
          <div className="order-history-skeleton-line skeleton-price" />
        </div>
      ))}
    </div>
  </div>
);

const OrderHistory = () => {
  const { user } = useAuth();
  const isGuest = !user;
  const {
    orders,
    loading,
    error,
    filters,
    pagination,
    handleFilterChange,
    handleSearch,
    handlePageChange,
    handlePageSizeChange,
    refetch
  } = useOrderHistory();

  if (loading) {
    return <OrderHistorySkeleton />;
  }

  if (error) {
    return (
      <div className="order-history-error">
        <ErrorMessage
          title="Failed to load orders"
          message={error}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="order-history-page">
      <div className="order-history-container">
        {/* Guest Login Prompt - Show ONLY this for guests */}
        {isGuest ? (
          <div className="guest-login-prompt guest-only">
            <div className="guest-login-content">
              <LogIn size={32} className="guest-login-icon" />
              <div className="guest-login-text">
                <h3>Login to Save Your Orders</h3>
                <p>Create an account or login to keep track of all your orders and enjoy a personalized shopping experience.</p>
              </div>
              <Link to="/login" className="guest-login-button">
                Login / Register
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="order-history-header">
              <h1>Order History</h1>
              <p className="order-count">
                {pagination.total || orders.length} {(pagination.total || orders.length) === 1 ? 'order' : 'orders'}
              </p>
            </div>

            <OrderHistoryFilters
              filters={filters}
              onFilterChange={handleFilterChange}
              onSearch={handleSearch}
            />

            {orders.length === 0 ? (
              <div className="no-orders">
                <ShoppingBag size={48} className="no-orders-icon" />
                <p>No orders found</p>
                <a href="/products" className="shop-now-link">
                  Start Shopping
                </a>
              </div>
            ) : (
              <>
                <OrderHistoryList orders={orders} />
                <Pagination
                  currentPage={pagination.currentPage}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.total}
                  pageSize={pagination.pageSize}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                  pageSizeOptions={[5, 10, 20, 50]}
                  showInfo
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OrderHistory;
