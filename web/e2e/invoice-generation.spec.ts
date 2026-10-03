/**
 * Hermetic spec for Story: invoice-generation.
 * All /api/** calls are intercepted with an in-memory backend shared by a
 * vendor (MANAGER) and a customer (USER) browser context.
 */
import { test, expect, type Page } from '@playwright/test';

type Role = 'USER' | 'MANAGER';

interface Store {
  orders: {
    id: string; customerUserId: string; vendorUserId: string; status: 'PENDING' | 'CONFIRMED'; notes: string | null;
    estimatedDeliveryDate: string | null; createdAt: string;
    items: { productId: string; quantity: number; unitPrice: string; product: { id: string; name: string } }[];
  }[];
  invoices: {
    id: string; orderId: string; vendorUserId: string; customerUserId: string; invoiceNumber: string;
    totalAmount: string; issuedAt: string; createdAt: string;
  }[];
}

async function mockApi(page: Page, role: Role, store: Store): Promise<void> {
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
    if (method === 'GET' && apiPath === 'orders/vendor') return json(store.orders.filter(o => o.vendorUserId === user.id));
    if (method === 'GET' && apiPath === 'orders/mine') return json(store.orders.filter(o => o.customerUserId === user.id));
    if (apiPath === 'invoices') {
      if (method === 'GET') {
        return json(store.invoices.filter(i => i.vendorUserId === user.id || i.customerUserId === user.id));
      }
      const { orderId } = req.postDataJSON() as { orderId: string };
      const order = store.orders.find(o => o.id === orderId);
      if (!order || order.vendorUserId !== user.id) return json({ message: 'Forbidden' }, 403);
      if (order.status !== 'CONFIRMED') return json({ message: 'Only confirmed orders can be invoiced' }, 409);
      if (store.invoices.some(i => i.orderId === orderId)) return json({ message: 'Already invoiced' }, 409);
      const total = order.items.reduce((s, it) => s + Number(it.unitPrice) * it.quantity, 0);
      const inv = {
        id: `inv${store.invoices.length + 1}`, orderId, vendorUserId: order.vendorUserId,
        customerUserId: order.customerUserId, invoiceNumber: `INV-20261003-${orderId.toUpperCase()}`,
        totalAmount: total.toFixed(2), issuedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      };
      store.invoices.push(inv);
      return json(inv, 201);
    }
    const dl = apiPath.match(/^invoices\/([^/]+)\/download$/);
    if (dl && method === 'GET') {
      const inv = store.invoices.find(i => i.id === dl[1]);
      if (!inv || (inv.customerUserId !== user.id && inv.vendorUserId !== user.id)) return json({ message: 'Forbidden' }, 403);
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'Content-Disposition': `attachment; filename="${inv.invoiceNumber}.pdf"` },
        body: `%PDF-1.4\n% ${inv.invoiceNumber}\n%%EOF\n`,
      });
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

test('vendor generates an invoice for a confirmed order; customer sees and downloads it', async ({ browser }) => {
  const store: Store = {
    orders: [
      {
        id: 'o1', customerUserId: 'cust1', vendorUserId: 'vendor1', status: 'CONFIRMED', notes: null,
        estimatedDeliveryDate: '2026-12-01T00:00:00.000Z', createdAt: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 3, unitPrice: '4.50', product: { id: 'p1', name: 'Widget' } }],
      },
      {
        id: 'o2', customerUserId: 'cust1', vendorUserId: 'vendor1', status: 'PENDING', notes: null,
        estimatedDeliveryDate: null, createdAt: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 1, unitPrice: '4.50', product: { id: 'p1', name: 'Widget' } }],
      },
    ],
    invoices: [],
  };

  // Customer starts with no invoices.
  const customerPage = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await mockApi(customerPage, 'USER', store);
  await login(customerPage, 'user@example.com');
  await customerPage.goto('/#/invoices');
  await expect(customerPage.getByTestId('invoices-page')).toBeVisible();
  await expect(customerPage.getByTestId('invoices-empty')).toBeVisible();
  await expect(customerPage.getByTestId('generate-invoice')).toHaveCount(0);

  // Vendor sees only the confirmed order as invoiceable and generates the invoice.
  const vendorPage = await (await browser.newContext()).newPage();
  await mockApi(vendorPage, 'MANAGER', store);
  await login(vendorPage, 'manager@example.com');
  await vendorPage.goto('/#/invoices');
  await expect(vendorPage.getByTestId('invoices-page')).toBeVisible();
  await expect(vendorPage.getByTestId('invoiceable-order')).toHaveCount(1);
  await vendorPage.getByTestId('generate-invoice').click();
  await expect(vendorPage.getByTestId('invoice-row')).toContainText('INV-');
  await expect(vendorPage.getByTestId('invoiceable-order')).toHaveCount(0);
  expect(store.invoices).toHaveLength(1);
  expect(store.invoices[0].totalAmount).toBe('13.50');

  // Customer sees the invoice and downloads it as a PDF.
  await customerPage.reload();
  await expect(customerPage.getByTestId('invoice-row')).toContainText('INV-');
  await expect(customerPage.getByTestId('invoices-empty')).toHaveCount(0);
  const [download] = await Promise.all([
    customerPage.waitForEvent('download'),
    customerPage.getByTestId('download-invoice').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^INV-.*\.pdf$/);
});
