import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Edit, Trash2, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useProductDetail } from '@/hooks' // Using global hook
import ProductImageGallery from './ProductImageGallery'
import ProductInfo from './ProductInfo'
import ProductDescription from './ProductDescription'
import ProductMetadata from './ProductMetadata'
import ProductFormModal from './ProductFormModal'
import VariantManager from './VariantManager'
import { buildProductPath, getProductRouteId } from '@/utils/productRouting'

const ProductDetailModal = ({ product, onClose, onEdit, onDelete }) => {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const navigate = useNavigate();

  // Use global hook to fetch product with variants
  const { 
    product: fullProduct, 
    loading: loadingVariants,
    refetch
  } = useProductDetail(getProductRouteId(product));

  // Use the full product data if available, otherwise fallback to prop
  const productWithVariants = fullProduct || product;
  const variants = productWithVariants.variants || [];

  const handleEdit = () => {
    setShowEditModal(true);
  };

  const handleSaveEdit = async (updatedData) => {
    try {
      await onEdit(product._id, updatedData);
      setShowEditModal(false);
      // Refetch product detail to show updated data
      if (refetch) {
        await refetch();
      }
    } catch (error) {
      console.error('Edit failed:', error);
      // Keep modal open on error so user can retry
    }
  };

  const handleDelete = async () => {
    await onDelete(product._id);
    setShowDeleteDialog(false);
    onClose();
  };

  const handleViewProduct = () => {
    navigate(buildProductPath(product));
  };

  return (
    <>
      {createPortal(
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4'>
        <div className='bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto'>
          {/* Header */}
          <div className='sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center z-10'>
            <h2 className='text-xl font-bold text-gray-900 dark:text-white'>Product Details</h2>
            <div className='flex items-center gap-2'>
              <Button onClick={handleViewProduct} variant='outline' size='sm'>
                <ExternalLink className='w-4 h-4 mr-2' />
                View Page
              </Button>
              <Button onClick={handleEdit} variant='outline' size='sm'>
                <Edit className='w-4 h-4 mr-2' />
                Edit
              </Button>
              <Button onClick={() => setShowDeleteDialog(true)} variant='destructive' size='sm'>
                <Trash2 className='w-4 h-4 mr-2' />
                Delete
              </Button>
              <button 
                onClick={onClose}
                className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-2'
              >
                <X className='w-6 h-6' />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className='p-6'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6 mb-6'>
              {/* Image Gallery */}
              <ProductImageGallery images={productWithVariants.imageUrls} productName={productWithVariants.name} isFeatured={productWithVariants.isFeatured} />
              
              {/* Product Info */}
              <ProductInfo product={productWithVariants} />
            </div>

            {/* Description */}
            <ProductDescription description={productWithVariants.description} />

            {/* Variants Section */}
            <div className='mt-6'>
              {loadingVariants ? (
                <div className='text-center py-4'>Loading variants...</div>
              ) : (
                <VariantManager
                  productId={productWithVariants._id}
                  variants={variants}
                  onUpdate={() => {
                    // Hook will automatically refresh on next render
                  }}
                />
              )}
            </div>

            {/* Metadata */}
            <ProductMetadata createdAt={productWithVariants.createdAt} updatedAt={productWithVariants.updatedAt} />
          </div>
        </div>
      </div>,
        document.body
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <ProductFormModal
          product={productWithVariants}
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveEdit}
          mode='edit'
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{productWithVariants.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className='bg-red-600 hover:bg-red-700'>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default ProductDetailModal
