import { Trash2, X, Image } from 'lucide-react';
import { Input } from '@/components/ui/input';
import Badge from '@/components/ui/badge';
import { parsePrice } from '@/utils/priceUtils';

const VariantList = ({ variants, onUpdatePrice, onUpdateStock, onUpdateWeight, onRemove, onUpdateImage }) => {
  if (variants.length === 0) return null;

  // Handle file selection for variant image
  const handleFileSelect = (index, file) => {
    if (!file) return;
    
    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    
    // Pass file and preview to parent
    if (onUpdateImage) {
      onUpdateImage(index, { file, previewUrl });
    }
  };

  // Remove image from variant
  const handleRemoveImage = (index) => {
    if (onUpdateImage) {
      onUpdateImage(index, null);
    }
  };

  // Get current image source (preview, URL, or existing)
  const getImageSrc = (variant) => {
    if (variant.pendingImagePreview) return variant.pendingImagePreview;
    if (variant.pendingImageUrl) return variant.pendingImageUrl;
    if (variant.imageUrls && variant.imageUrls.length > 0) return variant.imageUrls[0];
    return null;
  };

  return (
    <div className='space-y-3 mt-4'>
      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <h4 className='text-base font-bold text-gray-900 dark:text-white'>
            💰 Step 2: Set Prices, Stock & Images for Each Variant
          </h4>
          <span className='text-sm font-semibold text-blue-600 dark:text-blue-400'>
            {variants.length} {variants.length === 1 ? 'combination' : 'combinations'} generated
          </span>
        </div>
        <p className='text-sm text-gray-600 dark:text-gray-400'>
          Each combination of attributes creates a unique variant. Set price, stock, and optionally an image for each.
        </p>
      </div>
      
      <div className='space-y-2 max-h-[500px] overflow-y-auto pr-2'>
        {variants.map((variant, index) => {
          const imageSrc = getImageSrc(variant);
          
          return (
            <div key={variant._id} className='flex items-start gap-3 p-4 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-600 transition-colors'>
              {/* Variant Image */}
              <div className='flex-shrink-0'>
                {imageSrc ? (
                  <div className='relative group'>
                    <img
                      src={imageSrc}
                      alt='Variant'
                      className='w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-600'
                    />
                    <button
                      type='button'
                      onClick={() => handleRemoveImage(index)}
                      className='absolute -top-1 -right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity'
                      title='Remove image'
                    >
                      <X className='w-3 h-3' />
                    </button>
                  </div>
                ) : (
                  <label className='w-20 h-20 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors'>
                    <input
                      type='file'
                      accept='image/jpeg,image/png,image/webp'
                      onChange={(e) => handleFileSelect(index, e.target.files?.[0])}
                      className='hidden'
                    />
                    <Image className='w-6 h-6 text-gray-400' />
                    <span className='text-[10px] text-gray-400 mt-1'>Add Image</span>
                  </label>
                )}
              </div>

              <div className='flex-1 space-y-3'>
                {/* Attributes */}
                <div className='flex flex-wrap gap-2'>
                  {Object.entries(variant.attributes || {}).map(([key, value]) => (
                    <Badge key={key} variant='outline' className='text-sm font-medium'>
                      <span className='font-bold text-blue-600 dark:text-blue-400'>{key}:</span>
                      <span className='ml-1'>{typeof value === 'object' ? (value.value || value.name || JSON.stringify(value)) : value}</span>
                    </Badge>
                  ))}
                </div>
                
                {/* Price, Stock, and Weight Inputs */}
                <div className='grid grid-cols-3 gap-3'>
                  <div>
                    <label className='text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 block'>
                      Price (VNĐ) <span className='text-red-500'>*</span>
                    </label>
                    <Input
                      type='number'
                      step='1000'
                      min='0'
                      placeholder='VNĐ'
                      value={parsePrice(variant.price) || ''}
                      onChange={(e) => onUpdatePrice(index, e.target.value)}
                      className='h-9'
                      required
                    />
                  </div>
                  <div>
                    <label className='text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 block'>
                      Stock Quantity
                    </label>
                    <Input
                      type='number'
                      min='0'
                      placeholder='0'
                      value={variant.stockQuantity ?? variant.stock ?? ''}
                      onChange={(e) => onUpdateStock(index, e.target.value)}
                      className='h-9'
                    />
                  </div>
                  <div>
                    <label className='text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 block'>
                      Weight (gram)
                    </label>
                    <Input
                      type='number'
                      min='0'
                      placeholder='100'
                      value={variant.weight || ''}
                      onChange={(e) => onUpdateWeight(index, e.target.value)}
                      className='h-9'
                    />
                  </div>
                </div>
              </div>
              
              <button
                type='button'
                onClick={() => onRemove(index)}
                className='text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded transition-colors'
                title='Remove this variant'
              >
                <Trash2 className='w-4 h-4' />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VariantList;
