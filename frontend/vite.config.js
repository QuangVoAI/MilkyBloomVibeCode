import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    middlewareMode: false,
    historyApiFallback: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Optimize chunk sizes
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Heavy map library - only load for admin dashboard
          if (id.includes('maplibre-gl')) {
            return 'map-vendor';
          }
          // Socket.io - only load when needed for real-time features
          if (id.includes('socket.io')) {
            return 'socket-vendor';
          }
          // React core - rarely changes, good for caching
          if (id.includes('react-dom') || id.includes('react/')) {
            return 'react-vendor';
          }
          // Router - separate chunk
          if (id.includes('react-router')) {
            return 'router-vendor';
          }
          // UI libraries (Radix, Framer Motion)
          if (id.includes('@radix-ui') || id.includes('framer-motion')) {
            return 'ui-vendor';
          }
          // Date utilities
          if (id.includes('date-fns')) {
            return 'date-vendor';
          }
        },
        // Hashed filenames for long-term caching
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Use terser for better minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Disable source maps for production
    sourcemap: false,
    // Target modern browsers
    target: 'es2020',
    // Inline small assets (< 4kb)
    assetsInlineLimit: 4096,
    // CSS minification
    cssMinify: true,
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
});
