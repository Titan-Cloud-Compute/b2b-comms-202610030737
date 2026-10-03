/**
 * Schema guard for Story: order-management — Product, Order, OrderItem and
 * OrderNotification exist with migration 0370, and auth tables are untouched.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const PRISMA_DIR = join(__dirname, '..', '..', '..', 'prisma');
const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
const migrationDir = readdirSync(join(PRISMA_DIR, 'migrations')).find((d) => d === '0370_order_management');
const sql = migrationDir ? readFileSync(join(PRISMA_DIR, 'migrations', migrationDir, 'migration.sql'), 'utf8') : '';

function modelBody(name: string): string {
  const m = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  return m ? m[1] : '';
}

describe('order-management schema', () => {
  it.each(['Product', 'Order', 'OrderItem', 'OrderNotification'])('declares model %s', (name) => {
    expect(modelBody(name)).not.toBe('');
  });

  it('declares the PENDING/CONFIRMED order status enum', () => {
    expect(schema).toMatch(/enum OrderStatus \{\s*PENDING\s*CONFIRMED\s*\}/);
  });

  it('orders carry customer, vendor, status, ETA and line items', () => {
    const order = modelBody('Order');
    expect(order).toMatch(/customerUserId\s+String/);
    expect(order).toMatch(/vendorUserId\s+String/);
    expect(order).toMatch(/status\s+OrderStatus\s+@default\(PENDING\)/);
    expect(order).toMatch(/estimatedDeliveryDate\s+DateTime\?/);
    expect(order).toMatch(/items\s+OrderItem\[\]/);
    expect(modelBody('OrderItem')).toMatch(/productId\s+String/);
    expect(modelBody('OrderItem')).toMatch(/quantity\s+Int/);
    expect(modelBody('Product')).toMatch(/vendorUserId\s+String/);
    expect(modelBody('OrderNotification')).toMatch(/userId\s+String/);
  });

  it('does not add relations to the User auth model', () => {
    expect(modelBody('User')).not.toMatch(/Order|Product/);
  });

  it('ships migration 0370_order_management creating the four tables without altering auth tables', () => {
    expect(migrationDir).toBeDefined();
    expect(sql).toContain('CREATE TYPE "OrderStatus"');
    for (const t of ['Product', 'Order', 'OrderItem', 'OrderNotification']) {
      expect(sql).toContain(`CREATE TABLE "${t}"`);
    }
    expect(sql).not.toMatch(/ALTER TABLE "(User|Session|RegistrationToken|PasswordResetToken)"/);
  });
});
