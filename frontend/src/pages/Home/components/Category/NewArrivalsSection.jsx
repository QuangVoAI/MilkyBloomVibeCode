import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductCard, ScrollArrows } from '@/components/common';
import { ArrowRight } from 'lucide-react';
import { buildProductPath } from '@/utils/productRouting';
import './NewArrivalsSection.css';

const NewArrivalsSection = ({ newProducts }) => {
  const navigate = useNavigate();
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = 800;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleViewAll = () => {
    navigate('/products?filter=new');
  };

  const handleProductClick = (product) => {
    navigate(buildProductPath(product));
  };

  if (!newProducts || newProducts.length === 0) return null;

  return (
    <section className="px-[5%] py-20 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-violet-300/20 to-purple-300/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-indigo-300/20 to-blue-300/20 rounded-full blur-3xl" />
      
      <div className="relative z-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10 max-w-[1600px] mx-auto">
          <div>
            <h2 className="text-4xl font-bold text-slate-800 mb-1">New Arrivals</h2>
            <p className="text-sm text-slate-500">Fresh drops you can't miss</p>
          </div>
          <button
            onClick={handleViewAll}
            className="h-11 px-6 font-semibold rounded-lg transition-all whitespace-nowrap border border-slate-200 bg-white text-slate-700 hover:bg-blue-500 hover:text-white hover:border-blue-500 hover:-translate-y-0.5 w-full sm:w-auto inline-flex items-center justify-center gap-2"
          >
            View All
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="relative">
          <ScrollArrows 
            onScrollLeft={() => scroll('left')}
            onScrollRight={() => scroll('right')}
          />

          <div ref={scrollRef} className="products-horizontal-scroll">
            {newProducts.slice(0, 12).map((product) => (
              <ProductCard
                key={product._id}
                product={product}
                showBadges={true}
                showCategory={false}
                showQuickView={false}
                onClick={handleProductClick}
              />
            ))}
          </div>
          {/* Scroll indicator for mobile */}
          <div className="scroll-indicator" />
        </div>
      </div>
    </section>
  );
};

export default NewArrivalsSection;
