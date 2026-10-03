import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { firstValueFrom, take, toArray } from 'rxjs';
import { SharedChannelService } from './shared-channel.service';

const USERS: Record<string, { id: string; role: string; email: string; name: string | null }> = {
  vendor: { id: 'vendor', role: 'MANAGER', email: 'manager@demo.local', name: 'Vendor' },
  cust: { id: 'cust', role: 'USER', email: 'user@demo.local', name: 'Customer' },
  other: { id: 'other', role: 'USER', email: 'other@demo.local', name: null },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

function makeService() {
  const channels: { id: string; name: string; createdByUserId: string }[] = [];
  const members: { channelId: string; userId: string; role: string }[] = [];
  const messages: { id: string; channelId: string; authorUserId: string; body: string; createdAt: Date }[] = [];
  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: Q) => Promise.resolve(USERS[where.id] ?? null)),
      findMany: jest.fn(({ where }: Q) =>
        Promise.resolve(
          Object.values(USERS).filter(
            (u: { id: string; role: string }) => u.role === where.role && (!where.id || where.id.in.includes(u.id)),
          ),
        ),
      ),
    },
    customer: { upsert: jest.fn().mockResolvedValue({}) },
    channel: {
      findUnique: jest.fn(({ where }: Q) => Promise.resolve(channels.find((c) => c.id === where.id) ?? null)),
      findMany: jest.fn(({ where }: Q) =>
        Promise.resolve(
          channels.filter((c) =>
            members.some((m) => m.channelId === c.id && m.userId === where.members.some.userId),
          ),
        ),
      ),
      create: jest.fn(({ data }: Q) => {
        const ch = { id: `c${channels.length + 1}`, name: data.name, createdByUserId: data.createdByUserId };
        channels.push(ch);
        for (const m of data.members.create) members.push({ channelId: ch.id, ...m });
        return Promise.resolve({ ...ch, members: members.filter((m) => m.channelId === ch.id) });
      }),
    },
    channelMember: {
      findUnique: jest.fn(({ where }: Q) =>
        Promise.resolve(
          members.find(
            (m) => m.channelId === where.channelId_userId.channelId && m.userId === where.channelId_userId.userId,
          ) ?? null,
        ),
      ),
      upsert: jest.fn(({ create }: Q) => {
        members.push(create);
        return Promise.resolve(create);
      }),
      findMany: jest.fn(({ where }: Q) => Promise.resolve(members.filter((m) => m.channelId === where.channelId))),
    },
    message: {
      findMany: jest.fn(({ where }: Q) => Promise.resolve(messages.filter((m) => m.channelId === where.channelId))),
      create: jest.fn(({ data }: Q) => {
        const msg = { id: `m${messages.length + 1}`, createdAt: new Date(), ...data };
        messages.push(msg);
        return Promise.resolve(msg);
      }),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new SharedChannelService(prisma as any);
  return { svc, prisma };
}

describe('shared channel service', () => {
  it('lets a vendor create a channel with a customer, listed for both members only', async () => {
    const { svc } = makeService();
    const ch = await svc.createChannel('vendor', { name: ' Acme support ', customerIds: ['cust'] });
    expect(ch.name).toBe('Acme support');
    expect((await svc.listChannels('vendor')).map((c) => c.id)).toEqual([ch.id]);
    expect((await svc.listChannels('cust')).map((c) => c.id)).toEqual([ch.id]);
    expect(await svc.listChannels('other')).toEqual([]);
  });

  it('refuses channel creation by customers and without customers', async () => {
    const { svc } = makeService();
    await expect(svc.createChannel('cust', { name: 'x', customerIds: ['other'] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(svc.createChannel('vendor', { name: 'x', customerIds: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.createChannel('vendor', { name: '', customerIds: ['cust'] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('only members can read or post messages', async () => {
    const { svc } = makeService();
    const ch = await svc.createChannel('vendor', { name: 'a', customerIds: ['cust'] });
    await expect(svc.postMessage(ch.id, 'other', 'hi')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.listMessages(ch.id, 'other')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.listMessages('missing', 'vendor')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pushes a customer message live to stream subscribers of that channel', async () => {
    const { svc } = makeService();
    const ch = await svc.createChannel('vendor', { name: 'a', customerIds: ['cust'] });
    const received = firstValueFrom(svc.stream(ch.id).pipe(take(1), toArray()));
    const msg = await svc.postMessage(ch.id, 'cust', ' hello vendor ');
    expect(msg).toMatchObject({ channelId: ch.id, authorUserId: 'cust', body: 'hello vendor' });
    const events = await received;
    expect(events[0]).toMatchObject({ type: 'message', data: { id: msg.id, body: 'hello vendor' } });
    expect(await svc.listMessages(ch.id, 'vendor')).toHaveLength(1);
  });

  it('lets the vendor add another customer member', async () => {
    const { svc } = makeService();
    const ch = await svc.createChannel('vendor', { name: 'a', customerIds: ['cust'] });
    const list = await svc.addMembers(ch.id, 'vendor', ['other']);
    expect(list.map((m) => m.userId)).toContain('other');
    await expect(svc.addMembers(ch.id, 'cust', ['other'])).rejects.toBeInstanceOf(ForbiddenException);
  });
});
