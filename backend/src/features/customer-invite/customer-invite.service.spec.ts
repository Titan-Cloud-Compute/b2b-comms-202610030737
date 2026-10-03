import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CustomerInviteService, activationUrl } from './customer-invite.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

function makeService() {
  const invites: Q[] = [];
  const users: Q[] = [{ id: 'admin1', email: 'admin@demo.local' }];
  const customers: Q[] = [];
  const tx = {
    user: {
      findUnique: jest.fn(({ where }: Q) => Promise.resolve(users.find((u) => u.email === where.email) ?? null)),
      create: jest.fn(({ data }: Q) => {
        const u = { id: `u${users.length + 1}`, ...data };
        users.push(u);
        return Promise.resolve(u);
      }),
    },
    customer: {
      create: jest.fn(({ data }: Q) => {
        customers.push(data);
        return Promise.resolve(data);
      }),
    },
    customerInvitation: {
      create: jest.fn(({ data }: Q) => {
        const row = { id: `i${invites.length + 1}`, status: 'PENDING', acceptedAt: null, createdAt: new Date(), ...data };
        invites.push(row);
        return Promise.resolve(row);
      }),
      findMany: jest.fn(() => Promise.resolve([...invites].reverse())),
      findUnique: jest.fn(({ where }: Q) => Promise.resolve(invites.find((i) => i.token === where.token) ?? null)),
      updateMany: jest.fn(({ where, data }: Q) => {
        const hits = invites.filter(
          (i) => i.token === where.token && i.status === where.status && i.expiresAt > where.expiresAt.gt,
        );
        hits.forEach((i) => Object.assign(i, data));
        return Promise.resolve({ count: hits.length });
      }),
      update: jest.fn(({ where, data }: Q) => {
        const i = invites.find((r) => r.id === where.id);
        Object.assign(i, data);
        return Promise.resolve(i);
      }),
    },
  };
  const prisma = { runAsAdmin: jest.fn((fn: Q) => fn(tx)) };
  const mailer = { sendCustomerInvitation: jest.fn().mockResolvedValue(undefined) };
  return { svc: new CustomerInviteService(prisma as Q, mailer as Q), invites, users, customers, mailer };
}

describe('CustomerInviteService', () => {
  it('invite stores a pending expiring token and emails an activation link', async () => {
    const { svc, invites, mailer } = makeService();
    const v = await svc.invite('admin1', ' Buyer@Example.com ');
    expect(v.email).toBe('buyer@example.com');
    expect(v.status).toBe('PENDING');
    expect(invites).toHaveLength(1);
    expect(invites[0].invitedByUserId).toBe('admin1');
    expect(invites[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(mailer.sendCustomerInvitation).toHaveBeenCalledWith('buyer@example.com', activationUrl(invites[0].token));
    expect(mailer.sendCustomerInvitation.mock.calls[0][1]).toContain('/activate-invite?token=');
    expect(v).not.toHaveProperty('token');
  });

  it('rejects an invalid email and an already-registered email', async () => {
    const { svc } = makeService();
    await expect(svc.invite('admin1', 'nope')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.invite('admin1', 'admin@demo.local')).rejects.toBeInstanceOf(ConflictException);
  });

  it('activate creates the customer account once (single-use)', async () => {
    const { svc, invites, users, customers } = makeService();
    await svc.invite('admin1', 'buyer@example.com');
    const token = invites[0].token;
    await expect(svc.preview(token)).resolves.toEqual({ valid: true, email: 'buyer@example.com' });
    await expect(svc.activate({ token, password: 'password123', name: 'Buyer' })).resolves.toEqual({
      email: 'buyer@example.com',
    });
    const user = users.find((u) => u.email === 'buyer@example.com');
    expect(user.role).toBe('USER');
    expect(customers).toEqual([{ userId: user.id, email: 'buyer@example.com', name: 'Buyer' }]);
    expect(invites[0].status).toBe('ACCEPTED');
    await expect(svc.preview(token)).resolves.toEqual({ valid: false });
    await expect(svc.activate({ token, password: 'password123' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('expired invitations are reported EXPIRED and cannot be redeemed', async () => {
    const { svc, invites } = makeService();
    await svc.invite('admin1', 'late@example.com');
    invites[0].expiresAt = new Date(Date.now() - 1000);
    const [row] = await svc.list();
    expect(row.status).toBe('EXPIRED');
    await expect(svc.activate({ token: invites[0].token, password: 'password123' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
