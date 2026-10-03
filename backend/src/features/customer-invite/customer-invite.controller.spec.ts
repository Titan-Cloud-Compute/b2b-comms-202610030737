import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { CustomerInviteController } from './customer-invite.controller';
import { CustomerInviteModule } from './customer-invite.module';
import { FEATURE_MODULES } from '../index';
import { ROLES_KEY, RolesGuard } from '../../auth/roles.guard';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function handler(name: string): Any {
  return (CustomerInviteController.prototype as Any)[name];
}

describe('CustomerInviteController HTTP contract', () => {
  it('is mounted at api/customer-invites behind RolesGuard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CustomerInviteController)).toBe('api/customer-invites');
    expect(Reflect.getMetadata(GUARDS_METADATA, CustomerInviteController)).toContain(RolesGuard);
  });

  it.each([
    ['create', RequestMethod.POST, '/'],
    ['list', RequestMethod.GET, '/'],
    ['preview', RequestMethod.GET, 'token/:token'],
    ['activate', RequestMethod.POST, 'activate'],
  ])('%s → %s %s', (name, method, path) => {
    expect(Reflect.getMetadata(METHOD_METADATA, handler(name as string))).toBe(method);
    expect(Reflect.getMetadata(PATH_METADATA, handler(name as string))).toBe(path);
  });

  it('invite endpoints are admin-only; activation endpoints are public', () => {
    expect(Reflect.getMetadata(ROLES_KEY, handler('create'))).toEqual(['ADMIN']);
    expect(Reflect.getMetadata(ROLES_KEY, handler('list'))).toEqual(['ADMIN']);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler('preview'))).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler('activate'))).toBe(true);
  });

  it('delegates to the service with the session admin', async () => {
    const svc = { invite: jest.fn().mockResolvedValue({}), list: jest.fn(), preview: jest.fn(), activate: jest.fn() };
    const ctrl = new CustomerInviteController(svc as Any);
    await ctrl.create({ session: { userId: 'a1' } } as Any, { email: 'x@y.co' });
    expect(svc.invite).toHaveBeenCalledWith('a1', 'x@y.co');
    expect(() => ctrl.create({ session: {} } as Any, { email: 'x@y.co' })).toThrow();
  });

  it('is registered in FEATURE_MODULES', () => {
    expect(FEATURE_MODULES).toContain(CustomerInviteModule);
  });
});
