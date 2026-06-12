const CartService = require('../services/cart.service');

const shouldReturnEmptyCart = (req) =>
    ['true', '1', 'yes'].includes(String(req.query.allowEmpty || '').toLowerCase());

const buildEmptySessionCart = (sessionId) => ({
    exists: false,
    sessionId,
    items: [],
    totalPrice: 0,
    totalItems: 0,
});

// Get all carts
const getAllCarts = async (req, res) => {
    try {
        const carts = await CartService.getAllCarts();
        res.status(200).json(carts);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Get cart by user ID
const getCartByUser = async (req, res) => {
    try {
        const cart = await CartService.getCartByUserOrSession({
            userId: req.params.userId,
        });
        if (!cart)
            return res.status(404).json({ message: "Cart not found" });
        
        // Prevent browser caching cart data
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        });
        res.status(200).json(cart);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Get cart by session ID
const getCartBySession = async (req, res) => {
    try {
        const cart = await CartService.getCartByUserOrSession({
            sessionId: req.params.sessionId,
        });
        if (!cart) {
            if (shouldReturnEmptyCart(req)) {
                return res.status(200).json(buildEmptySessionCart(req.params.sessionId));
            }
            return res.status(404).json({ message: "Cart not found" });
        }
        
        // Prevent browser caching cart data
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        });
        res.status(200).json(cart);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Create a new cart
const createCart = async (req, res) => {
    try {
        const cart = await CartService.createCart(req.body);
        res.status(201).json(cart);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Add an item to the cart
const addItem = async (req, res, next) => {
    try {
        const cartId = req.params.cartId;
        const itemData = req.body;

        const updatedCart = await CartService.addItem(cartId, itemData);

        // Prevent browser caching cart data
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        return res.status(200).json(updatedCart);
    } catch (error) {
        if (error.message === 'Variant not found') {
            return res.status(404).json({ success: false, message: 'Variant not found' });
        }
        if (error.message?.toLowerCase().includes('stock')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        next(error);
    }
};

// Remove an item from the cart
const removeItem = async (req, res, next) => {
    try {
        const { cartId } = req.params;
        const { variantId, quantity } = req.body;

        const updatedCart = await CartService.removeItem(cartId, { variantId, quantity });

        // Prevent browser caching cart data
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        res.status(200).json(updatedCart);
    } catch (err) {
        next(err);
    }
};

// Clear all items from the cart
const clearCart = async (req, res, next) => {
    try {
        const updated = await CartService.clearCart(req.params.cartId);
        res.status(200).json(updated);
    } catch (err) {
        next(err);
    }
};

// Delete the cart entirely
const deleteCart = async (req, res) => {
    try {
        const deleted = await CartService.deleteCart(req.params.cartId);
        if (!deleted)
            return res.status(404).json({ message: "Cart not found" });
        res.status(200).json({ message: "Cart deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * Merge guest cart into user cart
 * Called after OAuth login from frontend
 */
const mergeGuestCart = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const sessionId = req.headers['x-session-id'] || req.body.sessionId;
        
        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not authenticated' 
            });
        }
        
        if (!sessionId) {
            return res.status(400).json({ 
                success: false, 
                message: 'No sessionId provided' 
            });
        }
        
        const mergedCart = await CartService.mergeGuestCartIntoUserCart(userId, sessionId);
        
        res.status(200).json({ 
            success: true, 
            message: mergedCart ? 'Cart merged successfully' : 'No guest cart to merge',
            data: mergedCart 
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            message: err.message 
        });
    }
};

module.exports = {
    getAllCarts,
    getCartByUser,
    getCartBySession,
    createCart,
    addItem,
    removeItem,
    clearCart,
    deleteCart,
    mergeGuestCart,
};
