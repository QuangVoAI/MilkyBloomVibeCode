import React from 'react'
import { X, Calendar, DollarSign, Star, Tag, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ProductFilters = ({ filters, onFilterChange, onClearFilters, categories = [], showFilters }) => {
  // Product statuses are fixed values, no need to fetch from database
  const availableStatuses = ['Published', 'Draft', 'Archived'];

  const handleChange = (key, value) => {
    onFilterChange({ ...filters, [key]: value })
  }

  // Check for active filters (exclude sort and empty values)
  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (key === 'sort') return false; // sort always has a value, exclude it
    return value && value !== 'all' && value !== ''
  })

  return (
    <div className='mb-4'>
      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <div className='flex justify-end mb-2'>
          <Button
            variant='ghost'
            onClick={onClearFilters}
            className='flex items-center gap-2 text-red-600 hover:text-red-700'
          >
            <X className='w-4 h-4' />
            Clear All Filters
          </Button>
        </div>
      )}

      {/* Filter Panel */}
      {showFilters && (
        <div className='p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4 mb-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
            
            {/* Status Filter */}
            <div className='space-y-2'>
              <Label className='flex items-center gap-2 text-sm font-medium'>
                <Tag className='w-4 h-4' />
                Status
              </Label>
              <Select 
                value={filters.status || 'all'} 
                onValueChange={(v) => handleChange('status', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder='All Statuses' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Statuses</SelectItem>
                  {availableStatuses.map(status => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            <div className='space-y-2'>
              <Label className='flex items-center gap-2 text-sm font-medium'>
                <Tag className='w-4 h-4' />
                Category
              </Label>
              <Select value={filters.categoryId || 'all'} onValueChange={(v) => handleChange('categoryId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder='All Categories' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat._id} value={cat._id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Featured Filter */}
            <div className='space-y-2'>
              <Label className='flex items-center gap-2 text-sm font-medium'>
                <Star className='w-4 h-4' />
                Featured
              </Label>
              <Select value={filters.isFeatured || 'all'} onValueChange={(v) => handleChange('isFeatured', v)}>
                <SelectTrigger>
                  <SelectValue placeholder='All Products' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Products</SelectItem>
                  <SelectItem value='true'>Featured Only</SelectItem>
                  <SelectItem value='false'>Not Featured</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort By */}
            <div className='space-y-2'>
              <Label className='flex items-center gap-2 text-sm font-medium'>
                <TrendingUp className='w-4 h-4' />
                Sort By
              </Label>
              <Select value={filters.sort || 'createdAt:desc'} onValueChange={(v) => handleChange('sort', v)}>
                <SelectTrigger>
                  <SelectValue placeholder='Sort by...' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='createdAt:desc'>Newest First</SelectItem>
                  <SelectItem value='createdAt:asc'>Oldest First</SelectItem>
                  <SelectItem value='name:asc'>Name (A-Z)</SelectItem>
                  <SelectItem value='name:desc'>Name (Z-A)</SelectItem>
                  <SelectItem value='minPrice:asc'>Price (Low to High)</SelectItem>
                  <SelectItem value='minPrice:desc'>Price (High to Low)</SelectItem>
                  <SelectItem value='averageRating:desc'>Highest Rated</SelectItem>
                  <SelectItem value='totalUnitsSold:desc'>Most Sold</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Min Price */}
            <div className='space-y-2'>
              <Label className='flex items-center gap-2 text-sm font-medium'>
                <DollarSign className='w-4 h-4' />
                Min Price
              </Label>
              <Input
                type='number'
                placeholder='0'
                value={filters.minPrice || ''}
                onChange={(e) => handleChange('minPrice', e.target.value)}
                min='0'
                step='0.01'
              />
            </div>

            {/* Max Price */}
            <div className='space-y-2'>
              <Label className='flex items-center gap-2 text-sm font-medium'>
                <DollarSign className='w-4 h-4' />
                Max Price
              </Label>
              <Input
                type='number'
                placeholder='No limit'
                value={filters.maxPrice || ''}
                onChange={(e) => handleChange('maxPrice', e.target.value)}
                min='0'
                step='0.01'
              />
            </div>

            {/* Min Rating */}
            <div className='space-y-2'>
              <Label className='flex items-center gap-2 text-sm font-medium'>
                <Star className='w-4 h-4' />
                Min Rating
              </Label>
              <Select value={filters.minRating || 'all'} onValueChange={(v) => handleChange('minRating', v)}>
                <SelectTrigger>
                  <SelectValue placeholder='Any Rating' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Any Rating</SelectItem>
                  <SelectItem value='4'>4+ Stars</SelectItem>
                  <SelectItem value='3'>3+ Stars</SelectItem>
                  <SelectItem value='2'>2+ Stars</SelectItem>
                  <SelectItem value='1'>1+ Stars</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Days Ago Filter */}
            <div className='space-y-2'>
              <Label className='flex items-center gap-2 text-sm font-medium'>
                <Calendar className='w-4 h-4' />
                Created Within
              </Label>
              <Select value={filters.daysAgo || 'all'} onValueChange={(v) => handleChange('daysAgo', v)}>
                <SelectTrigger>
                  <SelectValue placeholder='Any Time' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Any Time</SelectItem>
                  <SelectItem value='7'>Last 7 Days</SelectItem>
                  <SelectItem value='30'>Last 30 Days</SelectItem>
                  <SelectItem value='90'>Last 3 Months</SelectItem>
                  <SelectItem value='180'>Last 6 Months</SelectItem>
                  <SelectItem value='365'>Last Year</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>

          {/* Active Filters Summary */}
          {hasActiveFilters && (
            <div className='pt-3 border-t border-gray-300'>
              <div className='flex flex-wrap gap-2'>
                <span className='text-sm font-medium text-gray-700'>Active Filters:</span>
                {filters.status && filters.status !== 'all' && (
                  <span className='px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs'>
                    Status: {filters.status}
                  </span>
                )}
                {filters.categoryId && filters.categoryId !== 'all' && (
                  <span className='px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs'>
                    Category
                  </span>
                )}
                {filters.isFeatured && filters.isFeatured !== 'all' && (
                  <span className='px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs'>
                    Featured: {filters.isFeatured === 'true' ? 'Yes' : 'No'}
                  </span>
                )}
                {filters.minPrice && (
                  <span className='px-2 py-1 bg-green-100 text-green-700 rounded text-xs'>
                    Min: ${filters.minPrice}
                  </span>
                )}
                {filters.maxPrice && (
                  <span className='px-2 py-1 bg-green-100 text-green-700 rounded text-xs'>
                    Max: ${filters.maxPrice}
                  </span>
                )}
                {filters.minRating && filters.minRating !== 'all' && (
                  <span className='px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs'>
                    Rating: {filters.minRating}+ Stars
                  </span>
                )}
                {filters.daysAgo && filters.daysAgo !== 'all' && (
                  <span className='px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs'>
                    Last {filters.daysAgo} Days
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ProductFilters
