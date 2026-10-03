/**
 * Schema guard for Story: customer-invite — CustomerInvitation exists with
 * migration 0903, and auth / Customer tables are untouched.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const PRISMA_DIR = join(__dirname, '..', '..', '..', 'prisma');
const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
const migrationDir = readdirSync(join(PRISMA_DIR, 'migrations')).find((d) => d === '0903_customer_invite');
const sql = migrationDir ? readFileSync(join(PRISMA_DIR, 'migrations', migrationDir, 'migration.sql'), 'utf8') : '';

function modelBody(name: string): string {
  const m = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  return m ? m[1] : '';
}

describe('customer-invite schema', () => {
  it('declares the CustomerInvitation model with a single-use expiring token', () => {
    const inv = modelBody('CustomerInvitation');
    expect(inv).not.toBe('');
    expect(inv).toMatch(/email\s+String/);
    expect(inv).toMatch(/token\s+String\s+@unique/);
    expect(inv).toMatch(/status\s+CustomerInvitationStatus\s+@default\(PENDING\)/);
    expect(inv).toMatch(/invitedByUserId\s+String/);
    expect(inv).toMatch(/expiresAt\s+DateTime/);
    expect(inv).toMatch(/acceptedAt\s+DateTime\?/);
  });

  it('does not add relations to User or Customer', () => {
    expect(modelBody('User')).not.toMatch(/CustomerInvitation/);
    expect(modelBody('Customer')).not.toMatch(/Invitation/);
  });

  it('ships migration 0903_customer_invite without altering auth or Customer tables', () => {
    expect(migrationDir).toBeDefined();
    expect(sql).toContain('CREATE TABLE "CustomerInvitation"');
    expect(sql).toContain('"CustomerInvitation_token_key"');
    expect(sql).not.toMatch(/ALTER TABLE "(User|Session|RegistrationToken|PasswordResetToken|Customer)"/);
  });
});
