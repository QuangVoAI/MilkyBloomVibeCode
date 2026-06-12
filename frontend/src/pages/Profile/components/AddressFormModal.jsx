import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AddressAutocomplete from '@/components/common/AddressAutocomplete';
import { toast } from 'sonner';

const VN_PROVINCES = [
  'An Giang','Bà Rịa - Vũng Tàu','Bắc Giang','Bắc Kạn','Bạc Liêu','Bắc Ninh',
  'Bến Tre','Bình Dương','Bình Phước','Bình Thuận','Bình Định','Cà Mau',
  'Cần Thơ','Cao Bằng','Đà Nẵng','Đắk Lắk','Đắk Nông','Điện Biên','Đồng Nai',
  'Đồng Tháp','Gia Lai','Hà Giang','Hà Nam','Hà Nội','Hà Tĩnh','Hải Dương',
  'Hải Phòng','Hậu Giang','Hòa Bình','Hưng Yên','Khánh Hòa','Kiên Giang',
  'Kon Tum','Lai Châu','Lạng Sơn','Lào Cai','Lâm Đồng','Long An','Nam Định',
  'Nghệ An','Ninh Bình','Ninh Thuận','Phú Thọ','Phú Yên','Quảng Bình',
  'Quảng Nam','Quảng Ngãi','Quảng Ninh','Quảng Trị','Sóc Trăng','Sơn La',
  'Tây Ninh','Thái Bình','Thái Nguyên','Thanh Hóa','Thừa Thiên Huế','Tiền Giang',
  'TP. Hồ Chí Minh','Trà Vinh','Tuyên Quang','Vĩnh Long','Vĩnh Phúc','Yên Bái'
];
const normalizeProvinceText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const VN_PROVINCE_BY_NORMALIZED = new Map(
  VN_PROVINCES.map((province) => [normalizeProvinceText(province), province])
);

const PROVINCE_ALIAS_TARGETS = new Map([
  ['hcm', 'tp ho chi minh'],
  ['tp hcm', 'tp ho chi minh'],
  ['tphcm', 'tp ho chi minh'],
  ['tp ho chi minh', 'tp ho chi minh'],
  ['ho chi minh', 'tp ho chi minh'],
  ['sai gon', 'tp ho chi minh'],
  ['sg', 'tp ho chi minh'],
  ['hn', 'ha noi'],
  ['ha noi', 'ha noi'],
  ['vung tau', 'ba ria vung tau'],
  ['ba ria', 'ba ria vung tau'],
  ['ba ria vung tau', 'ba ria vung tau'],
]);

const findMatchingProvince = (input) => {
  const normalized = normalizeProvinceText(input);
  if (!normalized) return '';
  const aliasTarget = PROVINCE_ALIAS_TARGETS.get(normalized);
  return VN_PROVINCE_BY_NORMALIZED.get(aliasTarget || normalized) || '';
};

const AddressFormModal = ({ address, isOpen, onClose, onSave, mode = 'create' }) => {
  const [formData, setFormData] = useState({
    fullNameOfReceiver: '',
    email: '',
    phone: '',
    addressLine: '',
    city: '',
    postalCode: '',
    lat: null,
    lng: null,
    isDefault: false,
  });

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (address && mode === 'edit') {
      setFormData({
        fullNameOfReceiver: address.fullNameOfReceiver || '',
        email: address.email || '',
        phone: address.phone || '',
        addressLine: address.addressLine || '',
        city: address.city || '',
        postalCode: address.postalCode || '',
        lat: address.lat || null,
        lng: address.lng || null,
        isDefault: address.isDefault || false,
      });
    } else {
      // Reset form for create mode
      setFormData({
        fullNameOfReceiver: '',
        email: '',
        phone: '',
        addressLine: '',
        city: '',
        postalCode: '',
        lat: null,
        lng: null,
        isDefault: false,
      });
    }
  }, [address, mode, isOpen]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleAddressSelect = (suggestion) => {
    setFormData(prev => ({
      ...prev,
      addressLine: suggestion.name || suggestion,
      lat: suggestion.lat || null,
      lng: suggestion.lng || null,
    }));
    setErrors(prev => ({ ...prev, addressLine: '' }));
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.fullNameOfReceiver.trim()) {
      newErrors.fullNameOfReceiver = 'Receiver name is required';
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^[0-9]{10,11}$/.test(formData.phone.replace(/ /g, ''))) {
      newErrors.phone = 'Invalid phone number format';
    }
    
    if (!formData.addressLine.trim()) {
      newErrors.addressLine = 'Address is required';
    } else if (formData.addressLine.trim().length < 10) {
      newErrors.addressLine = 'Address must be at least 10 characters';
    }
    const cityTrim = formData.city.trim();
    const canonicalCity = findMatchingProvince(cityTrim);
    if (!cityTrim) {
      newErrors.city = 'Please select a province/city';
    } else if (!canonicalCity) {
      newErrors.city = 'City must be selected from the dropdown list';
    } else if (canonicalCity !== formData.city) {
      setFormData(prev => ({ ...prev, city: canonicalCity }));
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fix the form errors');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...formData,
        city: findMatchingProvince(formData.city) || formData.city.trim(),
      });
      // Reset form after successful save
      setFormData({
        fullNameOfReceiver: '',
        email: '',
        phone: '',
        addressLine: '',
        city: '',
        postalCode: '',
        lat: null,
        lng: null,
        isDefault: false,
      });
      setErrors({});
      // Parent component will close the modal after refresh completes
    } catch (error) {
      // Error toast is handled in the parent component
      // Keep modal open if there's an error
      console.error('Form submission error:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-3 sm:p-4'>
      <div className='bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto'>
        <div className='sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10'>
          <h2 className='text-lg sm:text-xl font-semibold text-gray-900 dark:text-white'>
            {mode === 'create' ? 'Add New Address' : 'Edit Address'}
          </h2>
          <button 
            onClick={onClose} 
            className='text-gray-400 hover:text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2'
            aria-label="Close"
          >
            <X className='w-6 h-6' />
          </button>
        </div>

        <form onSubmit={handleSubmit} className='p-4 sm:p-6 space-y-5 sm:space-y-6'>
          {/* Receiver Information */}
          <div className='space-y-3 sm:space-y-4'>
            <h3 className='text-base sm:text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2'>
              <MapPin className='w-4 h-4 sm:w-5 sm:h-5' />
              Receiver Information
            </h3>
            
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4'>
              <div>
                <Label htmlFor='fullNameOfReceiver' className='text-sm sm:text-base'>Receiver Name *</Label>
                <Input
                  id='fullNameOfReceiver'
                  name='fullNameOfReceiver'
                  value={formData.fullNameOfReceiver}
                  onChange={handleInputChange}
                  placeholder='Enter receiver full name'
                  className='mt-1.5 min-h-[44px]'
                />
                {errors.fullNameOfReceiver && (
                  <p className='text-red-500 text-xs sm:text-sm mt-1.5'>{errors.fullNameOfReceiver}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor='email' className='text-sm sm:text-base'>Email *</Label>
                <Input
                  id='email'
                  name='email'
                  type='email'
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder='example@email.com'
                  className='mt-1.5 min-h-[44px]'
                />
                {errors.email && (
                  <p className='text-red-500 text-xs sm:text-sm mt-1.5'>{errors.email}</p>
                )}
              </div>
            </div>
            
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4'>
              <div>
                <Label htmlFor='phone' className='text-sm sm:text-base'>Phone Number *</Label>
                <Input
                  id='phone'
                  name='phone'
                  type='tel'
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder='0909999999'
                  className='mt-1.5 min-h-[44px]'
                />
                {errors.phone && (
                  <p className='text-red-500 text-xs sm:text-sm mt-1.5'>{errors.phone}</p>
                )}
              </div>
            </div>
          </div>

          {/* Address Details */}
          <div className='space-y-3 sm:space-y-4'>
            <h3 className='text-base sm:text-lg font-medium text-gray-900 dark:text-white'>
              Address Details
            </h3>
            
            <div>
              <Label htmlFor='addressLine' className='text-sm sm:text-base'>Full Address *</Label>
              <div className='mt-1.5'>
                <AddressAutocomplete
                  id='addressLine'
                  name='addressLine'
                  value={formData.addressLine}
                  onChange={handleInputChange}
                  onSelect={handleAddressSelect}
                  placeholder='e.g., 76/12 Bà Hom, Phường 13, Quận 6'
                />
              </div>
              <p className='text-xs text-gray-500 mt-1.5'>
                Enter full address including street, ward, and district
              </p>
              {errors.addressLine && (
                <p className='text-red-500 text-xs sm:text-sm mt-1.5'>{errors.addressLine}</p>
              )}
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4'>
              <div>
                <Label htmlFor='city' className='text-sm sm:text-base'>Province/City *</Label>
                <input
                  id='city'
                  name='city'
                  value={formData.city}
                  onChange={handleInputChange}
                  list='vn-provinces'
                  placeholder='Select province/city'
                  className='mt-1.5 min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
                />
                <datalist id='vn-provinces'>
                  {VN_PROVINCES.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                {errors.city && (
                  <p className='text-red-500 text-xs sm:text-sm mt-1.5'>{errors.city}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor='postalCode' className='text-sm sm:text-base'>Postal Code</Label>
                <Input
                  id='postalCode'
                  name='postalCode'
                  value={formData.postalCode}
                  onChange={handleInputChange}
                  placeholder='Optional'
                  className='mt-1.5 min-h-[44px]'
                />
              </div>
            </div>
          </div>

          {/* Default Address Checkbox */}
          <div className='flex items-start gap-3 p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg'>
            <input
              type='checkbox'
              id='isDefault'
              name='isDefault'
              checked={formData.isDefault}
              onChange={handleInputChange}
              className='w-5 h-5 mt-0.5 flex-shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
            />
            <Label htmlFor='isDefault' className='cursor-pointer text-sm sm:text-base leading-relaxed'>
              Set as default address
            </Label>
          </div>

          {/* Action Buttons */}
          <div className='flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <Button 
              type='button' 
              variant='outline' 
              onClick={onClose} 
              disabled={saving}
              className='w-full sm:w-auto min-h-[44px] sm:min-h-[40px]'
            >
              Cancel
            </Button>
            <Button 
              type='submit' 
              disabled={saving} 
              className='bg-blue-600 hover:bg-blue-700 w-full sm:w-auto min-h-[44px] sm:min-h-[40px]'
            >
              <Save className='w-4 h-4 mr-2' />
              {saving ? 'Saving...' : mode === 'create' ? 'Add Address' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default AddressFormModal;
