import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, ShoppingCart, CreditCard, ExternalLink, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useCartContext } from "../context/CartContext";

const formatVnd = (value) => {
  const number = Number(value);
  if (Number.isNaN(number)) return "0đ";
  return number.toLocaleString("vi-VN") + "đ";
};

const getProductRouteId = (product) => product?.slug || product?._id || product?.id || "";

const getVariantId = (variant) => variant?._id || variant?.id || "";

const firstFromArray = (value) => (Array.isArray(value) && value.length ? value[0] : "");

const getProductImage = (product) => {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const variantImage = firstFromArray(
    variants.find((variant) => firstFromArray(variant?.imageUrls))?.imageUrls,
  );
  const candidate =
    variantImage ||
    firstFromArray(product?.imageUrls) ||
    firstFromArray(product?.images) ||
    product?.image ||
    product?.imageUrl ||
    product?.thumbnail;
  return typeof candidate === "string" ? candidate : "/placeholder.svg";
};

const getAvailableVariants = (product) => {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.filter((variant) => {
    const stock = variant.stockQuantity ?? variant.stock;
    return stock == null || stock > 0;
  });
};

const getVariantLabel = (variant) => {
  const attrs = Array.isArray(variant?.attributes) ? variant.attributes : [];
  const labels = attrs
    .map((attr) => attr?.value)
    .filter(Boolean)
    .join(" - ");
  return labels || variant?.name || variant?.sku || "Mặc định";
};

const ProductQuickViewModal = ({ product, onClose }) => {
  const navigate = useNavigate();
  const { addItem } = useCartContext();
  const [cartActionLoading, setCartActionLoading] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");

  if (!product) return null;

  const routeId = getProductRouteId(product);
  const variants = getAvailableVariants(product);
  
  // Set default selected variant if there's only one, or initialize state
  if (variants.length > 0 && !selectedVariantId) {
    setSelectedVariantId(getVariantId(variants[0]));
  }

  const selectedVariant = variants.find(v => getVariantId(v) === selectedVariantId) || variants[0];
  const fallbackVariant = variants[0] || null;

  const minPrice = product.minPrice ?? product.price;
  const maxPrice = product.maxPrice;
  const priceText =
    maxPrice && maxPrice !== minPrice
      ? `${formatVnd(minPrice)} - ${formatVnd(maxPrice)}`
      : formatVnd(minPrice);

  const displayPrice = selectedVariant?.price ?? minPrice;
  const displayImage = selectedVariant?.imageUrls?.[0] || getProductImage(product);
  const displayStock = selectedVariant?.stockQuantity ?? selectedVariant?.stock ?? product.totalStock ?? "Còn hàng";

  const handleAction = async (buyNow = false) => {
    const targetVariant = variants.length > 0 ? selectedVariant : fallbackVariant;
    const variantId = getVariantId(targetVariant);
    
    if (!variantId && variants.length > 0) {
      toast.info("Vui lòng chọn một tùy chọn sản phẩm.");
      return;
    }

    const actionKey = `${variantId || routeId}-${buyNow ? "buy" : "add"}`;
    setCartActionLoading(actionKey);

    try {
      if (variantId) {
        await addItem(variantId, 1);
      } else {
        // Fallback for products without variants if backend allows it
        await addItem(routeId, 1);
      }
      
      const variantText = targetVariant ? getVariantLabel(targetVariant) : "";
      toast.success(`${product?.name || "Sản phẩm"} ${variantText ? `(${variantText})` : ""} đã vào giỏ.`);
      
      if (buyNow) {
        onClose();
        navigate("/checkout");
      }
    } catch (error) {
      toast.error(error.message || "Không thể thêm vào giỏ. Vui lòng thử lại.");
    } finally {
      setCartActionLoading("");
    }
  };

  const handleViewDetails = () => {
    if (routeId) {
      onClose();
      navigate(`/product/${routeId}`);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm transition-opacity">
      <div 
        className="relative w-full max-w-lg overflow-hidden rounded-[24px] bg-white shadow-2xl ring-1 ring-slate-900/5 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100/80 text-slate-500 backdrop-blur transition hover:bg-slate-200 hover:text-slate-800"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col md:flex-row h-full max-h-[85vh]">
          {/* Image Section */}
          <div className="relative h-64 w-full shrink-0 bg-slate-50 md:h-auto md:w-2/5 md:min-h-[300px]">
            <img
              src={displayImage}
              alt={product.name || "Sản phẩm"}
              className="absolute inset-0 h-full w-full object-cover"
              onError={(e) => { e.currentTarget.src = "/placeholder.svg"; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/20 to-transparent" />
          </div>

          {/* Details Section */}
          <div className="flex flex-col p-6 w-full max-h-full overflow-y-auto">
            <div className="mb-2">
              <h2 className="text-xl font-bold text-slate-900 leading-tight">
                {product.name || "Sản phẩm MilkyBloom"}
              </h2>
              <div className="mt-2 text-lg font-bold text-rose-600">
                {formatVnd(displayPrice)}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1 mb-4 text-sm font-medium text-slate-600">
              <Package className="h-4 w-4 text-slate-400" />
              <span>Kho: <span className="text-slate-800">{displayStock}</span></span>
            </div>

            {/* Variant Selection */}
            {variants.length > 0 && (
              <div className="mb-6 space-y-3">
                <div className="text-sm font-semibold text-slate-900">Phân loại</div>
                <div className="flex flex-wrap gap-2">
                  {variants.map((variant) => {
                    const vId = getVariantId(variant);
                    const isSelected = selectedVariantId === vId;
                    return (
                      <button
                        key={vId}
                        onClick={() => setSelectedVariantId(vId)}
                        className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition-all ${
                          isSelected
                            ? "border-rose-500 bg-rose-50 text-rose-700 ring-1 ring-rose-500"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {getVariantLabel(variant)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-auto space-y-3 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAction(false)}
                  disabled={Boolean(cartActionLoading)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-70 disabled:cursor-wait"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Thêm vào giỏ
                </button>
                <button
                  onClick={() => handleAction(true)}
                  disabled={Boolean(cartActionLoading)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-600 shadow-[0_4px_14px_rgba(244,63,94,0.25)] disabled:opacity-70 disabled:cursor-wait"
                >
                  <CreditCard className="h-4 w-4" />
                  Mua ngay
                </button>
              </div>
              <button
                onClick={handleViewDetails}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
              >
                Xem chi tiết
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ProductQuickViewModal;
