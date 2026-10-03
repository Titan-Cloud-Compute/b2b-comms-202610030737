import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AdminAuditController, deriveOutcome } from './admin-audit.controller';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

function makeController(rows: Record<string, unknown>[]) {
  const calls: Record<string, unknown>[] = [];
  const tx = {
    auditLog: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push(args);
        return rows;
      },
      count: async () => rows.length,
    },
  };
  const prisma = { runAsAdmin: (fn: (t: typeof tx) => unknown) => fn(tx) };
  return { controller: new AdminAuditController(prisma as never), calls };
}

describe('GET /api/admin/audit-log', () => {
  it('is routed at api/admin/audit-log as a GET', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminAuditController)).toBe('api/admin');
    const h = AdminAuditController.prototype.auditLog;
    expect(Reflect.getMetadata(PATH_METADATA, h)).toBe('audit-log');
    expect(Reflect.getMetadata(METHOD_METADATA, h)).toBe(RequestMethod.GET);
  });

  it('is admin-only: guarded by JwtAuthGuard and carries admin role metadata', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminAuditController) ?? [];
    expect(guards).toContain(JwtAuthGuard);
    const keys = Reflect.getMetadataKeys(AdminAuditController).map(String);
    const roleMeta = keys
      .map((k) => Reflect.getMetadata(k, AdminAuditController))
      .filter((v) => v !== undefined);
    expect(JSON.stringify(roleMeta)).toContain('ADMIN');
    expect(RolesGuard).toBeDefined();
  });

  it('returns rows newest first, enriched with actor email and outcome', async () => {
    const { controller, calls } = makeController([
      {
        id: 'a2', actor: 'USER', actorUserId: 'u1', action: 'auth.login',
        payloadJson: { outcome: 'failure' }, createdAt: new Date('2026-10-02'),
        actorUser: { email: 'user@demo.local' },
      },
      {
        id: 'a1', actor: 'SYSTEM', actorUserId: null, action: 'system.boot',
        payloadJson: {}, createdAt: new Date('2026-10-01'), actorUser: null,
      },
    ]);
    const res = await controller.auditLog();
    expect(calls[0]).toMatchObject({ orderBy: { createdAt: 'desc' } });
    expect(res.total).toBe(2);
    expect(res.rows[0]).toMatchObject({ id: 'a2', actorEmail: 'user@demo.local', outcome: 'failure' });
    expect(res.rows[1]).toMatchObject({ id: 'a1', actorEmail: null, outcome: 'success' });
    expect(res.rows[0]).not.toHaveProperty('actorUser');
  });

  it('derives outcome from payload', () => {
    expect(deriveOutcome({ outcome: 'success' })).toBe('success');
    expect(deriveOutcome({ error: 'boom' })).toBe('failure');
    expect(deriveOutcome(null)).toBe('success');
  });
});
