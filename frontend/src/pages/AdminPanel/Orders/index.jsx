import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Package, Truck, CheckCircle, XCircle, Clock, Eye, Search, Filter } from 'lucide-react'
import { getAllOrders, updateOrderStatus } from '@/services/orders.service'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Badge from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatPrice } from '@/utils/formatPrice'
import OrderDetailModal from './components/OrderDetailModal'
import OrderFilters from './components/OrderFilters'
import { AdminContent } from '../components'
import { useDebounce } from '@/hooks'
import { Pagination } from '@/components/common'
import { readQueryPositiveInt, readQueryString, updateQueryParams } from '@/utils/queryState'

const ITEMS_PER_PAGE = 10;

const Orders = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState(readQueryString(searchParams, 'q', ''))
  const debouncedSearch = useDebounce(searchTerm, 500) // Debounce search input
  const [statusFilter, setStatusFilter] = useState(readQueryString(searchParams, 'status', 'all'))
  const [deliveryTypeFilter, setDeliveryTypeFilter] = useState(readQueryString(searchParams, 'delivery', 'all'))
  const [paymentMethodFilter, setPaymentMethodFilter] = useState(readQueryString(searchParams, 'payment', 'all'))
  const [sortBy, setSortBy] = useState(readQueryString(searchParams, 'sort', 'newest'))
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(readQueryPositiveInt(searchParams, 'page', 1))
  const [pageSize, setPageSize] = useState(readQueryPositiveInt(searchParams, 'pageSize', ITEMS_PER_PAGE))
  const [totalItems, setTotalItems] = useState(0)
  const hasInitializedPageReset = useRef(false)

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      // Send all filter params to backend (including pagination)
      const params = {
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        deliveryType: deliveryTypeFilter !== 'all' ? deliveryTypeFilter : undefined,
        paymentMethod: paymentMethodFilter !== 'all' ? paymentMethodFilter : undefined,
        sortBy: sortBy || 'newest',
        page: currentPage,
        limit: pageSize,
      }
      const response = await getAllOrders(params)
      // Backend returns { success: true, orders: [...], total, page, limit }
      setOrders(response?.orders || [])
      setTotalItems(response?.total || 0)
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch orders'
      if (errorMessage.includes('Invalid token') || errorMessage.includes('401')) {
        toast.error('Session expired. Please login again.')
      } else {
        toast.error('Failed to fetch orders: ' + errorMessage)
      }
      setOrders([])
      setTotalItems(0)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter, deliveryTypeFilter, paymentMethodFilter, sortBy, currentPage, pageSize])

  // Reset to page 1 when filters change
  useEffect(() => {
    if (!hasInitializedPageReset.current) {
      hasInitializedPageReset.current = true
      return
    }
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter, deliveryTypeFilter, paymentMethodFilter, sortBy, pageSize])

  useEffect(() => {
    setSearchParams(
      (current) =>
        updateQueryParams(current, [
          { key: 'q', value: searchTerm, defaultValue: '' },
          { key: 'status', value: statusFilter, defaultValue: 'all' },
          { key: 'delivery', value: deliveryTypeFilter, defaultValue: 'all' },
          { key: 'payment', value: paymentMethodFilter, defaultValue: 'all' },
          { key: 'sort', value: sortBy, defaultValue: 'newest' },
          { key: 'page', value: currentPage, defaultValue: 1 },
          { key: 'pageSize', value: pageSize, defaultValue: ITEMS_PER_PAGE },
        ]),
      { replace: true },
    )
  }, [
    currentPage,
    deliveryTypeFilter,
    pageSize,
    paymentMethodFilter,
    searchTerm,
    setSearchParams,
    sortBy,
    statusFilter,
  ])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus)
      // Update order status locally instead of refetching all orders
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order._id === orderId 
            ? { ...order, status: newStatus }
            : order
        )
      )
      toast.success('Order status updated successfully')
    } catch (error) {
      toast.error('Failed to update order status: ' + error.message)
    }
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { variant: 'secondary', icon: Clock, label: 'Pending' },
      confirmed: { variant: 'default', icon: CheckCircle, label: 'Confirmed' },
      shipping: { variant: 'default', icon: Truck, label: 'Shipping' },
      delivered: { variant: 'default', icon: CheckCircle, label: 'Delivered' },
      cancelled: { variant: 'destructive', icon: XCircle, label: 'Cancelled' },
      returned: { variant: 'destructive', icon: XCircle, label: 'Returned' },
    }

    const config = statusConfig[status] || statusConfig.pending
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon size={12} />
        {config.label}
      </Badge>
    )
  }

  // Server-side pagination - orders already paginated from backend
  const handlePageChange = (page) => {
    setCurrentPage(page)
    // Scroll to top of content
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize)
    // Page reset handled by useEffect
  }

  const headerCard = (
    <div className="admin-card bg-white/85 backdrop-blur-md border border-purple-100/70 rounded-2xl shadow-[0_18px_42px_-28px_rgba(124,58,237,0.22)] p-4 sm:p-5 md:p-6">
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Orders Management</h2>
            <p className="text-xs sm:text-sm text-slate-500">Manage and track all customer orders</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <label className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/85 border border-purple-100/80 shadow-inner backdrop-blur-sm">
              <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search orders..."
                className="w-full bg-transparent outline-none text-sm text-slate-700 placeholder:text-slate-400"
              />
            </label>
            <Button
              variant="outline"
              onClick={() => setShowFilters((v) => !v)}
              className="px-3 py-2 rounded-xl border border-purple-100/80 bg-white/80 text-slate-700 hover:bg-purple-50 transition flex items-center justify-center gap-2"
            >
              <Filter className="w-4 h-4" />
              <span className="sm:inline">Filter</span>
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="pt-3 border-t border-purple-100/60">
            <OrderFilters
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              deliveryTypeFilter={deliveryTypeFilter}
              setDeliveryTypeFilter={setDeliveryTypeFilter}
              paymentMethodFilter={paymentMethodFilter}
              setPaymentMethodFilter={setPaymentMethodFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
              showFilters={showFilters}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <AdminContent
        loading={loading}
        header={headerCard}
        filters={null}
      >
        {orders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No orders found
          </div>
        ) : (
          <div className="space-y-4">
              {orders.map((order) => {
                const addressData = typeof order.addressId === 'object' ? order.addressId : null;
                return (
                <Card key={order._id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs sm:text-sm font-semibold">
                            #{order._id.slice(-8)}
                          </span>
                          {getStatusBadge(order.status)}
                          {/* Delivery Type Badge */}
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Truck size={12} />
                            {order.deliveryType === 'express' ? 'Express' : 'Standard'}
                          </Badge>
                          {/* Payment Method Badge */}
                          {order.paymentMethod && (
                            <Badge variant="outline" className="flex items-center gap-1 capitalize">
                              {order.paymentMethod === 'cashondelivery' ? 'COD' : order.paymentMethod}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs sm:text-sm text-muted-foreground space-y-1">
                          <p className="truncate"><strong>Customer:</strong> {order.userId?.fullName || 'Guest'}</p>
                          <p className="truncate"><strong>Email:</strong> {order.userId?.email || 'N/A'}</p>
                          {addressData && (
                            <p className="truncate"><strong>Address:</strong> {addressData.addressLine || 'N/A'}</p>
                          )}
                          <p><strong>Date:</strong> {new Date(order.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-lg sm:text-xl font-bold">
                            {formatPrice(order.totalAmount?.$numberDecimal || order.totalAmount || 0)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Shipping: {formatPrice(order.shippingFee?.$numberDecimal || order.shippingFee || 0)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedOrder(order)
                              setShowDetailModal(true)
                            }}
                            className="text-xs sm:text-sm"
                          >
                            <Eye size={14} className="mr-1" />
                            <span className="hidden sm:inline">View</span>
                          </Button>
                          {/* Status Select Dropdown */}
                          <Select 
                            value={order.status} 
                            onValueChange={(newStatus) => handleStatusUpdate(order._id, newStatus)}
                          >
                            <SelectTrigger className="h-8 text-xs sm:text-sm w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="confirmed">Confirmed</SelectItem>
                              <SelectItem value="shipping">Shipping</SelectItem>
                              <SelectItem value="delivered">Delivered</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                              <SelectItem value="returned">Returned</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            
            {/* Pagination */}
            {totalItems > 0 && (
              <Pagination
                currentPage={currentPage}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                pageSizeOptions={[10, 20, 50]}
              />
            )}
            </div>
          )}
      </AdminContent>

      {showDetailModal && selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => {
            setShowDetailModal(false)
            setSelectedOrder(null)
          }}
          onStatusUpdate={handleStatusUpdate}
        />
      )}
    </>
  )
}

export default Orders
