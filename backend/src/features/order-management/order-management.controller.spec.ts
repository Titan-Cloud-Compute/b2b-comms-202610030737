import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { OrderManagementController } from './order-management.controller';
import { OrderManagementModule } from './order-management.module';
import { FEATURE_MODULES } from '../index';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function route(name: string): { method: number; path: string } {
  const handler = (OrderManagementController.prototype as Any)[name];
  return { method: Reflect.getMetadata(METHOD_METADATA, handler), path: Reflect.getMetadata(PATH_METADATA, handler) };
}

describe('OrderManagementController HTTP contract', () => {
  it('is mounted at api/orders', () => {
    expect(Reflect.getMetadata(PATH_METADATA, OrderManagementController)).toBe('api/orders');
  });

  it.each([
    ['create', RequestMethod.POST, '/'],
    ['vendorQueue', RequestMethod.GET, 'vendor'],
    ['mine', RequestMethod.GET, 'mine'],
    ['confirm', RequestMethod.PATCH, ':id/confirm'],
    ['catalog', RequestMethod.GET, 'catalog'],
    ['vendors', RequestMethod.GET, 'vendors'],
    ['products', RequestMethod.GET, 'products'],
    ['createProduct', RequestMethod.POST, 'products'],
    ['notifications', RequestMethod.GET, 'notifications'],
  ])('%s → %s %s', (name, method, path) => {
    const r = route(name as string);
    expect(r.method).toBe(method);
    expect(r.path).toBe(path);
  });

  it('delegates to the service with the session user', async () => {
    const svc = {
      createOrder: jest.fn().mockResolvedValue({ id: 'o1', status: 'PENDING' }),
      confirmOrder: jest.fn().mockResolvedValue({ id: 'o1', status: 'CONFIRMED' }),
    };
    const ctrl = new OrderManagementController(svc as Any);
    const req = { session: { userId: 'u1' } } as Any;
    await ctrl.create(req, { vendorUserId: 'v1', items: [] });
    expect(svc.createOrder).toHaveBeenCalledWith('u1', { vendorUserId: 'v1', items: [] });
    await ctrl.confirm(req, 'o1', '2026-12-01');
    expect(svc.confirmOrder).toHaveBeenCalledWith('u1', 'o1', '2026-12-01');
    expect(() => ctrl.mine({ session: {} } as Any)).toThrow();
  });

  it('is registered in FEATURE_MODULES', () => {
    expect(FEATURE_MODULES).toContain(OrderManagementModule);
  });
});
