import { BadRequestException } from '@nestjs/common';
import { NotificationPreferencesService, preferenceAt } from './notification-preferences.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

function makeService() {
  const prefs: Q[] = [];
  const orderNotes: Q[] = [];
  const members: Q[] = [{ channelId: 'c1', userId: 'u1' }];
  const messages: Q[] = [];
  const prisma = {
    notificationPreference: {
      findMany: jest.fn(({ where }: Q) =>
        Promise.resolve(
          prefs
            .filter((p) => p.userId === where.userId)
            .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime()),
        ),
      ),
      create: jest.fn(({ data }: Q) => {
        const row = { id: `p${prefs.length + 1}`, createdAt: new Date(), ...data };
        prefs.push(row);
        return Promise.resolve(row);
      }),
    },
    orderNotification: {
      findMany: jest.fn(({ where }: Q) => Promise.resolve(orderNotes.filter((n) => n.userId === where.userId))),
    },
    channelMember: {
      findMany: jest.fn(({ where }: Q) => Promise.resolve(members.filter((m) => m.userId === where.userId))),
    },
    message: {
      findMany: jest.fn(({ where }: Q) =>
        Promise.resolve(
          messages.filter((m) => where.channelId.in.includes(m.channelId) && m.authorUserId !== where.authorUserId.not),
        ),
      ),
    },
  };
  return { svc: new NotificationPreferencesService(prisma as Q), prefs, orderNotes, messages };
}

describe('NotificationPreferencesService', () => {
  it('returns defaults (both alerts on) when nothing is saved', async () => {
    const { svc } = makeService();
    await expect(svc.get('u1')).resolves.toEqual({ orderAlerts: true, messageAlerts: true });
  });

  it('update appends an effective-dated row and get returns it', async () => {
    const { svc, prefs } = makeService();
    await expect(svc.update('u1', { messageAlerts: false })).resolves.toEqual({ orderAlerts: true, messageAlerts: false });
    expect(prefs).toHaveLength(1);
    expect(prefs[0].effectiveFrom).toBeInstanceOf(Date);
    await expect(svc.get('u1')).resolves.toEqual({ orderAlerts: true, messageAlerts: false });
    await expect(svc.get('u2')).resolves.toEqual({ orderAlerts: true, messageAlerts: true });
  });

  it('rejects non-boolean values', async () => {
    const { svc, prefs } = makeService();
    await expect(svc.update('u1', { orderAlerts: 'no' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prefs).toHaveLength(0);
  });

  it('preferenceAt picks the row in force at the event time', () => {
    const rows = [
      { orderAlerts: true, messageAlerts: false, effectiveFrom: new Date('2026-01-01') },
      { orderAlerts: false, messageAlerts: true, effectiveFrom: new Date('2026-02-01') },
    ];
    expect(preferenceAt(rows, new Date('2025-12-01'))).toEqual({ orderAlerts: true, messageAlerts: true });
    expect(preferenceAt(rows, new Date('2026-01-15')).messageAlerts).toBe(false);
    expect(preferenceAt(rows, new Date('2026-03-01')).orderAlerts).toBe(false);
  });

  it('feed shows new order alerts but leaves out messages after message alerts are turned off', async () => {
    const { svc, prefs, orderNotes, messages } = makeService();
    const before = new Date(Date.now() - 60_000);
    messages.push({ id: 'm-old', channelId: 'c1', authorUserId: 'vendor', body: 'Earlier hello', createdAt: before });
    prefs.push({ userId: 'u1', orderAlerts: true, messageAlerts: false, effectiveFrom: new Date(Date.now() - 1_000) });
    const after = new Date();
    orderNotes.push({ id: 'n1', orderId: 'o1', userId: 'u1', body: 'Order o1 confirmed', createdAt: after });
    messages.push({ id: 'm-new', channelId: 'c1', authorUserId: 'vendor', body: 'New message', createdAt: after });
    messages.push({ id: 'm-own', channelId: 'c1', authorUserId: 'u1', body: 'Mine', createdAt: before });

    const feed = await svc.feed('u1');
    const ids = feed.map((f) => f.id);
    expect(ids).toContain('n1');
    expect(ids).toContain('m-old');
    expect(ids).not.toContain('m-new');
    expect(ids).not.toContain('m-own');
    expect(feed.find((f) => f.id === 'n1')?.kind).toBe('order');
    await expect(svc.allows('u1', 'message')).resolves.toBe(false);
    await expect(svc.allows('u1', 'order')).resolves.toBe(true);
  });
});
