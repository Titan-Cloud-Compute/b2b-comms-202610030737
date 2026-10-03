/**
 * Hermetic spec for Story: audit-log.
 * All /api/** calls are intercepted; GET admin/audit-log serves an in-memory trail.
 */
import { test, expect, type Page } from '@playwright/test';

const ENTRIES = [
  { id: 'a1', actor: 'SYSTEM', actorUserId: null, actorEmail: null, action: 'system.startup', outcome: 'success', payloadJson: {}, createdAt: '2026-10-01T08:00:00.000Z' },
  { id: 'a3', actor: 'ADMIN', actorUserId: 'adm', actorEmail: 'admin@example.com', action: 'admin.user.create', outcome: 'success', payloadJson: { outcome: 'success' }, createdAt: '2026-10-03T09:30:00.000Z' },
  { id: 'a2', actor: 'USER', actorUserId: 'u1', actorEmail: 'user@example.com', action: 'auth.login', outcome: 'failure', payloadJson: { outcome: 'failure' }, createdAt: '2026-10-02T12:00:00.000Z' },
];

async function mockAdminApi(page: Page): Promise<string[]> {
  const user = { id: 'adm', email: 'admin@example.com', role: 'ADMIN' };
  const auditCalls: string[] = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const url = new URL(req.url());
    const apiPath = url.pathname.replace(/^.*\/api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') return json(user);
    if (method === 'GET' && apiPath === 'users/me') return json(user);
    if (method === 'GET' && apiPath === 'admin/audit-log') {
      auditCalls.push(url.search);
      const actor = url.searchParams.get('actor');
      const rows = ENTRIES.filter((e) => !actor || e.actor === actor);
      return json({ rows, total: rows.length, page: 1, pageSize: 50 });
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
  return auditCalls;
}

test.use({ serviceWorkers: 'block' });

test('admin opens the Audit Log tab and sees entries newest first', async ({ page }) => {
  const auditCalls = await mockAdminApi(page);
  await page.goto('/#/login');
  await page.locator('#email').fill('admin@example.com');
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.hash.includes('/login'), { timeout: 10_000 });

  await page.goto('/#/admin/audit-log');
  await expect(page.locator('h1')).toContainText('Audit Log');
  await expect(page.locator('h1')).not.toContainText('Admin Overview');

  const rows = page.getByTestId('audit-log-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('admin.user.create');
  await expect(rows.nth(0)).toContainText('admin@example.com');
  await expect(rows.nth(1)).toContainText('auth.login');
  await expect(rows.nth(1)).toContainText('failure');
  await expect(rows.nth(2)).toContainText('system.startup');
  await expect(rows.nth(2)).toContainText('SYSTEM');
  expect(auditCalls.length).toBeGreaterThan(0);

  await page.getByTestId('audit-log-actor-filter').selectOption('USER');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('user@example.com');
});
