/**
 * Hermetic spec for Story: customer-invite.
 * All /api/** calls are intercepted with an in-memory backend that mirrors the
 * server contract: an admin sends an invitation (single-use activation token,
 * emailed as a link), and the customer redeems it on the public activation page.
 */
import { test, expect, type Page } from '@playwright/test';

interface Invite { id: string; email: string; token: string; status: 'PENDING' | 'ACCEPTED'; expiresAt: string; createdAt: string }
interface Store { invites: Invite[]; emails: { to: string; link: string }[]; accounts: string[] }

function view(i: Invite) {
  return { id: i.id, email: i.email, status: i.status, expiresAt: i.expiresAt, createdAt: i.createdAt, acceptedAt: null };
}

async function mockApi(page: Page, store: Store, role: 'ADMIN' | 'USER' = 'ADMIN'): Promise<void> {
  const user = { id: 'admin1', email: 'admin@example.com', role };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname.replace(/^.*\/api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') return json(user);
    if (method === 'GET' && apiPath === 'users/me') return json(user);
    if (apiPath === 'customer-invites') {
      if (role !== 'ADMIN') return json({ message: 'forbidden' }, 403);
      if (method === 'GET') return json([...store.invites].reverse().map(view));
      const { email } = req.postDataJSON() as { email: string };
      const token = `tok${store.invites.length + 1}`;
      const inv: Invite = {
        id: `i${store.invites.length + 1}`, email: email.trim().toLowerCase(), token, status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), createdAt: new Date().toISOString(),
      };
      store.invites.push(inv);
      store.emails.push({ to: inv.email, link: `/#/activate-invite?token=${token}` });
      return json(view(inv), 201);
    }
    const tok = apiPath.match(/^customer-invites\/token\/(.+)$/);
    if (method === 'GET' && tok) {
      const inv = store.invites.find(i => i.token === decodeURIComponent(tok[1]));
      return json(inv && inv.status === 'PENDING' ? { valid: true, email: inv.email } : { valid: false });
    }
    if (method === 'POST' && apiPath === 'customer-invites/activate') {
      const body = req.postDataJSON() as { token: string; password: string };
      const inv = store.invites.find(i => i.token === body.token && i.status === 'PENDING');
      if (!inv) return json({ message: 'invitation is invalid or has expired' }, 404);
      inv.status = 'ACCEPTED';
      store.accounts.push(inv.email);
      return json({ email: inv.email }, 201);
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

async function login(page: Page): Promise<void> {
  await page.goto('/#/login');
  await page.locator('#email').fill('admin@example.com');
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => !url.hash.includes('/login'), { timeout: 10_000 });
}

test.use({ serviceWorkers: 'block' });

test('admin invites a customer, who activates their account from the emailed link', async ({ page }) => {
  const store: Store = { invites: [], emails: [], accounts: [] };
  await mockApi(page, store);
  await login(page);
  await page.goto('/#/customer-invites');

  const form = page.getByTestId('customer-invite-form');
  await form.locator('input[type="email"]').fill('buyer@example.com');
  await form.getByTestId('invite-send').click();

  await expect(page.getByTestId('invite-status')).toContainText('Invitation sent to buyer@example.com');
  await expect(page.getByTestId('customer-invite-list')).toContainText('PENDING');
  await expect(page.getByTestId('customer-invite-list')).toContainText('buyer@example.com');
  await expect(page.getByTestId('invite-error')).toHaveCount(0);
  expect(store.emails).toEqual([{ to: 'buyer@example.com', link: '/#/activate-invite?token=tok1' }]);

  // The customer follows the emailed activation link.
  await page.goto(store.emails[0].link);
  await expect(page.getByTestId('activate-email')).toContainText('buyer@example.com');
  await page.getByTestId('activate-password').fill('password1234');
  await page.getByTestId('activate-submit').click();
  await expect(page.getByTestId('activate-status')).toContainText('is active');
  expect(store.accounts).toEqual(['buyer@example.com']);

  // The link is single-use.
  await page.goto('/#/login');
  await page.goto(store.emails[0].link);
  await expect(page.getByTestId('activate-error')).toContainText('invalid or has expired');
});

test('non-admins cannot open the invite page', async ({ page }) => {
  await mockApi(page, { invites: [], emails: [], accounts: [] }, 'USER');
  await login(page);
  await page.goto('/#/customer-invites');
  await expect(page).not.toHaveURL(/customer-invites/);
  await expect(page.getByTestId('customer-invite-form')).toHaveCount(0);
});
