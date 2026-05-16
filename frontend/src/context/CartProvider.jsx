import { useCart as useCartHook } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { CartContext } from '@/context/CartContext';

/**
 * Cart Provider - Wraps the app to provide global cart state
 * This ensures all components share the same cart state
 */
export const CartProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const userId = user?._id || user?.id || null;
  const cartState = useCartHook(userId, authLoading);

  return (
    <CartContext.Provider value={cartState}>
      {children}
    </CartContext.Provider>
  );
};

export default CartProvider;
