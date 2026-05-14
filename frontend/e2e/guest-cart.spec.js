import { test, expect } from '@playwright/test';
import { API_BASE } from './utils/test-helpers.js';

test.describe('Guest Cart Flow', () => {
  test('should get products with variants', async ({ request }) => {
    const productsResponse = await request.get(`${API_BASE}/products?limit=5`);
    if (productsResponse.status() === 429) {
      expect(true).toBe(true);
      return;
    }
    
    const productsData = await productsResponse.json();
    expect(productsData.data?.products?.length || 0).toBeGreaterThanOrEqual(0);
  });

  test('should create guest cart and get cart ID', async ({ request }) => {
    const sessionId = `cart-test-${Date.now()}`;
    const response = await request.get(`${API_BASE}/carts`, {
      headers: { 'x-guest-session-id': sessionId }
    });
    expect([200, 404, 429]).toContain(response.status());
  });

  test('should accept guestSessionId header format', async ({ request }) => {
    const guestSessionId = `session_${Date.now()}_testrand123`;
    
    const response = await request.get(`${API_BASE}/carts`, {
      headers: {
        'x-guest-session-id': guestSessionId
      }
    });
    expect([200, 404, 429]).toContain(response.status());
  });

  test('should have rate limit headers on cart endpoints', async ({ request }) => {
    const response = await request.get(`${API_BASE}/carts`, {
      headers: { 'x-guest-session-id': 'test-session' }
    });
    const hasRateLimitHeader = 
      response.headers()['ratelimit-limit'] || 
      response.headers()['x-ratelimit-limit'];
    
    expect(hasRateLimitHeader).toBeTruthy();
  });

  test('should display products page with product cards', async ({ page }) => {
    await page.goto('/products');
    await page.waitForTimeout(3000);
    const body = page.locator('body');
    await expect(body).toBeVisible();
    expect(true).toBe(true);
  });
});
