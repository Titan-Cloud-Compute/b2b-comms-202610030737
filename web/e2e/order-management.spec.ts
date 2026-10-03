/**
 * Hermetic spec for Story: order-management.
 * All /api/** calls are intercepted with an in-memory order backend shared by
 * a customer (USER) and a vendor (MANAGER) browser context.
 */
import { test, expect, type Page } from '@playwright/test';

type Role = 'USER' | 'MANAGER';

interface Store {
  products: { id: string; vendorUserId: string; name: string; description: string | null; unitPrice: string; active: boolean }[];
  orders: {
    id: string; customerUserId: string; vendorUserId: string; status: 'PENDING' | 'CONFIRMED'; notes: string | null;
    estimatedDeliveryDate: string | null; createdAt: string;
    items: { productId: string; quantity: number; unitPrice: string; product: { id: string; name: string } }[];
  }[];
  notifications: { id: string; orderId: string; userId: string; body: string; createdAt: string }[];
}

async function mockOrdersApi(page: Page, role: Role, store: Store): Promise<void> {
  const user = role === 'MANAGER'
    ? { id: 'vendor1', email: 'manager@example.com', role }
    : { id: 'cust1', email: 'user@example.com', role };

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const url = new URL(req.url());
    const apiPath = url.pathname.replace(/^.*\/api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') return json(user);
    if (method === 'GET' && apiPath === 'users/me') return json(user);
    if (method === 'GET' && apiPath === 'orders/vendors') {
      return json([{ id: 'vendor1', email: 'manager@example.com', name: 'Acme Supplies' }]);
    }
    if (method === 'GET' && apiPath === 'orders/catalog') {
      const vendorId = url.searchParams.get('vendorId');
      return json(store.products.filter(p => p.vendorUserId === vendorId && p.active));
    }
    if (apiPath === 'orders/products') {
      if (method === 'GET') return json(store.products.filter(p => p.vendorUserId === user.id));
      const body = req.postDataJSON() as { name: string; unitPrice: number };
      const p = { id: `p${store.products.length + 1}`, vendorUserId: user.id, name: body.name, description: null,
        unitPrice: Number(body.unitPrice).toFixed(2), active: true };
      store.products.push(p);
      return json(p, 201);
    }
    if (method === 'POST' && apiPath === 'orders') {
      const body = req.postDataJSON() as { vendorUserId: string; items: { productId: string; quantity: number }[]; notes: string };
      const order = {
        id: `o${store.orders.length + 1}`, customerUserId: user.id, vendorUserId: body.vendorUserId,
        status: 'PENDING' as const, notes: body.notes || null, estimatedDeliveryDate: null, createdAt: new Date().toISOString(),
        items: body.items.map(it => {
          const p = store.products.find(x => x.id === it.productId)!;
          return { productId: p.id, quantity: it.quantity, unitPrice: p.unitPrice, product: { id: p.id, name: p.name } };
        }),
      };
      store.orders.push(order);
      return json(order, 201);
    }
    if (method === 'GET' && apiPath === 'orders/vendor') return json(store.orders.filter(o => o.vendorUserId === user.id));
    if (method === 'GET' && apiPath === 'orders/mine') return json(store.orders.filter(o => o.customerUserId === user.id));
    if (method === 'GET' && apiPath === 'orders/notifications') return json(store.notifications.filter(n => n.userId === user.id));
    const confirm = apiPath.match(/^orders\/([^/]+)\/confirm$/);
    if (confirm && method === 'PATCH') {
      const order = store.orders.find(o => o.id === confirm[1]);
      if (!order || order.vendorUserId !== user.id) return json({ message: 'Forbidden' }, 403);
      const { estimatedDeliveryDate } = req.postDataJSON() as { estimatedDeliveryDate: string };
      order.status = 'CONFIRMED';
      order.estimatedDeliveryDate = new Date(estimatedDeliveryDate).toISOString();
      store.notifications.push({
        id: `n${store.notifications.length + 1}`, orderId: order.id, userId: order.customerUserId,
        body: `Your order ${order.id} was confirmed. Estimated delivery: ${estimatedDeliveryDate}.`,
        createdAt: new Date().toISOString(),
      });
      return json(order);
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

test('customer orders from a vendor catalog; vendor confirms with ETA; customer is notified', async ({ browser }) => {
  const store: Store = { products: [], orders: [], notifications: [] };

  // Vendor adds a product to their catalog via the products manager.
  const vendorPage = await (await browser.newContext()).newPage();
  await mockOrdersApi(vendorPage, 'MANAGER', store);
  await login(vendorPage, 'manager@example.com');
  await vendorPage.goto('/#/orders');
  await expect(vendorPage.getByTestId('orders-page')).toBeVisible();
  await expect(vendorPage.getByTestId('order-queue')).toBeVisible();
  await expect(vendorPage.getByTestId('catalog')).toHaveCount(0);
  await vendorPage.getByTestId('product-name-input').fill('Widget');
  await vendorPage.getByTestId('product-price-input').fill('4.50');
  await vendorPage.getByTestId('add-product').click();
  await expect(vendorPage.getByTestId('managed-product')).toContainText('Widget');

  // Customer browses the catalog and submits a purchase order.
  const customerPage = await (await browser.newContext()).newPage();
  await mockOrdersApi(customerPage, 'USER', store);
  await login(customerPage, 'user@example.com');
  await customerPage.goto('/#/orders');
  await expect(customerPage.getByTestId('catalog')).toBeVisible();
  await expect(customerPage.getByTestId('order-queue')).toHaveCount(0);
  await expect(customerPage.getByTestId('catalog-product')).toHaveCount(1);
  await customerPage.getByTestId('quantity-input').fill('3');
  await customerPage.getByTestId('submit-order').click();
  await expect(customerPage.getByTestId('my-order')).toContainText('Pending');
  expect(store.orders).toHaveLength(1);
  expect(store.orders[0].items[0].quantity).toBe(3);

  // Vendor sees the pending order in the queue and confirms it with an ETA.
  await vendorPage.reload();
  const queued = vendorPage.getByTestId('queue-order');
  await expect(queued).toHaveCount(1);
  await expect(queued.getByTestId('order-status')).toHaveText('Pending');
  await queued.getByTestId('eta-input').fill('2026-12-01');
  await queued.getByTestId('confirm-order').click();
  await expect(queued.getByTestId('order-status')).toHaveText('Confirmed');
  expect(store.orders[0].status).toBe('CONFIRMED');

  // Customer sees the confirmed order and the notification.
  await customerPage.reload();
  await expect(customerPage.getByTestId('my-order')).toContainText('Confirmed');
  await expect(customerPage.getByTestId('order-notification')).toContainText('2026-12-01');
});
