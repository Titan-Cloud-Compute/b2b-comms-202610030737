/**
 * Schema guard for Story: notification-preferences — effective-dated
 * NotificationPreference rows ship with migration 0465 and the auth tables
 * stay untouched.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const PRISMA_DIR = join(__dirname, '..', '..', '..', 'prisma');
const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
const migrationDir = readdirSync(join(PRISMA_DIR, 'migrations')).find((d) => d === '0465_notification_preferences');
const sql = migrationDir ? readFileSync(join(PRISMA_DIR, 'migrations', migrationDir, 'migration.sql'), 'utf8') : '';

function modelBody(name: string): string {
  const m = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  return m ? m[1] : '';
}

describe('notification-preferences schema', () => {
  it('declares the effective-dated NotificationPreference model', () => {
    const p = modelBody('NotificationPreference');
    expect(p).not.toBe('');
    expect(p).toMatch(/userId\s+String/);
    expect(p).toMatch(/orderAlerts\s+Boolean\s+@default\(true\)/);
    expect(p).toMatch(/messageAlerts\s+Boolean\s+@default\(true\)/);
    expect(p).toMatch(/effectiveFrom\s+DateTime/);
    expect(p).toMatch(/@@index\(\[userId, effectiveFrom\]\)/);
  });

  it('does not add relations to User', () => {
    expect(modelBody('User')).not.toMatch(/NotificationPreference/);
  });

  it('ships migration 0465_notification_preferences without altering auth tables', () => {
    expect(migrationDir).toBeDefined();
    expect(sql).toContain('CREATE TABLE "NotificationPreference"');
    expect(sql).toContain('"effectiveFrom"');
    expect(sql).not.toMatch(/ALTER TABLE "(User|Session|RegistrationToken|PasswordResetToken)"/);
  });
});
