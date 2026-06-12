import { useState, useEffect, useCallback, useRef } from "react";
import {
  getCartByUser,
  getCartBySession,
  createCart,
  addItemToCart,
  removeItemFromCart,
  clearCart,
} from "@/services";

/**
 * Cart Hook - Refactored to prevent race conditions
 * - Uses requestId to ignore stale responses
 * - Locks cart mode (guest/user) to prevent overwrite
 * - Only fetches when auth is stable
 */
export function useCart(userId = null, authLoading = false) {
  const [cart, setCart] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [itemLoading, setItemLoading] = useState({});
  
  // Store userId in ref to avoid stale closure
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  
  // Request tracking to prevent race conditions
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);
  const fetchCartRef = useRef(null);
  
  // Debounce timers and abort controllers per item (like Shopify/Amazon)
  const debounceTimersRef = useRef({});
  const itemAbortControllersRef = useRef({});
  
  // Store pending quantity updates per item to avoid closure issues
  const pendingQuantityRef = useRef({});
  
  // Cart mode lock: once we fetch with userId/sessionId, lock it
  const cartModeRef = useRef(null); // 'user' | 'guest' | null
  const lockedUserIdRef = useRef(null);
  const lockedSessionIdRef = useRef(null);

  // BroadcastChannel for cross-tab sync
  const broadcastChannelRef = useRef(null);

  const getSessionId = useCallback(() => {
    let sessionId = localStorage.getItem("sessionId");
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("sessionId", sessionId);
    }
    return sessionId;
  }, []);

  // Broadcast cart update to other tabs
  const broadcastCartUpdate = useCallback((updatedCart) => {
    if (broadcastChannelRef.current && updatedCart) {
      broadcastChannelRef.current.postMessage({
        type: 'CART_UPDATED',
        cart: updatedCart,
        timestamp: Date.now()
      });
    }
  }, []);

  const fetchCart = useCallback(async (silent = false, forceMode = null) => {
    // Abort previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    // Generate unique request ID
    const currentRequestId = ++requestIdRef.current;
    
    if (!silent) setLoading(true);
    setError(null);
    
    try {
      let cartData = null;
      // Use ref to get latest userId (avoid stale closure)
      const currentUserId = userIdRef.current;
      const currentMode = forceMode || (currentUserId ? 'user' : 'guest');
      const currentSessionId = getSessionId();
      const requestOptions = {
        signal: abortController.signal,
        suppressNetworkErrorLog: true,
      };
      
      if (currentUserId) {
        cartData = await getCartByUser(currentUserId, requestOptions);
      } else {
        cartData = await getCartBySession(currentSessionId, requestOptions);
      }

      // Check if this response is still relevant
      if (currentRequestId !== requestIdRef.current) {
        return;
      }
      
      // Check if request was aborted
      if (abortController.signal.aborted) {
        return;
      }

      // Lock cart mode on first successful fetch
      if (cartData && !cartModeRef.current) {
        cartModeRef.current = currentMode;
        if (currentMode === 'user') {
          lockedUserIdRef.current = currentUserId;
        } else {
          lockedSessionIdRef.current = currentSessionId;
        }
      }

      if (cartData?.exists === false) {
        setCart(null);
        setItems([]);
      } else if (cartData) {
        setCart(cartData);
        setItems(cartData.items || []);
      } else {
        setCart(null);
        setItems([]);
      }
    } catch (err) {
      // Ignore abort errors
      if (err.name === 'AbortError' || abortController.signal.aborted) {
        return;
      }
      
      // Check if this response is still relevant
      if (currentRequestId !== requestIdRef.current) {
        return;
      }
      
      // 404 is expected when cart doesn't exist yet - don't treat as error
      const is404 = err.message?.includes('404') || 
                    err.message?.includes('Cart not found') || 
                    err.message?.includes('Không tìm thấy');
      
      const isNetworkFetchFailure =
        err.name === 'TypeError' && err.message === 'Failed to fetch';
      
      if (!is404 && !isNetworkFetchFailure) {
        console.error("Failed to fetch cart:", err);
        setError(err.message || "Failed to fetch cart");
      }
      
      // Set empty cart on any error (including 404)
      setCart(null);
      setItems([]);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [getSessionId]); // Removed userId - it's captured in closure
  
  // Store fetchCart in ref for stable reference
  fetchCartRef.current = fetchCart;

  // Initialize BroadcastChannel for cross-tab sync
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannelRef.current = new BroadcastChannel('cart-sync');
      
      // Listen for cart updates from other tabs
      broadcastChannelRef.current.onmessage = (event) => {
        if (event.data.type === 'CART_UPDATED') {
          const updatedCart = event.data.cart;
          setCart(updatedCart);
          setItems(updatedCart.items || []);
        }
      };
    }

    return () => {
      // Close BroadcastChannel
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const timers = debounceTimersRef.current;
    const controllers = itemAbortControllersRef.current;

    return () => {
      // Clear all debounce timers
      Object.values(timers).forEach((timer) => clearTimeout(timer));
      // Abort all pending requests
      Object.values(controllers).forEach((controller) => controller.abort());
    };
  }, []);

  const ensureCart = useCallback(async () => {
    if (cart) return cart;

    const currentUserId = userIdRef.current;
    const cartData = {
      userId: currentUserId || null,
      sessionId: currentUserId ? null : getSessionId(),
    };
    const newCart = await createCart(cartData);
    setCart(newCart);
    setItems([]);
    return newCart;
  }, [cart, getSessionId]);

  const updateItemQuantity = useCallback(
    async (variantId, newQuantity) => {
      if (!variantId || newQuantity < 0) return;
      
      const cartId = cart?._id || cart?.id;
      if (!cartId) return;

      // Store the pending quantity in ref (not affected by closure)
      pendingQuantityRef.current[variantId] = newQuantity;

      // ✅ OPTIMISTIC UPDATE: Update UI immediately
      const optimisticItems = items.map(item => {
        const itemVariantId = item.variant?._id || item.variant?.id || item.variantId;
        if (String(itemVariantId) === String(variantId)) {
          return { ...item, quantity: newQuantity };
        }
        return item;
      }).filter(item => item.quantity > 0); // Remove items with quantity 0

      setItems(optimisticItems);
      setCart(prev => ({ ...prev, items: optimisticItems }));

      // 🚀 IMMEDIATE broadcast for optimistic update (other tabs see it instantly)
      broadcastCartUpdate({ ...cart, items: optimisticItems });

      // Cancel previous debounce timer for this item
      if (debounceTimersRef.current[variantId]) {
        clearTimeout(debounceTimersRef.current[variantId]);
      }

      // Abort previous request for this item
      if (itemAbortControllersRef.current[variantId]) {
        itemAbortControllersRef.current[variantId].abort();
        delete itemAbortControllersRef.current[variantId];
      }

      // Show loading indicator (but UI already updated)
      setItemLoading((prev) => ({ ...prev, [variantId]: true }));

      // Debounce API call: 150ms (reduced from 300ms for faster sync)
      debounceTimersRef.current[variantId] = setTimeout(async () => {
        try {
          // Get the LATEST pending quantity from ref (not stale closure)
          const targetQuantity = pendingQuantityRef.current[variantId];
          
          if (targetQuantity === undefined) {
            setItemLoading((prev) => ({ ...prev, [variantId]: false }));
            return;
          }

          // Create new abort controller for this request
          const abortController = new AbortController();
          itemAbortControllersRef.current[variantId] = abortController;

          // Fetch current server state to calculate correct diff
          let updatedCart;
          if (targetQuantity === 0) {
            // Remove item completely
            updatedCart = await removeItemFromCart(cartId, { 
              variantId, 
              quantity: 999, // Remove all
              signal: abortController.signal 
            });
          } else {
            // Fetch fresh server cart to get accurate server quantity
            const fetchFn = userIdRef.current ? getCartByUser : getCartBySession;
            const param = userIdRef.current || getSessionId();
            const serverCart = await fetchFn(param);
            
            const serverItem = serverCart?.items?.find(item => {
              const itemVariantId = item.variant?._id || item.variant?.id || item.variantId;
              return String(itemVariantId) === String(variantId);
            });
            const serverQty = serverItem?.quantity || 0;
            const actualDiff = targetQuantity - serverQty;

            if (actualDiff === 0) {
              setItemLoading((prev) => ({ ...prev, [variantId]: false }));
              delete pendingQuantityRef.current[variantId];
              return;
            }

            if (actualDiff > 0) {
              updatedCart = await addItemToCart({ 
                cartId, 
                variantId, 
                quantity: actualDiff,
                signal: abortController.signal 
              });
            } else {
              updatedCart = await removeItemFromCart(cartId, { 
                variantId, 
                quantity: Math.abs(actualDiff),
                signal: abortController.signal 
              });
            }
          }

          // Sync with server response (only if not aborted)
          if (updatedCart && !abortController.signal.aborted) {
            setCart(updatedCart);
            setItems(updatedCart.items || []);
            
            // Broadcast to other tabs
            broadcastCartUpdate(updatedCart);
          }
          
          // Clear tracking after success
          delete itemAbortControllersRef.current[variantId];
          delete pendingQuantityRef.current[variantId];
        } catch (err) {
          // Ignore abort errors (from newer requests cancelling this one)
          if (err.name === 'AbortError') {
            return;
          }
          
          console.error("[useCart] ❌ Failed to sync quantity:", err);
          setError(err.message || "Failed to update quantity");
          // Revert optimistic update on error
          await fetchCartRef.current(true);
        } finally {
          setItemLoading((prev) => ({ ...prev, [variantId]: false }));
          // Clear debounce timer
          delete debounceTimersRef.current[variantId];
        }
      }, 150);
    },
    [cart, items, getSessionId, broadcastCartUpdate]
  );

  const addItem = useCallback(
    async (variantId, quantity = 1) => {
      if (!variantId) return;

      setItemLoading((prev) => ({ ...prev, [variantId]: true }));

      try {
        const currentCart = await ensureCart();
        const cartId = currentCart._id || currentCart.id;

        // Create abort controller
        const abortController = new AbortController();
        itemAbortControllersRef.current[variantId] = abortController;

        // Backend returns updated cart
        const updatedCart = await addItemToCart({ 
          cartId, 
          variantId, 
          quantity,
          signal: abortController.signal 
        });
        if (updatedCart) {
          delete itemAbortControllersRef.current[variantId];
          setCart(updatedCart);
          setItems(updatedCart.items || []);
          
          // Broadcast to other tabs
          broadcastCartUpdate(updatedCart);
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        console.error("Failed to add item:", err);
        setError(err.message || "Failed to add item");
        await fetchCartRef.current(true); // Only fetch on error
      } finally {
        setItemLoading((prev) => ({ ...prev, [variantId]: false }));
      }
    },
    [ensureCart, broadcastCartUpdate]
  );

  const removeItem = useCallback(
    async (variantId, quantity = 1) => {
      const cartId = cart?._id || cart?.id;
      if (!cartId || !variantId) return;

      setItemLoading((prev) => ({ ...prev, [variantId]: true }));

      try {
        // Create abort controller
        const abortController = new AbortController();
        itemAbortControllersRef.current[variantId] = abortController;
        
        // Use server response directly (no optimistic update)
        const updatedCart = await removeItemFromCart(cartId, { 
          variantId, 
          quantity,
          signal: abortController.signal 
        });
        if (updatedCart) {
          delete itemAbortControllersRef.current[variantId];
          setCart(updatedCart);
          setItems(updatedCart.items || []);
          
          // Broadcast to other tabs
          broadcastCartUpdate(updatedCart);
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        console.error("Failed to remove item:", err);
        setError(err.message || "Failed to remove item");
        await fetchCartRef.current(true); // Revert on error
      } finally {
        setItemLoading((prev) => ({ ...prev, [variantId]: false }));
      }
    },
    [cart, broadcastCartUpdate]
  );

  const removeItemCompletely = useCallback(
    async (variantId) => {
      const cartId = cart?._id || cart?.id;
      if (!cartId || !variantId) return;

      const currentItem = items.find((item) => {
        const itemVariantId = item.variant?._id || item.variant?.id || item.variantId;
        return String(itemVariantId) === String(variantId);
      });

      if (!currentItem) return;

      setItemLoading((prev) => ({ ...prev, [variantId]: true }));

      try {
        // Cancel any pending debounced updates for this item
        if (debounceTimersRef.current[variantId]) {
          clearTimeout(debounceTimersRef.current[variantId]);
        }
        if (itemAbortControllersRef.current[variantId]) {
          itemAbortControllersRef.current[variantId].abort();
        }
        
        // Create abort controller for this request
        const abortController = new AbortController();
        
        // Use server response directly (no optimistic update)
        const updatedCart = await removeItemFromCart(cartId, { 
          variantId, 
          quantity: currentItem.quantity,
          signal: abortController.signal 
        });
        if (updatedCart) {
          setCart(updatedCart);
          setItems(updatedCart.items || []);
          
          // Broadcast to other tabs
          broadcastCartUpdate(updatedCart);
        }
      } catch (err) {
        console.error("Failed to remove item:", err);
        setError(err.message || "Failed to remove item");
        await fetchCartRef.current(true); // Revert on error
      } finally {
        setItemLoading((prev) => ({ ...prev, [variantId]: false }));
      }
    },
    [cart, items, broadcastCartUpdate]
  );

  const clearAllItems = useCallback(async () => {
    const cartId = cart?._id || cart?.id;
    if (!cartId) return;

    setLoading(true);
    try {
      // Use server response directly (no optimistic update)
      const clearedCart = await clearCart(cartId);
      if (clearedCart) {
        setCart(clearedCart);
        setItems([]);
        
        // Broadcast to other tabs
        broadcastCartUpdate(clearedCart);
      }
    } catch (err) {
      console.error("Failed to clear cart:", err);
      setError(err.message || "Failed to clear cart");
      await fetchCartRef.current(true); // Revert on error
    } finally {
      setLoading(false);
    }
  }, [cart, broadcastCartUpdate]);

  // Initial fetch - wait for auth to be ready, then fetch cart
  // Use stable ref to track if we've already fetched for this user/guest session
  const hasFetchedRef = useRef(false);
  const lastUserIdRef = useRef(userId);
  
  useEffect(() => {
    // Don't fetch cart while auth is still loading
    if (authLoading) {
      return;
    }
    
    // Detect userId change (login/logout)
    const userIdChanged = lastUserIdRef.current !== userId;
    
    if (userIdChanged) {
      lastUserIdRef.current = userId;
      hasFetchedRef.current = false;
      
      // Reset cart mode lock when user changes
      cartModeRef.current = null;
      lockedUserIdRef.current = null;
      lockedSessionIdRef.current = null;
    }
    
    // Only fetch if we haven't fetched for this user/guest session
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchCartRef.current();
    }
  }, [authLoading, userId]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Cart summary
  const cartSummary = {
    itemCount: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
    subtotal: items.reduce((sum, item) => {
      const price = item.price || 0;
      const quantity = item.quantity || 0;
      return sum + price * quantity;
    }, 0),
  };

  const isInCart = useCallback(
    (variantId) => {
      return items.some((item) => {
        const itemVariantId = item.variant?._id || item.variant?.id || item.variantId;
        return itemVariantId === variantId;
      });
    },
    [items]
  );

  const getQuantity = useCallback(
    (variantId) => {
      const item = items.find((item) => {
        const itemVariantId = item.variant?._id || item.variant?.id || item.variantId;
        return itemVariantId === variantId;
      });
      return item?.quantity || 0;
    },
    [items]
  );

  const getItemVariantId = useCallback((item) => {
    return item?.variant?._id || item?.variant?.id || item?.variantId || null;
  }, []);

  return {
    cart,
    items,
    cartItems: items,
    loading,
    error,
    itemLoading,
    addItem,
    removeItem,
    updateItemQuantity,
    removeItemCompletely,
    clearAllItems,
    refetch: () => fetchCartRef.current(),
    cartSummary,
    isInCart,
    getQuantity,
    getItemVariantId,
  };
}
