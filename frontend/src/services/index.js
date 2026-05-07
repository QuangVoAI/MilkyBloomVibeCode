export * from './products.service';
export * from './users.service';
export * from './orders.service';
export * from './cart.service';
export * from './reviews.service';
export * from './comments.service';
export * from './discountCodes.service';
export * from './categories.service';
export * from './dashboard.service';
export * from './addresses.service';
export * from './payments.service';
export * from './shipping.service';
export * from './chat.service';
// Socket service is NOT exported here - import directly to avoid bundling in main chunk
// import { socketService } from '@/services/socket.service';
export * from './config';
export * from '../utils/apiHelpers';
export * from '../utils/authHelpers';

// Organize by module
import * as productsService from './products.service';
import * as usersService from './users.service';
import * as ordersService from './orders.service';
import * as cartService from './cart.service';
import * as reviewsService from './reviews.service';
import * as commentsService from './comments.service';
import * as discountCodesService from './discountCodes.service';
import * as categoriesService from './categories.service';
import * as dashboardService from './dashboard.service';
import * as addressesService from './addresses.service';
import * as paymentsService from './payments.service';
import * as shippingService from './shipping.service';
import * as chatService from './chat.service';

export default {
  products: productsService,
  users: usersService,
  orders: ordersService,
  cart: cartService,
  reviews: reviewsService,
  comments: commentsService,
  discountCodes: discountCodesService,
  categories: categoriesService,
  dashboard: dashboardService,
  addresses: addressesService,
  payments: paymentsService,
  shipping: shippingService,
  chat: chatService,
};
