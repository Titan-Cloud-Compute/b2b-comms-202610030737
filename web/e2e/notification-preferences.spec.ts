/**
 * Hermetic spec for Story: notification-preferences.
 * All /api/** calls are intercepted with an in-memory backend that mirrors the
 * server contract: effective-dated preferences filter the alert feed by the
 * preference in force when each event occurred.
 */
import { test, expect, type Page } from '@playwright/test';

interface Pref { orderAlerts: boolean; messageAlerts: boolean; effectiveFrom: number }
interface Event { id: string; kind: 'order' | 'message'; body: string; createdAt: number }
interface Store { prefs: Pref[]; events: Event[]; puts: unknown[] }

function prefAt(store: Store, at: number): Pref {
  let cur: Pref = { orderAlerts: true, messageAlerts: true, effectiveFrom: 0 };
  for (const p of store.prefs) if (p.effectiveFrom <= at) cur = p;
  return cur;
}

async function mockApi(page: Page, store: Store): Promise<void> {
  const user = { id: 'cust1', email: 'user@example.com', role: 'USER' };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname.replace(/^.*\/api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') return json(user);
    if (method === 'GET' && apiPath === 'users/me') return json(user);
    if (apiPath === 'notifications/preferences') {
      const cur = prefAt(store, Date.now());
      if (method === 'GET') return json({ orderAlerts: cur.orderAlerts, messageAlerts: cur.messageAlerts });
      const body = req.postDataJSON() as Partial<Pref>;
      store.puts.push(body);
      const next = {
        orderAlerts: typeof body.orderAlerts === 'boolean' ? body.orderAlerts : cur.orderAlerts,
        messageAlerts: typeof body.messageAlerts === 'boolean' ? body.messageAlerts : cur.messageAlerts,
      };
      store.prefs.push({ ...next, effectiveFrom: Date.now() });
      return json(next);
    }
    if (method === 'GET' && apiPath === 'notifications/feed') {
      const items = store.events
        .filter(e => (e.kind === 'order' ? prefAt(store, e.createdAt).orderAlerts : prefAt(store, e.createdAt).messageAlerts))
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(e => ({ ...e, createdAt: new Date(e.createdAt).toISOString() }));
      return json(items);
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

async function login(page: Page): Promise<void> {
  await page.goto('/#/login');
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => !url.hash.includes('/login'), { timeout: 10_000 });
}

test.use({ serviceWorkers: 'block' });

test('turning off message alerts keeps new order alerts and drops new messages from the feed', async ({ page }) => {
  const store: Store = {
    prefs: [],
    events: [{ id: 'm0', kind: 'message', body: 'Earlier hello', createdAt: Date.now() - 60_000 }],
    puts: [],
  };
  await mockApi(page, store);
  await login(page);
  await page.goto('/#/notifications');

  const form = page.getByTestId('notification-preferences');
  await expect(form.getByTestId('pref-order-alerts')).toBeChecked();
  await expect(form.getByTestId('pref-message-alerts')).toBeChecked();
  await expect(page.getByTestId('notification-feed')).toContainText('Earlier hello');

  await form.getByTestId('pref-message-alerts').uncheck();
  await expect(page.getByTestId('pref-status')).toContainText('saved');
  expect(store.puts).toEqual([{ orderAlerts: true, messageAlerts: false }]);

  // New events happen after the preference change.
  const later = Date.now() + 1_000;
  store.events.push({ id: 'n1', kind: 'order', body: 'Order o1 confirmed', createdAt: later });
  store.events.push({ id: 'm1', kind: 'message', body: 'Fresh channel message', createdAt: later });

  await page.reload();
  await expect(page.getByTestId('pref-message-alerts')).not.toBeChecked();
  await expect(page.getByTestId('pref-order-alerts')).toBeChecked();
  const feed = page.getByTestId('notification-feed');
  await expect(feed).toContainText('Order o1 confirmed');
  await expect(feed).not.toContainText('Fresh channel message');
  await expect(feed).toContainText('Earlier hello');
});
