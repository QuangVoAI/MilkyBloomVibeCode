/* global process */

const DEFAULT_API_BASE = 'http://localhost:6969/api';
const DEFAULT_APP_BASE = 'http://localhost:5173';

export const API_BASE =
  process.env.PW_API_BASE_URL ||
  process.env.VITE_API_URL ||
  DEFAULT_API_BASE;
export const APP_BASE =
  process.env.PW_APP_BASE_URL ||
  process.env.VITE_APP_URL ||
  DEFAULT_APP_BASE;

export function generateTestEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
}

export function generateTestUsername() {
  return `testuser_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function generateGuestSessionId() {
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function waitForApi(request, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await request.get(`${API_BASE}/products?limit=1`);
      if (response.ok()) {
        return true;
      }
    } catch {
      // API not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

export async function getProductId(request) {
  const response = await request.get(`${API_BASE}/products?limit=1`);
  const data = await response.json();
  return data.data?.products?.[0]?._id || null;
}

export async function clearStorage(page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

export async function loginUser(page, email, password) {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
}

export async function elementExists(page, selector) {
  return await page.locator(selector).count() > 0;
}

export async function waitForToast(page, text) {
  await page.locator(`text=${text}`).waitFor({ timeout: 5000 });
}

export function formatPrice(price) {
  return new Intl.NumberFormat('vi-VN').format(price);
}
