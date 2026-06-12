import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Minus, Plus } from 'lucide-react';

const ProductActions = ({
  inStock,
  quantity,
  stock,
  onQuantityChange,
  onAddToCart,
  onBuyNow,
  selectedVariant,
  loading,
}) => {
  return (
    <>
      {/* Quantity Selector */}
      {selectedVariant && inStock && (
        <div className="my-3 md:my-4">
          <h3 className="text-sm md:text-base font-semibold mb-2 md:mb-3 text-slate-800">Số lượng</h3>
          <div className="flex items-center">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onQuantityChange(-1)}
              disabled={quantity <= 1}
              className="rounded-none h-9 w-9 md:h-10 md:w-10"
            >
              <Minus size={14} className="md:w-4 md:h-4" />
            </Button>
            <input
              type="number"
              min="1"
              max={stock}
              value={quantity}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 1;
                if (value >= 1 && value <= stock) {
                  onQuantityChange(value - quantity);
                }
              }}
              onBlur={(e) => {
                const value = parseInt(e.target.value) || 1;
                if (value < 1) onQuantityChange(1 - quantity);
                if (value > stock) onQuantityChange(stock - quantity);
              }}
              className="quantity-input w-14 md:w-16 text-lg md:text-xl font-semibold text-center border border-slate-200 rounded-md px-1 md:px-2 py-1.5 md:py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => onQuantityChange(1)}
              disabled={quantity >= stock}
              className="rounded-none h-9 w-9 md:h-10 md:w-10"
            >
              <Plus size={14} className="md:w-4 md:h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 md:gap-4 mt-4 md:mt-6 max-md:hidden">
        <Button
          size="lg"
          onClick={onAddToCart}
          disabled={!selectedVariant || !inStock || loading}
          className="flex-1 text-sm md:text-base font-semibold rounded-none h-10 md:h-12"
        >
          <ShoppingCart size={18} className="mr-2 md:w-5 md:h-5" />
          {!selectedVariant ? 'Chọn tùy chọn' : 'Thêm vào giỏ hàng'}
        </Button>
        <Button
          size="lg"
          variant="default"
          onClick={onBuyNow}
          disabled={!selectedVariant || !inStock || loading}
          className="flex-1 text-sm md:text-base font-semibold rounded-none h-10 md:h-12"
        >
          Mua ngay
        </Button>
      </div>
    </>
  );
};

export default ProductActions;
