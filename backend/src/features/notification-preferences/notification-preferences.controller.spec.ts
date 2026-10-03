import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesModule } from './notification-preferences.module';
import { FEATURE_MODULES } from '../index';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function route(name: string): { method: number; path: string } {
  const handler = (NotificationPreferencesController.prototype as Any)[name];
  return { method: Reflect.getMetadata(METHOD_METADATA, handler), path: Reflect.getMetadata(PATH_METADATA, handler) };
}

describe('NotificationPreferencesController HTTP contract', () => {
  it('is mounted at api/notifications', () => {
    expect(Reflect.getMetadata(PATH_METADATA, NotificationPreferencesController)).toBe('api/notifications');
  });

  it.each([
    ['getPreferences', RequestMethod.GET, 'preferences'],
    ['updatePreferences', RequestMethod.PUT, 'preferences'],
    ['feed', RequestMethod.GET, 'feed'],
  ])('%s → %s %s', (name, method, path) => {
    const r = route(name as string);
    expect(r.method).toBe(method);
    expect(r.path).toBe(path);
  });

  it('delegates to the service with the session user', async () => {
    const svc = {
      get: jest.fn().mockResolvedValue({ orderAlerts: true, messageAlerts: true }),
      update: jest.fn().mockResolvedValue({ orderAlerts: true, messageAlerts: false }),
      feed: jest.fn().mockResolvedValue([]),
    };
    const ctrl = new NotificationPreferencesController(svc as Any);
    const req = { session: { userId: 'u1' } } as Any;
    await ctrl.getPreferences(req);
    await ctrl.updatePreferences(req, { messageAlerts: false });
    await ctrl.feed(req);
    expect(svc.get).toHaveBeenCalledWith('u1');
    expect(svc.update).toHaveBeenCalledWith('u1', { messageAlerts: false });
    expect(svc.feed).toHaveBeenCalledWith('u1');
    expect(() => ctrl.feed({ session: {} } as Any)).toThrow();
  });

  it('is registered in FEATURE_MODULES', () => {
    expect(FEATURE_MODULES).toContain(NotificationPreferencesModule);
  });
});
