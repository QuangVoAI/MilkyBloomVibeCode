import React, { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import Layout from '../components/Layout'
import ErrorBoundary from '../components/ErrorBoundary'
import ProtectedRoute from '../components/ProtectedRoute'
import GuestRoute from '../components/GuestRoute'
import { ROUTES } from '../config/routes'
import { LoadingSpinner } from '../components/common'
import { AuthProvider } from '../context/AuthProvider'
import { CartProvider } from '../context/CartProvider'

// Lazy load route components for code splitting
const Home = lazy(() => import('../pages/Home'));
const Collection = lazy(() => import('../pages/Collection'));
const Products = lazy(() => import('../pages/Products').then(m => ({ default: m.Products })));
const ProductDetail = lazy(() => import('../pages/Products').then(m => ({ default: m.ProductDetail })));
const About = lazy(() => import('../pages/About'));
const Contact = lazy(() => import('../pages/Contact'));
const Cart = lazy(() => import('../pages/Cart/index'));
const Checkout = lazy(() => import('../pages/Checkout'));
const Login = lazy(() => import('../pages/Auth/Login/Login'));
const Signup = lazy(() => import('../pages/Auth/Signup/Signup'));
const VerifyEmail = lazy(() => import('../pages/Auth/Signup/VerifyEmail'));
const ResetPassword = lazy(() => import('../pages/Auth/ResetPassword'));
const PlaceOrder = lazy(() => import('../pages/PlaceOrder'));
const Orders = lazy(() => import('../pages/Orders'));
const OrderHistory = lazy(() => import('../pages/OrderHistory'));
const OrderDetail = lazy(() => import('../pages/OrderHistory/OrderDetail'));
const Payment = lazy(() => import('../pages/Payment'));
const Profile = lazy(() => import('../pages/Profile'));
const AdminPanel = lazy(() => import('../pages/AdminPanel'));
const Dashboard = lazy(() => import('../pages/AdminPanel/Dashboard'));
const ChatbotQuality = lazy(() => import('../pages/AdminPanel/ChatbotQuality'));
const Users = lazy(() => import('../pages/AdminPanel/Users'));
const AdminProducts = lazy(() => import('../pages/AdminPanel/Products'));
const AdminOrders = lazy(() => import('../pages/AdminPanel/Orders'));
const DiscountCodes = lazy(() => import('../pages/AdminPanel/DiscountCodes'));
const SupportTickets = lazy(() => import('../pages/AdminPanel/SupportTickets'));
const SupportTicketDetail = lazy(() => import('../pages/AdminPanel/SupportTickets/Detail'));
const CarouselDemo = lazy(() => import('../pages/CarouselDemo'));

// Loading component for Suspense fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
    <LoadingSpinner size="lg" />
  </div>
);

// Root layout that wraps everything with providers
const RootLayout = () => (
  <AuthProvider>
    <CartProvider>
      <Outlet />
    </CartProvider>
  </AuthProvider>
);

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: ROUTES.LOGIN,
        element: (
          <Suspense fallback={<PageLoader />}>
            <GuestRoute>
              <Login />
            </GuestRoute>
          </Suspense>
        )
      },
      {
        path: ROUTES.REGISTER,
        element: (
          <Suspense fallback={<PageLoader />}>
            <GuestRoute>
              <Signup />
            </GuestRoute>
          </Suspense>
        )
      },
      {
        path: ROUTES.RESET_PASSWORD,
        element: (
          <Suspense fallback={<PageLoader />}>
            <GuestRoute>
              <ResetPassword />
            </GuestRoute>
          </Suspense>
        )
      },
      {
        path: "/verify-email",
        element: <Suspense fallback={<PageLoader />}><VerifyEmail /></Suspense>
      },
      
      // Admin routes with nested routing
      {
        path: ROUTES.ADMIN,
        element: (
          <Suspense fallback={<PageLoader />}>
            <ProtectedRoute adminOnly={true}>
              <AdminPanel />
            </ProtectedRoute>
          </Suspense>
        ),
        children: [
          {
            index: true,
            element: <Suspense fallback={<PageLoader />}><Dashboard /></Suspense>
          },
          {
            path: 'chatbot-quality',
            element: <Suspense fallback={<PageLoader />}><ChatbotQuality /></Suspense>
          },
          {
            path: 'users',
            element: <Suspense fallback={<PageLoader />}><Users /></Suspense>
          },
          {
            path: 'products',
            element: <Suspense fallback={<PageLoader />}><AdminProducts /></Suspense>
          },
          {
            path: 'orders',
            element: <Suspense fallback={<PageLoader />}><AdminOrders /></Suspense>
          },
          {
            path: 'discount-codes',
            element: <Suspense fallback={<PageLoader />}><DiscountCodes /></Suspense>
          },
          {
            path: 'support-tickets',
            element: <Suspense fallback={<PageLoader />}><SupportTickets /></Suspense>
          },
          {
            path: 'support-tickets/:ticketId',
            element: <Suspense fallback={<PageLoader />}><SupportTicketDetail /></Suspense>
          }
        ]
      },

      // Main app routes with Layout
      {
        element: <Layout />,
        errorElement: <ErrorBoundary />,
        children: [
          {
            path: ROUTES.HOME,
            element: <Suspense fallback={<PageLoader />}><Home /></Suspense>,
            errorElement: <ErrorBoundary />
          },
          {
            path: ROUTES.COLLECTION,
            element: <Suspense fallback={<PageLoader />}><Collection /></Suspense>,
            errorElement: <ErrorBoundary />
          },
          {
            path: ROUTES.PRODUCTS,
            element: <Suspense fallback={<PageLoader />}><Products /></Suspense>
          },
          {
            path: ROUTES.PRODUCT_DETAIL,
            element: <Suspense fallback={<PageLoader />}><ProductDetail /></Suspense>
          },
          {
            path: ROUTES.ABOUT,
            element: <Suspense fallback={<PageLoader />}><About /></Suspense>
          },
          {
            path: ROUTES.CONTACT,
            element: <Suspense fallback={<PageLoader />}><Contact /></Suspense>
          },
          {
            path: ROUTES.CART,
            element: <Suspense fallback={<PageLoader />}><Cart /></Suspense>
          },
          {
            path: ROUTES.CHECKOUT,
            element: <Suspense fallback={<PageLoader />}><Checkout /></Suspense>
          },
          {
            path: ROUTES.PLACE_ORDER,
            element: <Suspense fallback={<PageLoader />}><PlaceOrder /></Suspense>
          },
          {
            path: ROUTES.PAYMENT,
            element: <Suspense fallback={<PageLoader />}><Payment /></Suspense>
          },
          {
            path: ROUTES.ORDERS,
            element: <Suspense fallback={<PageLoader />}><Orders /></Suspense>
          },
          {
            path: ROUTES.ORDER_HISTORY,
            element: <Suspense fallback={<PageLoader />}><OrderHistory /></Suspense>
          },
          {
            path: `${ROUTES.ORDER_HISTORY}/:orderId`,
            element: <Suspense fallback={<PageLoader />}><OrderDetail /></Suspense>
          },
          {
            path: ROUTES.PROFILE,
            element: <Suspense fallback={<PageLoader />}><Profile /></Suspense>
          },
          {
            path: '/carousel-demo',
            element: <Suspense fallback={<PageLoader />}><CarouselDemo /></Suspense>
          }
        ]
      }
    ]
  }
])

const AppRoutes = () => {
  return (
    <RouterProvider 
      router={router}
      fallbackElement={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
          <LoadingSpinner size="lg" />
        </div>
      }
    />
  )
}

export default AppRoutes
