import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

function setup(user: Record<string, unknown> | null) {
  const writes: Record<string, unknown>[] = [];
  const audit = { write: jest.fn(async (p: Record<string, unknown>) => { writes.push(p); }) };
  const tx = {
    user: {
      findUnique: async () => user,
      update: async () => user,
    },
    passwordResetToken: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUnique: async () => ({ userId: user?.['id'] }),
    },
  };
  const prisma = { runAsAdmin: (fn: (t: typeof tx) => unknown) => fn(tx) };
  const jwt = {
    signAsync: async () => 'tok',
    verifyAsync: async () => ({ userId: user?.['id'], role: user?.['role'] }),
  };
  const service = new AuthService(prisma as never, jwt as never, {} as never, {} as never, audit as never);
  return { service, writes, tx };
}

describe('AuthService records authentication events into AuditLog', () => {
  let user: Record<string, unknown>;
  beforeAll(async () => {
    user = { id: 'u1', email: 'user@demo.local', role: 'USER', passwordHash: await bcrypt.hash('right-pass', 4) };
  });

  it('login success', async () => {
    const { service, writes } = setup(user);
    await service.login({ email: 'user@demo.local', password: 'right-pass' });
    expect(writes).toEqual([
      expect.objectContaining({ action: 'auth.login', actor: 'USER', actorUserId: 'u1', payload: expect.objectContaining({ outcome: 'success' }) }),
    ]);
  });

  it('login failure', async () => {
    const { service, writes } = setup(user);
    await expect(service.login({ email: 'user@demo.local', password: 'wrong' })).rejects.toBeDefined();
    expect(writes[0]).toMatchObject({ action: 'auth.login', payload: { outcome: 'failure' } });
  });

  it('logout', async () => {
    const { service, writes } = setup(user);
    await service.recordLogout('tok');
    expect(writes[0]).toMatchObject({ action: 'auth.logout', actorUserId: 'u1', payload: { outcome: 'success' } });
  });

  it('password change', async () => {
    const { service, writes } = setup(user);
    await service.changePassword('u1', { currentPassword: 'right-pass', newPassword: 'new-password-1' });
    expect(writes[0]).toMatchObject({ action: 'auth.password_change', actorUserId: 'u1', payload: { outcome: 'success' } });
  });

  it('password reset', async () => {
    const { service, writes } = setup(user);
    await expect(service.confirmPasswordReset('t0k', 'new-password-1')).resolves.toBe(true);
    expect(writes[0]).toMatchObject({ action: 'auth.password_reset', actorUserId: 'u1', payload: { outcome: 'success' } });
  });

  it('password reset with a stale token', async () => {
    const { service, writes, tx } = setup(user);
    tx.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.confirmPasswordReset('stale', 'new-password-1')).resolves.toBe(false);
    expect(writes[0]).toMatchObject({ action: 'auth.password_reset', payload: { outcome: 'failure' } });
  });
});
