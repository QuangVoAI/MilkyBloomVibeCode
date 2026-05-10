import { useState } from 'react';
import { Plus, Trash2, PackagePlus, Upload, X, Edit2, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Badge from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatPrice } from '@/utils/formatPrice';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import * as productsService from '@/services/products.service';

const VariantManager = ({ productId, variants: initialVariants = [], onUpdate }) => {
  const [variants, setVariants] = useState(initialVariants);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Attribute definition state (Step 1 & 2)
  const [attributeDefinitions, setAttributeDefinitions] = useState([]);
  const [newAttributeName, setNewAttributeName] = useState('');
  const [attributeValueInputs, setAttributeValueInputs] = useState({});
  
  // Generated variants with prices (Step 3)
  const [generatedVariants, setGeneratedVariants] = useState([]);

  // Step 1: Add attribute definition
  const addAttributeDefinition = () => {
    if (newAttributeName.trim()) {
      setAttributeDefinitions(prev => [
        ...prev,
        { name: newAttributeName.trim(), values: [] }
      ]);
      setNewAttributeName('');
    }
  };

  const removeAttributeDefinition = (index) => {
    setAttributeDefinitions(prev => prev.filter((_, i) => i !== index));
    setAttributeValueInputs(prev => {
      const newState = { ...prev };
      delete newState[index];
      return newState;
    });
  };

  // Step 2: Add values to attributes
  const addValueToAttribute = (attrIndex) => {
    const value = attributeValueInputs[attrIndex]?.trim();
    if (value) {
      setAttributeDefinitions(prev => prev.map((attr, i) => 
        i === attrIndex 
          ? { ...attr, values: [...attr.values, value] }
          : attr
      ));
      setAttributeValueInputs(prev => ({ ...prev, [attrIndex]: '' }));
    }
  };

  const removeValueFromAttribute = (attrIndex, valueIndex) => {
    setAttributeDefinitions(prev => prev.map((attr, i) =>
      i === attrIndex
        ? { ...attr, values: attr.values.filter((_, vi) => vi !== valueIndex) }
        : attr
    ));
  };

  // Step 3: Generate all combinations
  const generateVariantCombinations = () => {
    if (attributeDefinitions.length === 0) {
      toast.error('Please add at least one attribute');
      return;
    }

    const hasEmptyValues = attributeDefinitions.some(attr => attr.values.length === 0);
    if (hasEmptyValues) {
      toast.error('All attributes must have at least one value');
      return;
    }

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
      const attributes = combo.map(attr => ({
        name: attr.name,
        value: attr.value
      }));
      
      // Generate SKU from combination
      const skuSuffix = combo.map(c => c.value.toUpperCase().replace(/\s+/g, '-')).join('-');
      
      return {
        tempId: `temp_${Date.now()}_${index}`,
        attributes,
        sku: `PROD-${skuSuffix}`,
        price: '',
        stockQuantity: 0,
        imageUrls: [],
      };
    });
    
    setGeneratedVariants(newVariants);
    toast.success(`Generated ${newVariants.length} variant combinations`, {
      description: 'Now set SKU and price for each combination',
    });
  };

  // Step 4: Update variant price/stock
  const updateGeneratedVariant = (index, field, value) => {
    setGeneratedVariants(prev => prev.map((v, i) =>
      i === index ? { ...v, [field]: value } : v
    ));
  };

  // Save all generated variants
  const handleSaveVariants = async () => {
    try {
      // Validate all variants have required fields
      const invalidVariants = generatedVariants.filter(v => !v.sku.trim() || !v.price || parseFloat(v.price) <= 0);
      if (invalidVariants.length > 0) {
        toast.error('All variants must have SKU and valid price');
        return;
      }

      setLoading(true);
      
      // Create all variants
      const createdVariants = [];
      for (const variant of generatedVariants) {
        const variantData = {
          sku: variant.sku,
          attributes: variant.attributes,
          price: parseFloat(variant.price),
          stockQuantity: parseInt(variant.stockQuantity) || 0,
          imageUrls: variant.imageUrls || [],
        };
        const created = await productsService.createVariant(productId, variantData);
        
        // If there's a pending image file, upload it
        if (variant.pendingImageFile && created._id) {
          try {
            const formData = new FormData();
            formData.append('variantImages', variant.pendingImageFile);
            await productsService.uploadVariantImagesForVariant(created._id, formData);
          } catch (uploadError) {
            console.error('Failed to upload variant image:', uploadError);
            // Continue even if image upload fails
          }
        }
        
        createdVariants.push(created);
      }
      
      setVariants(prev => [...prev, ...createdVariants]);
      toast.success(`Added ${createdVariants.length} variants successfully`);
      handleCloseModal();
      
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error(error.message || 'Failed to add variants');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setAttributeDefinitions([]);
    setNewAttributeName('');
    setAttributeValueInputs({});
    setGeneratedVariants([]);
  };

  const handleDeleteVariant = async () => {
    try {
      if (!selectedVariant) return;

      setLoading(true);
      await productsService.deleteVariant(selectedVariant._id);
      
      setVariants(prev => prev.filter(v => v._id !== selectedVariant._id));
      toast.success('Variant deleted successfully');
      setShowDeleteDialog(false);
      setSelectedVariant(null);
      
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error(error.message || 'Failed to delete variant');
    } finally {
      setLoading(false);
    }
  };

  const formatAttributes = (attributes) => {
    if (!attributes || attributes.length === 0) return 'No attributes';
    return attributes.map(attr => `${attr.name}: ${attr.value}`).join(', ');
  };

  // Handle variant image upload for existing variants
  const handleVariantImageUpload = async (variantId, file) => {
    if (!file) return;
    
    setUploadingImage(true);
    try {
      // Upload to backend storage immediately
      const formData = new FormData();
      formData.append('variantImages', file);
      
      const result = await productsService.uploadVariantImages(formData);
      
      if (!result.imageUrls || result.imageUrls.length === 0) {
        throw new Error('No image URLs returned from upload');
      }
      
      const uploadedUrl = result.imageUrls[0];
      
      // Update local state with new image URL
      setVariants(prev => prev.map(v => 
        v._id === variantId 
          ? { ...v, imageUrls: [...(v.imageUrls || []), uploadedUrl] }
          : v
      ));
      
      toast.success('Image uploaded - save the product to persist changes');
      
      // Trigger parent update if needed
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Failed to upload variant image:', error);
      toast.error(error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  // Handle variant image delete
  const handleVariantImageDelete = async (variantId, imageUrl) => {
    setUploadingImage(true);
    try {
      await productsService.deleteVariantImages(variantId, [imageUrl]);
      
      // Update the variant in local state
      setVariants(prev => prev.map(v => 
        v._id === variantId 
          ? { ...v, imageUrls: (v.imageUrls || []).filter(url => url !== imageUrl) }
          : v
      ));
      
      toast.success('Image deleted successfully');
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Failed to delete variant image:', error);
      toast.error(error.message || 'Failed to delete image');
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2'>
          <PackagePlus className='w-5 h-5' />
          Product Variants ({variants.length})
        </h3>
        <Button onClick={() => setShowAddModal(true)} size='sm'>
          <Plus className='w-4 h-4 mr-2' />
          Add Variant
        </Button>
      </div>

      {variants.length === 0 ? (
        <div className='text-center py-8 bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700'>
          <PackagePlus className='w-12 h-12 mx-auto mb-2 text-gray-400' />
          <p className='text-gray-500 dark:text-gray-400 mb-2'>No variants yet</p>
          <Button onClick={() => setShowAddModal(true)} variant='outline' size='sm'>
            <Plus className='w-4 h-4 mr-2' />
            Add First Variant
          </Button>
        </div>
      ) : (
        <div className='grid gap-3'>
          {uploadingImage && (
            <div className='flex items-center justify-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800'>
              <span className='text-sm text-blue-600 dark:text-blue-400'>Uploading image...</span>
            </div>
          )}
          {variants.map((variant) => (
            <div
              key={variant._id}
              className='p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700'
            >
              <div className='flex items-start gap-4'>
                {/* Variant Image */}
                <div className='flex-shrink-0'>
                  {variant.imageUrls && variant.imageUrls.length > 0 ? (
                    <div className='relative group'>
                      <img
                        src={variant.imageUrls[0]}
                        alt={variant.sku}
                        className='w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-700'
                      />
                      <button
                        onClick={() => handleVariantImageDelete(variant._id, variant.imageUrls[0])}
                        className='absolute -top-1 -right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity'
                        title='Remove image'
                        disabled={uploadingImage}
                      >
                        <X className='w-3 h-3' />
                      </button>
                    </div>
                  ) : (
                    <label className='w-16 h-16 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors'>
                      <input
                        type='file'
                        accept='image/jpeg,image/png,image/webp'
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleVariantImageUpload(variant._id, file);
                        }}
                        className='hidden'
                      />
                      <Image className='w-5 h-5 text-gray-400' />
                      <span className='text-[10px] text-gray-400 mt-1'>Add</span>
                    </label>
                  )}
                </div>

                {/* Variant Info */}
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-3 mb-1'>
                    <span className='font-mono text-sm font-semibold text-gray-900 dark:text-white'>
                      {variant.sku}
                    </span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      variant.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                    }`}>
                      {variant.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className='text-sm text-gray-600 dark:text-gray-400'>
                    {formatAttributes(variant.attributes)}
                  </p>
                  <div className='flex items-center gap-4 mt-2 text-sm'>
                    <span className='font-medium text-gray-900 dark:text-white'>
                      {formatPrice(variant.price)}
                    </span>
                    <span className='text-gray-600 dark:text-gray-400'>
                      Stock: {variant.stockQuantity || 0}
                    </span>
                    {variant.weight > 0 && (
                      <span className='text-gray-600 dark:text-gray-400'>
                        Weight: {variant.weight} gram
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className='flex items-center gap-2'>
                  {/* Upload/Change Image Button */}
                  <label className='cursor-pointer'>
                    <input
                      type='file'
                      accept='image/jpeg,image/png,image/webp'
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleVariantImageUpload(variant._id, file);
                      }}
                      className='hidden'
                    />
                    <Button
                      variant='outline'
                      size='sm'
                      asChild
                    >
                      <span>
                        <Upload className='w-4 h-4' />
                      </span>
                    </Button>
                  </label>
                  <Button
                    onClick={() => {
                      setSelectedVariant(variant);
                      setShowDeleteDialog(true);
                    }}
                    variant='destructive'
                    size='sm'
                  >
                    <Trash2 className='w-4 h-4' />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Variant Modal */}
      {showAddModal && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4'>
          <div className='bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto'>
            <div className='sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4'>
              <h3 className='text-lg font-semibold text-gray-900 dark:text-white'>Add Product Variants</h3>
              <p className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
                Create attributes, add values, then generate all combinations
              </p>
            </div>
            
            <div className='p-6 space-y-6'>
              {/* Step 1 & 2: Define Attributes and Values */}
              {generatedVariants.length === 0 && (
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <h4 className='text-base font-bold text-gray-900 dark:text-white'>
                      📝 Step 1: Create Attributes
                    </h4>
                    <div className='flex gap-2'>
                      <Input
                        placeholder='Enter attribute name (Color, Size, Storage...)'
                        value={newAttributeName}
                        onChange={(e) => setNewAttributeName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addAttributeDefinition())}
                      />
                      <Button 
                        type='button' 
                        onClick={addAttributeDefinition} 
                        size='sm' 
                        className='whitespace-nowrap'
                      >
                        <Plus className='w-4 h-4 mr-1' />
                        Add Attribute
                      </Button>
                    </div>
                  </div>

                  {/* Display Attributes */}
                  {attributeDefinitions.length === 0 ? (
                    <div className='text-center py-6 text-gray-500 dark:text-gray-400 text-sm'>
                      No attributes yet. Add your first attribute above.
                    </div>
                  ) : (
                    <div className='space-y-3'>
                      <h4 className='text-base font-bold text-gray-900 dark:text-white'>
                        💎 Step 2: Add Values to Each Attribute
                      </h4>
                      {attributeDefinitions.map((attr, attrIndex) => (
                        <div key={attrIndex} className='p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700'>
                          <div className='flex items-center justify-between mb-3'>
                            <div>
                              <span className='font-bold text-gray-900 dark:text-white'>
                                {attr.name}
                              </span>
                              <span className='ml-2 text-xs text-gray-500 dark:text-gray-400'>
                                ({attr.values.length} {attr.values.length === 1 ? 'value' : 'values'})
                              </span>
                            </div>
                            <Button
                              type='button'
                              variant='ghost'
                              size='sm'
                              onClick={() => removeAttributeDefinition(attrIndex)}
                              className='text-red-600 hover:text-red-700 h-7'
                            >
                              <Trash2 className='w-4 h-4' />
                            </Button>
                          </div>
                          
                          {/* Add Value Input */}
                          <div className='flex gap-2 mb-3'>
                            <Input
                              placeholder={`Add value (e.g., ${attr.name === 'Color' ? 'Red, Blue' : 'Small, Large'})`}
                              value={attributeValueInputs[attrIndex] || ''}
                              onChange={(e) => setAttributeValueInputs(prev => ({ ...prev, [attrIndex]: e.target.value }))}
                              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addValueToAttribute(attrIndex))}
                              className='h-9'
                            />
                            <Button
                              type='button'
                              onClick={() => addValueToAttribute(attrIndex)}
                              size='sm'
                              className='h-9'
                              disabled={!attributeValueInputs[attrIndex]?.trim()}
                            >
                              <Plus className='w-4 h-4 mr-1' />
                              Add
                            </Button>
                          </div>
                          
                          {/* Display Values */}
                          {attr.values.length > 0 ? (
                            <div className='flex flex-wrap gap-2'>
                              {attr.values.map((value, valueIndex) => (
                                <Badge key={valueIndex} variant='secondary' className='flex items-center gap-1'>
                                  {typeof value === 'object' ? (value.value || value.name || JSON.stringify(value)) : value}
                                  <button
                                    onClick={() => removeValueFromAttribute(attrIndex, valueIndex)}
                                    className='hover:text-red-600'
                                  >
                                    ×
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <div className='text-center py-2 text-xs text-gray-500 dark:text-gray-400'>
                              No values yet
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {attributeDefinitions.length > 0 && !attributeDefinitions.some(attr => attr.values.length === 0) && (
                        <Button 
                          onClick={generateVariantCombinations}
                          className='w-full bg-green-600 hover:bg-green-700'
                        >
                          ✨ Generate All Combinations ({
                            attributeDefinitions.reduce((total, attr) => total * attr.values.length, 1)
                          } variants)
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Set Prices for Generated Variants */}
              {generatedVariants.length > 0 && (
                <div className='space-y-4'>
                  <div className='flex items-center justify-between'>
                    <h4 className='text-base font-bold text-gray-900 dark:text-white'>
                      💰 Step 3: Set SKU & Price for Each Combination
                    </h4>
                    <Button
                      onClick={() => {
                        setGeneratedVariants([]);
                        setAttributeDefinitions([]);
                        setNewAttributeName('');
                        setAttributeValueInputs({});
                      }}
                      variant='outline'
                      size='sm'
                    >
                      Start Over
                    </Button>
                  </div>
                  
                  <div className='space-y-2 max-h-96 overflow-y-auto pr-2'>
                    {generatedVariants.map((variant, index) => (
                      <div key={variant.tempId} className='p-4 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600'>
                        <div className='flex flex-wrap gap-2 mb-3'>
                          {variant.attributes.map((attr, i) => (
                            <Badge key={i} variant='outline' className='text-sm'>
                              <span className='font-bold text-blue-600'>{attr.name}:</span>
                              <span className='ml-1'>{attr.value}</span>
                            </Badge>
                          ))}
                        </div>
                        
                        <div className='grid grid-cols-3 gap-3'>
                          <div className='col-span-1'>
                            <label className='text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 block'>
                              SKU <span className='text-red-500'>*</span>
                            </label>
                            <Input
                              value={variant.sku}
                              onChange={(e) => updateGeneratedVariant(index, 'sku', e.target.value)}
                              placeholder='SKU'
                              className='h-9'
                            />
                          </div>
                          <div className='col-span-1'>
                            <label className='text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 block'>
                              Price (VNĐ) <span className='text-red-500'>*</span>
                            </label>
                            <Input
                              type='number'
                              step='0.01'
                              min='0'
                              value={variant.price}
                              onChange={(e) => updateGeneratedVariant(index, 'price', e.target.value)}
                              placeholder='0.00'
                              className='h-9'
                            />
                          </div>
                          <div className='col-span-1'>
                            <label className='text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 block'>
                              Stock
                            </label>
                            <Input
                              type='number'
                              min='0'
                              value={variant.stockQuantity}
                              onChange={(e) => updateGeneratedVariant(index, 'stockQuantity', e.target.value)}
                              placeholder='0'
                              className='h-9'
                            />
                          </div>
                        </div>
                        
                        {/* Variant Image Upload */}
                        <div className='mt-3'>
                          <label className='text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 block'>
                            🖼️ Variant Image (optional)
                          </label>
                          <div className='flex gap-2 items-start'>
                            {/* File Input */}
                            <div className='flex-1'>
                              <input
                                type='file'
                                accept='image/jpeg,image/png,image/webp,image/gif'
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    // Upload to backend storage immediately
                                    setUploadingImage(true);
                                    try {
                                      const formData = new FormData();
                                      formData.append('variantImages', file);
                                      
                                      const result = await productsService.uploadVariantImages(formData);
                                      
                                      if (result.imageUrls && result.imageUrls.length > 0) {
                                        const uploadedUrl = result.imageUrls[0];
                                        updateGeneratedVariant(index, 'imageUrls', [uploadedUrl]);
                                        updateGeneratedVariant(index, 'imagePreview', uploadedUrl);
                                        toast.success('Image uploaded successfully');
                                      }
                                    } catch (error) {
                                      console.error('Failed to upload:', error);
                                      toast.error(error.message || 'Failed to upload image');
                                    } finally {
                                      setUploadingImage(false);
                                    }
                                  }
                                }}
                                className='hidden'
                                id={`variant-image-${index}`}
                                disabled={uploadingImage}
                              />
                              <label
                                htmlFor={`variant-image-${index}`}
                                className={`flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 text-sm text-gray-600 dark:text-gray-400 ${uploadingImage ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <Upload className='w-4 h-4' />
                                {uploadingImage ? 'Uploading...' : (variant.imageUrls?.[0] ? 'Change file...' : 'Choose file...')}
                              </label>
                            </div>
                            {/* URL fallback */}
                            <div className='text-xs text-gray-500 dark:text-gray-400 pt-2'>or</div>
                            <Input
                              value={variant.imageUrls?.[0] || ''}
                              onChange={(e) => {
                                const newImageUrls = e.target.value ? [e.target.value] : [];
                                updateGeneratedVariant(index, 'imageUrls', newImageUrls);
                                updateGeneratedVariant(index, 'pendingImageFile', null);
                                updateGeneratedVariant(index, 'imagePreview', null);
                              }}
                              placeholder='Or paste URL'
                              className='h-9 flex-1'
                            />
                          </div>
                          {/* Image Preview */}
                          {(variant.imagePreview || variant.imageUrls?.[0]) && (
                            <div className='mt-2 relative inline-block'>
                              <img
                                src={variant.imagePreview || variant.imageUrls?.[0]}
                                alt='Variant preview'
                                className='w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-700'
                              />
                              <button
                                type='button'
                                onClick={() => {
                                  updateGeneratedVariant(index, 'imageUrls', []);
                                  updateGeneratedVariant(index, 'pendingImageFile', null);
                                  updateGeneratedVariant(index, 'imagePreview', null);
                                }}
                                className='absolute -top-1 -right-1 bg-red-500 text-white p-0.5 rounded-full'
                              >
                                <X className='w-3 h-3' />
                              </button>
                            </div>
                          )}
                          <p className='text-xs text-gray-500 mt-1'>
                            Add a specific image for this variant (JPG, PNG, WebP, GIF - max 10MB)
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className='flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700'>
              <Button
                onClick={handleCloseModal}
                variant='outline'
                disabled={loading}
              >
                Cancel
              </Button>
              {generatedVariants.length > 0 && (
                <Button onClick={handleSaveVariants} disabled={loading}>
                  {loading ? 'Saving...' : `Save ${generatedVariants.length} Variants`}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete variant "{selectedVariant?.sku}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVariant} disabled={loading} className='bg-red-600 hover:bg-red-700'>
              {loading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VariantManager;
