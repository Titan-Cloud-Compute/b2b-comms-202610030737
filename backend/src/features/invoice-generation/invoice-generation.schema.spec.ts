/**
 * Schema guard for Story: invoice-generation — Invoice exists with migration
 * 0610, references Order by a plain FK, and auth/Order tables are untouched.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const PRISMA_DIR = join(__dirname, '..', '..', '..', 'prisma');
const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
const migrationDir = readdirSync(join(PRISMA_DIR, 'migrations')).find((d) => d === '0610_invoice_generation');
const sql = migrationDir ? readFileSync(join(PRISMA_DIR, 'migrations', migrationDir, 'migration.sql'), 'utf8') : '';

function modelBody(name: string): string {
  const m = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  return m ? m[1] : '';
}

describe('invoice-generation schema', () => {
  it('declares the Invoice model with its fields', () => {
    const inv = modelBody('Invoice');
    expect(inv).not.toBe('');
    expect(inv).toMatch(/orderId\s+String\s+@unique/);
    expect(inv).toMatch(/vendorUserId\s+String/);
    expect(inv).toMatch(/customerUserId\s+String/);
    expect(inv).toMatch(/invoiceNumber\s+String/);
    expect(inv).toMatch(/totalAmount\s+Decimal\s+@db\.Decimal\(12, 2\)/);
    expect(inv).toMatch(/issuedAt\s+DateTime/);
    expect(inv).toMatch(/createdAt\s+DateTime/);
  });

  it('does not add relations to User or Order', () => {
    expect(modelBody('User')).not.toMatch(/Invoice/);
    expect(modelBody('Order')).not.toMatch(/Invoice/);
  });

  it('ships migration 0610_invoice_generation creating Invoice without altering auth or Order tables', () => {
    expect(migrationDir).toBeDefined();
    expect(sql).toContain('CREATE TABLE "Invoice"');
    expect(sql).toContain('"Invoice_orderId_key"');
    expect(sql).not.toMatch(/ALTER TABLE "(User|Session|RegistrationToken|PasswordResetToken|Order)"/);
  });
});
