/**
 * Hermetic spec for Story: shared-channel.
 * All /api/** calls are intercepted with an in-memory channel backend; the SSE
 * stream endpoint pushes a message from the other member.
 */
import { test, expect, type Page } from '@playwright/test';

type Role = 'USER' | 'MANAGER';

interface Store {
  channels: { id: string; name: string; createdByUserId: string; createdAt: string; members: { userId: string; role: string }[] }[];
  messages: { id: string; channelId: string; authorUserId: string; body: string; createdAt: string }[];
}

async function mockChannelApi(page: Page, role: Role, store: Store, pushed?: { body: string; authorUserId: string }): Promise<void> {
  const user = role === 'MANAGER'
    ? { id: 'vendor1', email: 'manager@example.com', role }
    : { id: 'cust1', email: 'user@example.com', role };

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname.replace(/^.*\/api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const mine = () => store.channels.filter(c => c.members.some(m => m.userId === user.id));

    if (method === 'POST' && apiPath === 'auth/login') return json(user);
    if (method === 'GET' && apiPath === 'users/me') return json(user);
    if (method === 'GET' && apiPath === 'channels') return json(mine());
    if (method === 'GET' && apiPath === 'channels/customers') {
      return json([{ id: 'cust1', email: 'user@example.com', name: 'Casey Customer' }]);
    }
    if (method === 'POST' && apiPath === 'channels') {
      const body = req.postDataJSON() as { name: string; customerIds: string[] };
      const ch = {
        id: `ch${store.channels.length + 1}`, name: body.name, createdByUserId: user.id,
        createdAt: new Date().toISOString(),
        members: [{ userId: user.id, role: 'VENDOR' }, ...body.customerIds.map(id => ({ userId: id, role: 'CUSTOMER' }))],
      };
      store.channels.push(ch);
      return json(ch, 201);
    }
    const msgMatch = apiPath.match(/^channels\/([^/]+)\/(messages|stream)$/);
    if (msgMatch) {
      const channelId = msgMatch[1];
      if (!mine().some(c => c.id === channelId)) return json({ message: 'Forbidden' }, 403);
      if (msgMatch[2] === 'stream') {
        const frames = pushed
          ? `data: ${JSON.stringify({ id: 'live1', channelId, createdAt: new Date().toISOString(), ...pushed })}\n\n`
          : ': keep-alive\n\n';
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: frames });
      }
      if (method === 'GET') return json(store.messages.filter(m => m.channelId === channelId));
      const { body } = req.postDataJSON() as { body: string };
      const msg = { id: `m${store.messages.length + 1}`, channelId, authorUserId: user.id, body, createdAt: new Date().toISOString() };
      store.messages.push(msg);
      return json(msg, 201);
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/#/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => !url.hash.includes('/login'), { timeout: 10_000 });
}

test.use({ serviceWorkers: 'block' });

test('vendor creates a shared channel with a customer; it is listed for both and messages stream live', async ({ browser }) => {
  const store: Store = { channels: [], messages: [] };

  // Vendor (MANAGER) creates the channel and adds the customer.
  const vendorPage = await (await browser.newContext()).newPage();
  await mockChannelApi(vendorPage, 'MANAGER', store, { body: 'Hello from the customer', authorUserId: 'cust1' });
  await login(vendorPage, 'manager@example.com');
  await vendorPage.goto('/#/channels');
  await expect(vendorPage.getByTestId('channel-list')).toBeVisible();
  await expect(vendorPage.getByTestId('channel-item')).toHaveCount(0);
  await vendorPage.getByTestId('channel-name-input').fill('Acme support');
  await vendorPage.locator('[data-testid="customer-option"][data-customer-id="cust1"]').check();
  await vendorPage.getByTestId('create-channel').click();
  await expect(vendorPage.getByTestId('channel-item')).toHaveCount(1);
  await expect(vendorPage.getByTestId('channel-item').first()).toContainText('Acme support');
  await expect(vendorPage.getByTestId('message-input')).toBeVisible();
  // The customer's message arrives over the SSE stream without a reload.
  await expect(vendorPage.getByTestId('message-list')).toContainText('Hello from the customer', { timeout: 10_000 });

  // Customer (USER) sees the same channel and posts a message.
  const customerPage = await (await browser.newContext()).newPage();
  await mockChannelApi(customerPage, 'USER', store);
  await login(customerPage, 'user@example.com');
  await customerPage.goto('/#/channels');
  await expect(customerPage.getByTestId('channel-item')).toHaveCount(1);
  await expect(customerPage.getByTestId('create-channel-form')).toHaveCount(0);
  await customerPage.getByTestId('message-input').fill('Order status please');
  await customerPage.getByTestId('send-message').click();
  await expect(customerPage.getByTestId('message-list')).toContainText('Order status please');
  expect(store.messages.map(m => m.body)).toContain('Order status please');
});
