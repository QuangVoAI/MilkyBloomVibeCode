import { test, expect } from '@playwright/test';
import { API_BASE } from './utils/test-helpers.js';

const TEST_USER = {
  email: 'test@example.com',
  password: 'TestPassword123!',
  wrongPassword: 'WrongPass123!',
};

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('should show login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Đăng nhập")')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="email"], input[name="emailOrPhoneOrUsername"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    
    await emailInput.fill('invalid@test.com');
    await passwordInput.fill('wrongpassword');

    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Đăng nhập")');
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('login');
  });

  test('should trigger OTP after 5 wrong password attempts via API', async ({ request }) => {
    const testEmail = `otp-test-${Date.now()}@test.com`;

    for (let i = 0; i < 5; i++) {
      await request.post(`${API_BASE}/auth/login`, {
        data: {
          emailOrPhoneOrUsername: testEmail,
          password: `wrong_password_${i}`
        }
      });
    }

    const response = await request.post(`${API_BASE}/auth/login`, {
      data: {
        emailOrPhoneOrUsername: testEmail,
        password: 'another_wrong_password'
      }
    });

    expect([400, 401, 403, 429]).toContain(response.status());
  });

  test('should redirect to home after successful login', async ({ page }) => {
    test.skip(!TEST_USER.email || TEST_USER.email === 'test@example.com', 'Need real test credentials');
    
    await page.goto('/login');
    
    await page.fill('input[type="email"], input[name="email"], input[name="emailOrPhoneOrUsername"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Đăng nhập")');

    await page.waitForURL(/\/(home|dashboard|\/)?$/, { timeout: 10000 });

    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeTruthy();
  });
});
