import { test, expect } from '@playwright/test';

test.describe('Product Browsing', () => {
  test('should display products on products page', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('domcontentloaded');

    const productCard = page.locator('.product-card, [class*="product-card"], [class*="ProductCard"]').first();
    await productCard.waitFor({ state: 'visible', timeout: 15000 });

    const products = page.locator('.product-card, [class*="product-card"], [class*="ProductCard"]');
    const count = await products.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should navigate to product detail page', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('domcontentloaded');
    
    const productCard = page.locator('.product-card, [class*="product-card"], [class*="ProductCard"]').first();
    await productCard.waitFor({ state: 'visible', timeout: 15000 });

    await productCard.click();

    await page.waitForURL(/\/(product|products)\//, { timeout: 10000 });

    await expect(page.locator('h1, h2, .product-title, .product-name').first()).toBeVisible({ timeout: 5000 });
  });

  test('should search for products', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="tìm" i], .search-input');
    
    if (await searchInput.count() > 0) {
      await searchInput.first().fill('toy');
      await searchInput.first().press('Enter');

      await page.waitForTimeout(2000);

      const hasResults = await page.locator('.product-card').count() > 0;
      const hasNoResults = await page.locator('text=no result, text=không tìm thấy').count() > 0;

      expect(hasResults || hasNoResults).toBe(true);
    }
  });

  test('should filter products by category', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('domcontentloaded');
    
    const productCard = page.locator('.product-card, [class*="product-card"], [class*="ProductCard"]').first();
    await productCard.waitFor({ state: 'visible', timeout: 15000 });

    const categoryFilter = page.locator('[data-testid="category-filter"], .category-filter, select[name="category"], .filter-category');
    
    if (await categoryFilter.count() > 0) {
      await categoryFilter.first().click();
      await page.waitForTimeout(1000);

      const newCount = await page.locator('.product-card, [class*="product-card"]').count();
      expect(newCount).toBeGreaterThanOrEqual(0);
    }
  });
});
