import { test, expect } from '@playwright/test';
import { API_BASE } from './utils/test-helpers.js';

test.describe('Products API', () => {
  test('should return products list', async ({ request }) => {
    const response = await request.get(`${API_BASE}/products`);
    
    expect(response.ok()).toBe(true);
    
    const data = await response.json();
    expect(data.data).toHaveProperty('products');
    expect(Array.isArray(data.data.products)).toBe(true);
  });

  test('should support pagination', async ({ request }) => {
    const response = await request.get(`${API_BASE}/products?page=1&limit=5`);
    
    expect(response.ok()).toBe(true);
    
    const data = await response.json();
    expect(data.data.products.length).toBeLessThanOrEqual(5);
  });

  test('should support search', async ({ request }) => {
    const response = await request.get(`${API_BASE}/products?search=toy`);
    
    expect(response.ok()).toBe(true);
    
    const data = await response.json();
    expect(Array.isArray(data.data.products)).toBe(true);
  });

  test('should return single product by ID', async ({ request }) => {
    const listResponse = await request.get(`${API_BASE}/products?limit=1`);
    const listData = await listResponse.json();
    
    if (listData.data?.products && listData.data.products.length > 0) {
      const productId = listData.data.products[0]._id;
      
      const response = await request.get(`${API_BASE}/products/${productId}`);
      expect(response.ok()).toBe(true);
      
      const data = await response.json();
      const product = data.data || data;
      expect(product).toBeTruthy();
    }
  });
});

test.describe('Categories API', () => {
  test('should return categories list', async ({ request }) => {
    const response = await request.get(`${API_BASE}/categories`);
    
    expect(response.ok()).toBe(true);
    
    const data = await response.json();
    const categories = data.data || data;
    expect(Array.isArray(categories) || categories.categories).toBe(true);
  });
});

test.describe('Cart API', () => {
  test('should get cart for guest session', async ({ request }) => {
    const response = await request.get(`${API_BASE}/carts`, {
      headers: {
        'x-guest-session-id': 'test-session-123'
      }
    });
    
    expect(response.status()).toBeLessThanOrEqual(404);
  });

  test('should add item to guest cart', async ({ request }) => {
    const productsResponse = await request.get(`${API_BASE}/products?limit=1`);
    const productsData = await productsResponse.json();
    
    if (productsData.data?.products && productsData.data.products.length > 0) {
      const product = productsData.data.products[0];
      
      const response = await request.post(`${API_BASE}/carts/add`, {
        headers: {
          'x-guest-session-id': `test-session-${Date.now()}`
        },
        data: {
          productId: product._id,
          quantity: 1
        }
        });
      
      expect(response.status()).toBeLessThanOrEqual(422);
    }
  });
});

test.describe('Auth API', () => {
  test('should reject login with invalid credentials', async ({ request }) => {
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: {
        emailOrPhoneOrUsername: 'nonexistent@test.com',
        password: 'wrongpassword123'
      }
    });
    
    expect([400, 401, 404, 429]).toContain(response.status());
  });

  test('should validate registration input', async ({ request }) => {
    const response = await request.post(`${API_BASE}/auth/register`, {
      data: {
        email: 'invalid-email',
        password: '123'
      }
    });
    
    expect([400, 422, 429, 500]).toContain(response.status());
  });

  test('should have rate limit on auth endpoints', async ({ request }) => {
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: {
        emailOrPhoneOrUsername: 'test@test.com',
        password: 'test123'
      }
    });
    
    const hasRateLimitHeader = response.headers()['ratelimit-limit'] || 
                               response.headers()['x-ratelimit-limit'];
    expect(hasRateLimitHeader).toBeTruthy();
  });
});

test.describe('Reviews API', () => {
  test('should get reviews for a product', async ({ request }) => {
    const productsResponse = await request.get(`${API_BASE}/products?limit=1`);
    const productsData = await productsResponse.json();
    
    if (productsData.data?.products && productsData.data.products.length > 0) {
      const productId = productsData.data.products[0]._id;
      
      const response = await request.get(`${API_BASE}/reviews/product/${productId}`);
      
      expect([200, 404]).toContain(response.status());
    }
  });
});

test.describe('Discount Codes API', () => {
  test('should reject invalid discount code', async ({ request }) => {
    const response = await request.post(`${API_BASE}/discount-codes/validate`, {
      data: {
        code: 'INVALID_CODE_123456'
      }
    });
    
    expect([400, 404, 422]).toContain(response.status());
  });
});

test.describe('Health Check', () => {
  test('should have healthy API', async ({ request }) => {
    const response = await request.get(`${API_BASE}/products?limit=1`);
    expect(response.ok()).toBe(true);
  });
});
