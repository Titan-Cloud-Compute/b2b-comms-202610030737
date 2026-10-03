import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderManagementService } from './order-management.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

const USERS: Record<string, { id: string; role: string; email: string; name: string | null }> = {
  vendor: { id: 'vendor', role: 'MANAGER', email: 'manager@demo.local', name: 'Vendor' },
  cust: { id: 'cust', role: 'USER', email: 'user@demo.local', name: 'Customer' },
};

function makeService() {
  const products: Q[] = [];
  const orders: Q[] = [];
  const notifications: Q[] = [];
  const messages: Q[] = [];
  const withItems = (o: Q) => o;
  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: Q) => Promise.resolve(USERS[where.id] ?? null)),
      findMany: jest.fn(({ where }: Q) => Promise.resolve(Object.values(USERS).filter((u) => where.role.in.includes(u.role)))),
    },
    product: {
      findMany: jest.fn(({ where }: Q) =>
        Promise.resolve(
          products.filter(
            (p) =>
              p.vendorUserId === where.vendorUserId &&
              (where.active === undefined || p.active === where.active) &&
              (!where.id || where.id.in.includes(p.id)),
          ),
        ),
      ),
      findUnique: jest.fn(({ where }: Q) => Promise.resolve(products.find((p) => p.id === where.id) ?? null)),
      create: jest.fn(({ data }: Q) => {
        const p = { id: `p${products.length + 1}`, active: true, ...data };
        products.push(p);
        return Promise.resolve(p);
      }),
      update: jest.fn(({ where, data }: Q) => {
        const p = products.find((x) => x.id === where.id);
        Object.assign(p, data);
        return Promise.resolve(p);
      }),
    },
    order: {
      create: jest.fn(({ data }: Q) => {
        const o = { id: `o${orders.length + 1}`, ...data, items: data.items.create, createdAt: new Date() };
        orders.push(o);
        return Promise.resolve(withItems(o));
      }),
      findMany: jest.fn(({ where }: Q) =>
        Promise.resolve(
          orders.filter(
            (o) =>
              (!where.vendorUserId || o.vendorUserId === where.vendorUserId) &&
              (!where.customerUserId || o.customerUserId === where.customerUserId),
          ),
        ),
      ),
      findUnique: jest.fn(({ where }: Q) => Promise.resolve(orders.find((o) => o.id === where.id) ?? null)),
      update: jest.fn(({ where, data }: Q) => {
        const o = orders.find((x) => x.id === where.id);
        Object.assign(o, data);
        return Promise.resolve(o);
      }),
    },
    orderNotification: {
      create: jest.fn(({ data }: Q) => {
        const n = { id: `n${notifications.length + 1}`, createdAt: new Date(), ...data };
        notifications.push(n);
        return Promise.resolve(n);
      }),
      findMany: jest.fn(({ where }: Q) => Promise.resolve(notifications.filter((n) => n.userId === where.userId))),
    },
    channel: { findFirst: jest.fn().mockResolvedValue({ id: 'ch1' }) },
    message: {
      create: jest.fn(({ data }: Q) => {
        messages.push(data);
        return Promise.resolve(data);
      }),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new OrderManagementService(prisma as any);
  return { svc, prisma, orders, notifications, messages };
}

describe('order management service', () => {
  it('vendor manages a catalog the customer can browse', async () => {
    const { svc } = makeService();
    await svc.createProduct('vendor', { name: ' Widget ', unitPrice: '4.5' });
    const hidden = await svc.createProduct('vendor', { name: 'Gadget', unitPrice: 2 });
    await svc.updateProduct('vendor', hidden.id, { active: false });
    const catalog = await svc.catalog('vendor');
    expect(catalog.map((p: Q) => p.name)).toEqual(['Widget']);
    expect((await svc.listVendors()).map((u) => u.id)).toEqual(['vendor']);
    await expect(svc.createProduct('cust', { name: 'X' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('customer order lands in the vendor queue as PENDING, then confirm sets ETA and notifies', async () => {
    const { svc, notifications, messages } = makeService();
    const widget = await svc.createProduct('vendor', { name: 'Widget', unitPrice: 4.5 });
    const order = await svc.createOrder('cust', {
      vendorUserId: 'vendor',
      items: [{ productId: widget.id, quantity: 3 }],
    });
    expect(order.status).toBe('PENDING');
    const queue = await svc.vendorQueue('vendor');
    expect(queue.map((o: Q) => [o.id, o.status])).toEqual([[order.id, 'PENDING']]);

    const confirmed = await svc.confirmOrder('vendor', order.id, '2026-12-01');
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.estimatedDeliveryDate).toEqual(new Date('2026-12-01'));
    expect((await svc.myOrders('cust'))[0].status).toBe('CONFIRMED');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].userId).toBe('cust');
    expect((await svc.myNotifications('cust'))[0].body).toContain('2026-12-01');
    expect(messages).toHaveLength(1);
  });

  it('rejects invalid orders and confirmations', async () => {
    const { svc } = makeService();
    const widget = await svc.createProduct('vendor', { name: 'Widget', unitPrice: 1 });
    await expect(svc.createOrder('cust', { vendorUserId: 'vendor', items: [] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.createOrder('cust', { vendorUserId: 'vendor', items: [{ productId: 'nope', quantity: 1 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.createOrder('vendor', { vendorUserId: 'vendor', items: [{ productId: widget.id, quantity: 1 }] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const order = await svc.createOrder('cust', { vendorUserId: 'vendor', items: [{ productId: widget.id, quantity: 1 }] });
    await expect(svc.confirmOrder('vendor', order.id, '')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.confirmOrder('cust', order.id, '2026-12-01')).rejects.toBeInstanceOf(ForbiddenException);
    await svc.confirmOrder('vendor', order.id, '2026-12-01');
    await expect(svc.confirmOrder('vendor', order.id, '2026-12-02')).rejects.toBeInstanceOf(BadRequestException);
  });
});
