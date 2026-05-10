import React, { useState, useMemo, useEffect } from 'react'
import { UserPlus, Search, Filter, Users as UsersIcon, Crown } from 'lucide-react'
import UserTable from './components/UserTable'
import UserStats from './components/UserStats'
import UserDetailModal from './components/UserDetailModal'
import UserFormModal from './components/UserFormModal'
import UserFilters from './components/UserFilters'
import LoyaltyManagement from './components/LoyaltyManagement'
import { AdminContent, AdminHeader } from '../components'
import { useUsers, useDebounce } from '@/hooks' // Using global hook
import { PageHeader, SearchBar, ConfirmDialog, Pagination } from '@/components/common'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const ITEMS_PER_PAGE = 10;

const Users = () => {
  const [activeTab, setActiveTab] = useState('users')
  const [searchQuery, setSearchQuery] = useState('')
  const [loyaltySearchQuery, setLoyaltySearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 500) // Debounce search input
  const [selectedUser, setSelectedUser] = useState(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [formMode, setFormMode] = useState('create') // 'create' | 'edit'
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [userToDelete, setUserToDelete] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE)

  // Filter state
  const [filters, setFilters] = useState({
    role: 'all',
    isVerified: 'all',
    socialProvider: 'all',
    sortBy: 'newest' // Default to newest
  })

  // Build params for API call - send all filters including sortBy to backend
  const apiParams = useMemo(() => {
    const params = {
      keyword: debouncedSearch.trim() || undefined, // Backend expects 'keyword' not 'search'
      sortBy: filters.sortBy || 'newest', // Send sort to backend
      page: currentPage,
      limit: pageSize,
    }

    // Add filters if not 'all'
    if (filters.role !== 'all') params.role = filters.role
    if (filters.isVerified !== 'all') params.isVerified = filters.isVerified
    if (filters.socialProvider !== 'all') params.socialProvider = filters.socialProvider

    return params
  }, [debouncedSearch, filters, currentPage, pageSize])

  // Custom hook handles data fetching and CRUD operations
  const { 
    users: fetchedUsers, 
    stats, 
    loading, 
    error,
    total: totalItems,
    createUser,
    updateUser,
    deleteUser,
  } = useUsers({ 
    params: apiParams,
    dependencies: [apiParams]
  })

  // Server-side pagination - users already paginated from backend
  const users = fetchedUsers

  // Reset page when filters change (but not when page/pageSize changes)
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, filters])

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize)
    setCurrentPage(1)
  }

  // Stats now comes from backend with proper aggregation
  const handleFilterChange = (newFilters) => {
    setFilters(newFilters)
  }

  const handleClearFilters = () => {
    setFilters({
      role: 'all',
      isVerified: 'all',
      socialProvider: 'all',
      sortBy: 'newest' // Default to newest instead of 'none'
    })
    setSearchQuery('')
  }

  const handleViewDetails = (user) => {
    setSelectedUser(user)
    setIsDetailModalOpen(true)
  }

  const handleAddUser = () => {
    setSelectedUser(null)
    setFormMode('create')
    setIsFormModalOpen(true)
  }

  const handleEditUser = (user) => {
    setSelectedUser(user)
    setFormMode('edit')
    setIsFormModalOpen(true)
  }

  const handleDeleteUser = (userId) => {
    setUserToDelete(userId)
    setShowDeleteConfirm(true)
  }

  const confirmDeleteUser = async () => {
    if (userToDelete) {
      try {
        await deleteUser(userToDelete)
        setIsDetailModalOpen(false)
        setShowDeleteConfirm(false)
        setUserToDelete(null)
      } catch (error) {
        console.error('Delete failed:', error)
      }
    }
  }

  const handleSaveUser = async (userData) => {
    // Clean up data before sending to backend
    const cleanedData = { ...userData }
    
    // Remove empty socialProvider (backend validation doesn't accept empty string)
    if (cleanedData.socialProvider === '') {
      delete cleanedData.socialProvider
    }
    
    if (formMode === 'create') {
      await createUser(cleanedData)
    } else {
      // For updates, handle password separately if provided
      const { password, confirmPassword, ...userDataWithoutPassword } = cleanedData
      
      // Update user fields (without password)
      await updateUser(selectedUser._id, userDataWithoutPassword)
      
      // If password was provided, update it separately using setUserPassword endpoint
      if (password) {
        const usersService = await import('@/services/users.service')
        await usersService.setUserPassword(selectedUser._id, {
          password,
          confirmPassword,
        })
      }
    }
  }

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false)
    setSelectedUser(null)
  }

  const handleCloseFormModal = () => {
    setIsFormModalOpen(false)
    setSelectedUser(null)
  }

  const headerCard = (
    <AdminHeader
      title="User Management"
      description="Manage user accounts and permissions"
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search users..."
      actionButtons={[
        {
          icon: <Filter className='w-4 h-4' />,
          label: 'Filter',
          onClick: () => setShowFilters((v) => !v)
        },
        {
          icon: <UserPlus className='w-4 h-4' />,
          label: 'Add',
          onClick: handleAddUser
        }
      ]}
      filters={
        <UserFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          showFilters={showFilters}
        />
      }
      showFilters={showFilters}
    />
  )

  const loyaltyHeader = (
    <AdminHeader
      title="Loyalty Management"
      description="View and manage customer loyalty points and tiers"
      searchQuery={loyaltySearchQuery}
      onSearchChange={setLoyaltySearchQuery}
      searchPlaceholder="Search loyalty members..."
    />
  )

  return (
    <>
      <div className='space-y-4'>
        {/* Horizontal Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
          <TabsList className='bg-white/80 border border-purple-100/60 p-1 rounded-xl'>
            <TabsTrigger 
              value='users' 
              className='flex items-center gap-2 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-700 px-4 py-2 rounded-lg transition-all'
            >
              <UsersIcon size={16} />
              Users
            </TabsTrigger>
            <TabsTrigger 
              value='loyalty'
              className='flex items-center gap-2 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-700 px-4 py-2 rounded-lg transition-all'
            >
              <Crown size={16} />
              Loyalty
            </TabsTrigger>
          </TabsList>

          {/* Users Tab Content */}
          <TabsContent value='users' className='mt-4'>
            <AdminContent
              header={headerCard}
              filters={null}
              stats={<UserStats stats={stats} />}
              loading={loading}
              error={error}
              onRetry={() => window.location.reload()}
            >
              <UserTable 
                users={users} 
                onViewDetails={handleViewDetails}
                onEdit={handleEditUser}
                onDelete={handleDeleteUser}
              />
              
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
            </AdminContent>
          </TabsContent>

          {/* Loyalty Tab Content */}
          <TabsContent value='loyalty' className='mt-4'>
            <div className='space-y-4'>
              {loyaltyHeader}
              <LoyaltyManagement externalSearchQuery={loyaltySearchQuery} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* User Detail Modal */}
      {isDetailModalOpen && selectedUser && (
        <UserDetailModal 
          user={selectedUser} 
          onClose={handleCloseDetailModal}
          onEdit={handleEditUser}
          onDelete={handleDeleteUser}
        />
      )}

      {/* User Form Modal */}
      <UserFormModal
        user={selectedUser}
        isOpen={isFormModalOpen}
        onClose={handleCloseFormModal}
        onSave={handleSaveUser}
        mode={formMode}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={confirmDeleteUser}
        title="Delete User"
        description="Are you sure you want to delete this user? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </>
  )
}

export default Users
