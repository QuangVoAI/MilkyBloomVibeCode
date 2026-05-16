import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductCard } from '@/components/common';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import './ProductShowcaseSection.css';

const ProductShowcaseSection = ({ 
  title, 
  subtitle, 
  products, 
  viewAllLink,
  loading = false,
  showViewAll = true
}) => {
  const navigate = useNavigate();
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  if (!loading && (!products || products.length === 0)) return null;

  return (
    <section className="py-8 px-4 sm:py-12 sm:px-6 lg:py-16 lg:px-[5%]">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl md:text-[1.75rem] font-bold text-slate-800 tracking-tight">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          {showViewAll && (
            <button 
              onClick={() => navigate(viewAllLink)} 
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 transition-all"
            >
              View All
              <ArrowRight size={16} />
            </button>
          )}
        </div>

        {/* Products Scroll */}
        <div className="products-scroll-wrapper relative">
          <button 
            className="scroll-btn absolute top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center bg-white border border-slate-200 text-slate-500 cursor-pointer transition-all duration-200 opacity-0 hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300 -left-5 hidden md:flex"
            onClick={() => scroll('left')}
            aria-label="Scroll left"
          >
            <ChevronLeft size={20} />
          </button>

          <div ref={scrollRef} className="products-scroll">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="skeleton w-[168px] sm:w-[200px] lg:w-[240px] h-[300px] sm:h-[320px] flex-shrink-0 rounded-lg" />
              ))
            ) : (
              products.slice(0, 12).map((product) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  showBadges={true}
                  showCategory={false}
                  showQuickView={false}
                  onClick={() => navigate(`/products/${product._id}`)}
                  className="flex-shrink-0 w-[168px] sm:w-[200px] lg:w-[240px]"
                />
              ))
            )}
          </div>

          <button 
            className="scroll-btn absolute top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center bg-white border border-slate-200 text-slate-500 cursor-pointer transition-all duration-200 opacity-0 hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300 -right-5 hidden md:flex"
            onClick={() => scroll('right')}
            aria-label="Scroll right"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </section>
  );
};

export default ProductShowcaseSection;
