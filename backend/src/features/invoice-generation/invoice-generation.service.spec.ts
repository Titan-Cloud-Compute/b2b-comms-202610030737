import { ConflictException, ForbiddenException } from '@nestjs/common';
import { InvoiceGenerationService, buildPdf } from './invoice-generation.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

const USERS: Record<string, { id: string; role: string }> = {
  vendor: { id: 'vendor', role: 'MANAGER' },
  other: { id: 'other', role: 'MANAGER' },
  cust: { id: 'cust', role: 'USER' },
  stranger: { id: 'stranger', role: 'USER' },
};

function makeService() {
  const orders: Q[] = [
    {
      id: 'order-confirmed-1', vendorUserId: 'vendor', customerUserId: 'cust', status: 'CONFIRMED',
      items: [
        { productId: 'p1', quantity: 3, unitPrice: '4.50', product: { name: 'Widget' } },
        { productId: 'p2', quantity: 1, unitPrice: '10.00', product: { name: 'Gadget' } },
      ],
    },
    { id: 'order-pending-2', vendorUserId: 'vendor', customerUserId: 'cust', status: 'PENDING', items: [] },
  ];
  const invoices: Q[] = [];
  const prisma = {
    user: { findUnique: jest.fn(({ where }: Q) => Promise.resolve(USERS[where.id] ?? null)) },
    order: { findUnique: jest.fn(({ where }: Q) => Promise.resolve(orders.find((o) => o.id === where.id) ?? null)) },
    invoice: {
      findUnique: jest.fn(({ where }: Q) =>
        Promise.resolve(invoices.find((i) => (where.id ? i.id === where.id : i.orderId === where.orderId)) ?? null),
      ),
      create: jest.fn(({ data }: Q) => {
        const inv = { id: `inv${invoices.length + 1}`, createdAt: new Date(), ...data };
        invoices.push(inv);
        return Promise.resolve(inv);
      }),
      findMany: jest.fn(({ where }: Q) =>
        Promise.resolve(
          invoices.filter(
            (i) =>
              where.OR.some((c: Q) => (c.vendorUserId ?? c.customerUserId) === (c.vendorUserId ? i.vendorUserId : i.customerUserId)) &&
              (!where.orderId || i.orderId === where.orderId),
          ),
        ),
      ),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { svc: new InvoiceGenerationService(prisma as Q, audit as Q), invoices, audit, prisma };
}

describe('InvoiceGenerationService', () => {
  it('vendor generates an invoice for a confirmed order with the computed total', async () => {
    const { svc, invoices, audit } = makeService();
    const inv = await svc.generate('vendor', { orderId: 'order-confirmed-1' });
    expect(inv.invoiceNumber).toMatch(/^INV-/);
    expect(inv.totalAmount).toBe('23.50');
    expect(inv.customerUserId).toBe('cust');
    expect(invoices).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'invoice.generated' }));
  });

  it('rejects pending orders, repeats, non-vendors and other vendors', async () => {
    const { svc } = makeService();
    await expect(svc.generate('vendor', { orderId: 'order-pending-2' })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.generate('cust', { orderId: 'order-confirmed-1' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.generate('other', { orderId: 'order-confirmed-1' })).rejects.toBeInstanceOf(ForbiddenException);
    await svc.generate('vendor', { orderId: 'order-confirmed-1' });
    await expect(svc.generate('vendor', { orderId: 'order-confirmed-1' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets the customer and vendor download a PDF but nobody else', async () => {
    const { svc } = makeService();
    const inv = await svc.generate('vendor', { orderId: 'order-confirmed-1' });
    const pdf = await svc.download('cust', inv.id);
    expect(pdf.filename).toBe(`${inv.invoiceNumber}.pdf`);
    expect(pdf.content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.content.toString('latin1')).toContain('Total: 23.50');
    await expect(svc.download('vendor', inv.id)).resolves.toBeDefined();
    await expect(svc.download('stranger', inv.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('builds a well-formed PDF', () => {
    const pdf = buildPdf(['Hello (world)']).toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('(Hello \\(world\\))');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });
});
