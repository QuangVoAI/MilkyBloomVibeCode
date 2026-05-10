import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import AttributeDefinitionBuilder from './AttributeDefinitionBuilder';
import VariantList from './VariantList';
import CategoryManager from './CategoryManager';
import ImageGalleryManager from './ImageGalleryManager';
import * as productsService from '@/services/products.service';

const ProductFormModal = ({ product, isOpen, onClose, onSave, mode = 'create' }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    brand: '',
    isFeatured: false,
    status: 'Published',
    imageUrls: [],
    categoryId: [],
    variants: [],
  });

  const [newImageUrl, setNewImageUrl] = useState('');
  const [pendingImageFiles, setPendingImageFiles] = useState([]); // Files waiting to be uploaded
  const [attributeDefinitions, setAttributeDefinitions] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletedVariantIds, setDeletedVariantIds] = useState([]); // Track deleted variants
  const [deletedImageUrls, setDeletedImageUrls] = useState([]); // Track deleted images

  useEffect(() => {
    if (product && mode === 'edit') {
      const convertedVariants = (product.variants || []).map(v => {
        if (Array.isArray(v.attributes)) {
          const attributesObj = {};
          v.attributes.forEach(attr => {
            attributesObj[attr.name] = attr.value;
          });
          return { 
            ...v, 
            attributes: attributesObj,
            stockQuantity: v.stockQuantity ?? v.stock ?? 0,
            stock: v.stockQuantity ?? v.stock ?? 0,
            weight: v.weight ?? 100
          };
        }
        return { 
          ...v, 
          attributes: v.attributes || {},
          stockQuantity: v.stockQuantity ?? v.stock ?? 0,
          stock: v.stockQuantity ?? v.stock ?? 0,
          weight: v.weight ?? 100
        };
      });
      
      // Extract attribute definitions from existing variants
      if (convertedVariants.length > 0) {
        const attrMap = {};
        convertedVariants.forEach(variant => {
          Object.entries(variant.attributes).forEach(([key, value]) => {
            if (!attrMap[key]) {
              attrMap[key] = new Set();
            }
            attrMap[key].add(value);
          });
        });
        
        const definitions = Object.entries(attrMap).map(([name, valuesSet]) => ({
          name,
          values: Array.from(valuesSet),
        }));
        
        setAttributeDefinitions(definitions);
      }

      setFormData({
        name: product.name || '',
        description: product.description || '',
        brand: product.brand || '',
        isFeatured: product.isFeatured || false,
        // Normalize invalid status values (e.g., "Active" -> "Published")
        status: ['Draft', 'Published', 'Archived', 'Disabled'].includes(product.status) 
          ? product.status 
          : 'Published',
        imageUrls: product.imageUrls || [],
        // Ensure categoryId is always an array of strings (IDs)
        categoryId: (product.categoryId || []).map(cat => 
          typeof cat === 'object' ? cat._id : cat
        ),
        variants: convertedVariants,
      });
    }
  }, [product, mode]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const addCategory = (categoryId) => {
    setFormData(prev => ({
      ...prev,
      categoryId: [...prev.categoryId, categoryId],
    }));
  };

  const removeCategory = (index) => {
    setFormData(prev => ({
      ...prev,
      categoryId: prev.categoryId.filter((_, i) => i !== index),
    }));
  };

  const addImage = () => {
    if (newImageUrl.trim()) {
      setFormData(prev => ({
        ...prev,
        imageUrls: [...prev.imageUrls, newImageUrl.trim()],
      }));
      setNewImageUrl('');
    }
  };

  const removeImage = (index) => {
    const imageUrl = formData.imageUrls[index];
    
    // Track deleted image URL for backend cleanup
    if (imageUrl && mode === 'edit') {
      setDeletedImageUrls(prev => [...prev, imageUrl]);
    }
    
    setFormData(prev => ({
      ...prev,
      imageUrls: prev.imageUrls.filter((_, i) => i !== index),
    }));
  };

  // File upload handlers
  const addPendingFiles = async (files) => {
    // Upload immediately to backend storage
    setUploading(true);
    try {
      const formDataUpload = new FormData();
      files.forEach(file => {
        formDataUpload.append('productImages', file);
      });
      
      const result = await productsService.uploadImages(formDataUpload);
      
      // Add URLs to imageUrls
      if (result.imageUrls && result.imageUrls.length > 0) {
        setFormData(prev => ({
          ...prev,
          imageUrls: [...prev.imageUrls, ...result.imageUrls]
        }));
        toast.success(`Uploaded ${result.imageUrls.length} images successfully`);
      }
    } catch (error) {
      console.error('Failed to upload images:', error);
      toast.error('Failed to upload images: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const removePendingFile = (index) => {
    setPendingImageFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Upload pending files to server
  const uploadPendingFiles = async (productId) => {
    if (pendingImageFiles.length === 0) return [];
    
    setUploading(true);
    try {
      const formDataUpload = new FormData();
      pendingImageFiles.forEach(file => {
        formDataUpload.append('images', file);
      });
      
      const result = await productsService.uploadProductImages(productId, formDataUpload);
      setPendingImageFiles([]);
      return result.imageUrls || [];
    } catch (error) {
      console.error('Failed to upload images:', error);
      toast.error('Failed to upload some images');
      return [];
    } finally {
      setUploading(false);
    }
  };

  const generateVariants = () => {
    if (attributeDefinitions.length === 0) return;
    
    const generateCombinations = (arrays) => {
      if (arrays.length === 0) return [[]];
      const [first, ...rest] = arrays;
      const restCombinations = generateCombinations(rest);
      return first.flatMap(value =>
        restCombinations.map(combo => [value, ...combo])
      );
    };
    
    const attrValues = attributeDefinitions.map(attr => 
      attr.values.map(val => ({ name: attr.name, value: val }))
    );
    
    const combinations = generateCombinations(attrValues);
    
    const newVariants = combinations.map((combo, index) => {
      const attributes = {};
      combo.forEach(attr => {
        attributes[attr.name] = attr.value;
      });
      
      return {
        _id: `var_${Date.now()}_${index}`,
        attributes,
        price: { $numberDecimal: '0' },
        stockQuantity: 0,
        stock: 0,
        isActive: true,
      };
    });
    
    setFormData(prev => ({
      ...prev,
      variants: newVariants,
    }));
    
    toast.success('Variants generated!', {
      description: `Created ${newVariants.length} variant combinations. Now set prices for each.`,
      duration: 4000,
    });
  };

  const updateVariantPrice = (index, price) => {
    setFormData(prev => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === index ? { ...v, price: { $numberDecimal: price } } : v
      ),
    }));
  };

  const updateVariantStock = (index, stock) => {
    setFormData(prev => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === index ? { ...v, stockQuantity: parseInt(stock) || 0, stock: parseInt(stock) || 0 } : v
      ),
    }));
  };

  const updateVariantWeight = (index, weight) => {
    setFormData(prev => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === index ? { ...v, weight: weight === '' ? '' : (parseInt(weight) || '') } : v
      ),
    }));
  };

  const removeVariant = (index) => {
    setFormData(prev => {
      const variantToRemove = prev.variants[index];
      // If variant has a real ID (not temporary), track it for deletion
      if (variantToRemove._id && !variantToRemove._id.startsWith('var_')) {
        setDeletedVariantIds(prevIds => [...prevIds, variantToRemove._id]);
      }
      return {
        ...prev,
        variants: prev.variants.filter((_, i) => i !== index),
      };
    });
  };

  // Update variant image (file or URL)
  const updateVariantImage = async (index, imageData) => {
    if (imageData === null) {
      // Remove image
      setFormData(prev => ({
        ...prev,
        variants: prev.variants.map((v, i) => {
          if (i !== index) return v;
          return {
            ...v,
            pendingImageFile: null,
            pendingImagePreview: null,
            pendingImageUrl: '',
            imageUrls: [],
          };
        }),
      }));
      return;
    }
    
    if (imageData.file) {
      // Upload file immediately to backend storage
      setUploading(true);
      try {
        const formDataUpload = new FormData();
        formDataUpload.append('variantImages', imageData.file);
        
        const result = await productsService.uploadVariantImages(formDataUpload);
        
        if (result.imageUrls && result.imageUrls.length > 0) {
          const uploadedUrl = result.imageUrls[0];
          setFormData(prev => ({
            ...prev,
            variants: prev.variants.map((v, i) => {
              if (i !== index) return v;
              return {
                ...v,
                imageUrls: [uploadedUrl],
                pendingImagePreview: uploadedUrl,
                pendingImageFile: null,
                pendingImageUrl: '',
              };
            }),
          }));
          toast.success('Variant image uploaded successfully');
        }
      } catch (error) {
        console.error('Failed to upload variant image:', error);
        toast.error(error.message || 'Failed to upload variant image');
      } finally {
        setUploading(false);
      }
      return;
    }
    
    if (imageData.url !== undefined) {
      // URL input
      setFormData(prev => ({
        ...prev,
        variants: prev.variants.map((v, i) => {
          if (i !== index) return v;
          return {
            ...v,
            pendingImageFile: null,
            pendingImagePreview: null,
            pendingImageUrl: imageData.url,
            imageUrls: imageData.url ? [imageData.url] : [],
          };
        }),
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Product name is required';
    }
    
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }
    
    if (formData.categoryId.length === 0) {
      newErrors.categoryId = 'At least one category is required';
    }
    
    // Images and variants are optional for skeleton creation
    // User can add them later
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      // Prepare variants data - include pending image info for upload after creation
      const variantsWithImageInfo = formData.variants.map(v => ({
        ...v,
        // Include image URL if provided via URL input
        imageUrls: v.pendingImageUrl ? [v.pendingImageUrl] : (v.imageUrls || []),
        // Pass pending file info for upload after variant creation
        pendingImageFile: v.pendingImageFile || null,
      }));

      // Include deleted variant IDs for update operations
      const dataToSave = {
        ...formData,
        variants: variantsWithImageInfo,
        // Don't pass pendingImageFiles - images are already uploaded and in formData.imageUrls
        ...(mode === 'edit' && deletedVariantIds.length > 0 && { deletedVariantIds }),
        ...(mode === 'edit' && deletedImageUrls.length > 0 && { deletedImageUrls })
      };
      
      // For edit mode, upload pending images immediately if product exists
      if (mode === 'edit' && product?._id && pendingImageFiles.length > 0) {
        const uploadedUrls = await uploadPendingFiles(product._id);
        if (uploadedUrls.length > 0) {
          dataToSave.imageUrls = [...formData.imageUrls, ...uploadedUrls];
        }
      }
      
      await onSave(dataToSave);
      // Toast is shown by the hook, no need to duplicate here
      onClose();
    } catch (error) {
      // Error toast is shown by the hook
      console.error('Save failed:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4'>
      <div className='bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto'>
        <div className='sticky top-0 z-10 bg-white/96 dark:bg-gray-800/95 backdrop-blur border-b border-gray-200 dark:border-gray-700 px-6 py-4'>
          <div className='flex items-center justify-between mb-3'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white'>
              {mode === 'create' ? 'Add New Product' : 'Edit Product'}
            </h2>
            <button onClick={onClose} className='text-gray-400 hover:text-gray-600'>
              <X className='w-6 h-6' />
            </button>
          </div>
          
          {/* Action Buttons at Top */}
          <div className='flex justify-end gap-3'>
            <Button type='button' variant='outline' onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type='submit' disabled={saving} className='bg-blue-600 hover:bg-blue-700' onClick={handleSubmit}>
              <Save className='w-4 h-4 mr-2' />
              {saving ? 'Saving...' : mode === 'create' ? 'Create Product' : 'Save Changes'}
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className='p-6 space-y-6'>
          {/* Basic Info */}
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>Product Name <span className='text-red-500'>*</span></label>
              <Input
                name='name'
                value={formData.name}
                onChange={handleInputChange}
                placeholder='Enter product name'
              />
              {errors.name && <p className='text-red-500 text-sm mt-1'>{errors.name}</p>}
            </div>
            <div>
              <CategoryManager
                categories={formData.categoryId}
                onAdd={addCategory}
                onRemove={removeCategory}
              />
              {errors.categoryId && <p className='text-red-500 text-sm mt-1'>{errors.categoryId}</p>}
            </div>
          </div>

          <div>
            <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>Description <span className='text-red-500'>*</span></label>
            <textarea
              name='description'
              value={formData.description}
              onChange={handleInputChange}
              placeholder='Enter product description'
              rows={4}
              className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white'
            />
            {errors.description && <p className='text-red-500 text-sm mt-1'>{errors.description}</p>}
          </div>

          <div className='flex items-center gap-2'>
            <input
              type='checkbox'
              name='isFeatured'
              checked={formData.isFeatured}
              onChange={handleInputChange}
              className='w-4 h-4'
            />
            <label className='text-sm text-gray-700 dark:text-gray-300'>Featured Product</label>
          </div>

          {/* Product Status */}
          <div>
            <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>Product Status <span className='text-red-500'>*</span></label>
            <select
              name='status'
              value={formData.status}
              onChange={handleInputChange}
              className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white'
            >
              <option value='Published'>Published (Visible to customers)</option>
              <option value='Draft'>Draft (Hidden from customers)</option>
              <option value='Disabled'>Disabled (Hidden from customers)</option>
              <option value='Archived'>Archived (Hidden from customers)</option>
            </select>
            <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
              Only "Published" products are visible in the customer catalogue
            </p>
          </div>

          {/* Images */}
          <div>
            <ImageGalleryManager
              images={formData.imageUrls}
              newImageUrl={newImageUrl}
              onAddImage={addImage}
              onRemoveImage={removeImage}
              onImageUrlChange={(e) => setNewImageUrl(e.target.value)}
              pendingFiles={pendingImageFiles}
              onAddFiles={addPendingFiles}
              onRemoveFile={removePendingFile}
              uploading={uploading}
            />
          </div>

          {/* Variants */}
          <div className='space-y-4 mt-6 pt-6 border-t-2 border-gray-200 dark:border-gray-700'>
            
            
            <AttributeDefinitionBuilder
              attributeDefinitions={attributeDefinitions}
              setAttributeDefinitions={setAttributeDefinitions}
              onGenerateVariants={generateVariants}
            />

            {errors.variants && <p className='text-red-500 text-sm'>{errors.variants}</p>}

            <VariantList
              variants={formData.variants}
              onUpdatePrice={updateVariantPrice}
              onUpdateStock={updateVariantStock}
              onUpdateWeight={updateVariantWeight}
              onUpdateImage={updateVariantImage}
              onRemove={removeVariant}
            />
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default ProductFormModal;
