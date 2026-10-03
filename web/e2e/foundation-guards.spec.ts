/**
 * Hermetic spec for auth + role route guards (three-role model).
 *
 * All /api/** calls are intercepted — nothing reaches the network.
 * serviceWorkers:'block' prevents the ngsw worker from intercepting fetches
 * before page.route() can handle them.
 */
import { test, expect, type Page } from '@playwright/test';

type Role = 'USER' | 'MANAGER' | 'ADMIN';

async function mockApiWithRole(page: Page, role: Role): Promise<void> {
  const user = { id: '1', email: `${role.toLowerCase()}@example.com`, role };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname
      .replace(/^.*\/api\//, '').replace(/^api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') {
      return json(user);
    }
    if (method === 'GET' && apiPath === 'users/me') {
      return json(user);
    }
    if (method === 'GET' && apiPath === 'users/me/notification-preferences') {
      return json({ diagnosticReadyEmail: false });
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

async function loginAs(page: Page, role: Role): Promise<void> {
  await page.goto('/#/login');
  await page.locator('#email').fill(`${role.toLowerCase()}@example.com`);
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  // Wait for navigation away from login
  await page.waitForURL(url => !url.hash.includes('/login'), { timeout: 10_000 });
}

test.use({ serviceWorkers: 'block' });

test('signed-out navigation to /#/dashboard redirects to /#/login with returnUrl', async ({ page }) => {
  // Mock API to return 401 for users/me (no session)
  await page.route('**/api/**', async (route) => {
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const req = route.request();
    const method = req.method().toUpperCase();
    if (method === 'GET') return json({ message: 'Unauthorized' }, 401);
    return json({ ok: true });
  });

  await page.goto('/#/dashboard');
  await page.waitForLoadState('networkidle');

  const url = page.url();
  expect(url).toMatch(/#\/login/);
  expect(url).toMatch(/returnUrl/);
});

test('USER navigating to /#/admin/users is redirected to /#/dashboard', async ({ page }) => {
  await mockApiWithRole(page, 'USER');
  await loginAs(page, 'USER');

  await page.goto('/#/admin/users');
  await page.waitForLoadState('networkidle');

  expect(page.url()).toMatch(/#\/dashboard/);
});

test('MANAGER login stores role MANAGER and lands on /#/dashboard', async ({ page }) => {
  await mockApiWithRole(page, 'MANAGER');
  await loginAs(page, 'MANAGER');

  // Should land on dashboard (MANAGER is not ADMIN, no returnUrl)
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });

  // Verify localStorage stores role MANAGER
  const stored = await page.evaluate(() => localStorage.getItem('user'));
  expect(stored).not.toBeNull();
  const user = JSON.parse(stored!);
  expect(user.role).toBe('MANAGER');
});

test('ADMIN navigating to /#/admin/users stays on /#/admin/users', async ({ page }) => {
  await mockApiWithRole(page, 'ADMIN');
  await loginAs(page, 'ADMIN');

  await page.goto('/#/admin/users');
  await page.waitForLoadState('networkidle');

  expect(page.url()).toMatch(/#\/admin\/users/);
});
