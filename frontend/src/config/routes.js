// Public routes
export const PUBLIC_ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  COLLECTION: '/collection',
  PRODUCTS: '/products',
  PRODUCT_DETAIL: '/products/:id',
  ABOUT: '/about',
  CONTACT: '/contact',
  CART: '/cart',
  CHECKOUT: '/checkout',
  PLACE_ORDER: '/place-order',
  PAYMENT: '/payment/:orderId',
  RESET_PASSWORD: '/reset-password',
  ORDERS: '/orders/:id',
  ORDER_HISTORY: '/order-history',
  PROFILE: '/profile',
};

// Admin routes
export const ADMIN_ROUTES = {
  BASE: '/admin',
  DASHBOARD: '/admin',
  USERS: '/admin/users',
  PRODUCTS: '/admin/products',
  ORDERS: '/admin/orders',
  SUPPORT_TICKETS: '/admin/support-tickets',
  CHATBOT_QUALITY: '/admin/chatbot-quality',
  DISCOUNT_CODES: '/admin/discount-codes',
  SETTINGS: '/admin/settings',
};

// Backward compatibility
export const ROUTES = {
  ...PUBLIC_ROUTES,
  ADMIN: ADMIN_ROUTES.BASE,
  ADMIN_USERS: ADMIN_ROUTES.USERS,
  ADMIN_PRODUCTS: ADMIN_ROUTES.PRODUCTS,
};
