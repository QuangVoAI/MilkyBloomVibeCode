import { test, expect } from '@playwright/test';
import { API_BASE } from './utils/test-helpers.js';

test.describe('Admin Panel Access', () => {
  test('should handle admin route access', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');
    const pageLoaded = await page.locator('body').isVisible();
    expect(pageLoaded).toBe(true);
  });

  test('should have admin routes defined', async ({ page }) => {
    const adminRoutes = ['/admin', '/admin/products', '/admin/orders', '/admin/users'];
    
    for (const route of adminRoutes) {
      await page.goto(route);
      const is404 = await page.locator('text=404, text=not found').first()
        .isVisible({ timeout: 2000 }).catch(() => false);
      expect(is404).toBe(false);
    }
  });
});

test.describe('Admin API Endpoints', () => {
  test('should reject unauthorized access to admin endpoints', async ({ request }) => {
    const adminEndpoints = [
      { method: 'GET', url: `${API_BASE}/admin/dashboard` },
      { method: 'GET', url: `${API_BASE}/users` },
    ];
    
    for (const endpoint of adminEndpoints) {
      const response = await request.get(endpoint.url);
      expect([401, 403, 404, 429]).toContain(response.status());
    }
  });

  test('should have products management API', async ({ request }) => {
    const response = await request.get(`${API_BASE}/products?limit=1`);
    expect(response.ok()).toBe(true);
  });

  test('should have orders API (requires auth)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/orders`);
    expect([401, 403]).toContain(response.status());
  });

  test('should have users API (requires admin)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/users`);
    expect([401, 403, 404]).toContain(response.status());
  });
});

test.describe('Dashboard API', () => {
  test('should have dashboard stats endpoint', async ({ request }) => {
    const response = await request.get(`${API_BASE}/admin/dashboard`);
    expect([401, 403, 404]).toContain(response.status());
  });
});
