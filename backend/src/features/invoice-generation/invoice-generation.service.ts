import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

/** Vendors are MANAGER (or ADMIN) accounts — same split as order-management. */
export const VENDOR_ROLES = ['MANAGER', 'ADMIN'];

export interface GenerateInvoiceInput {
  orderId?: unknown;
}

export interface InvoicePdf {
  filename: string;
  content: Buffer;
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function pdfText(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1');
}

/** Builds a minimal single-page PDF (Helvetica text lines) without external deps. */
export function buildPdf(lines: string[]): Buffer {
  const stream = [
    'BT',
    '/F1 12 Tf',
    '14 TL',
    '72 760 Td',
    ...lines.map((l) => `(${pdfText(l)}) '`),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

@Injectable()
export class InvoiceGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertVendor(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || !VENDOR_ROLES.includes(user.role)) throw new ForbiddenException('Only vendors can generate invoices');
  }

  /** Vendor issues an invoice for one of their CONFIRMED orders. Idempotent: a repeat call returns 409. */
  async generate(userId: string, input: GenerateInvoiceInput) {
    const orderId = clean(input?.orderId);
    if (!orderId) throw new BadRequestException('orderId is required');
    await this.assertVendor(userId);
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.vendorUserId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== 'CONFIRMED') throw new ConflictException('Only confirmed orders can be invoiced');
    const existing = await this.prisma.invoice.findUnique({ where: { orderId } });
    if (existing) throw new ConflictException('An invoice already exists for this order');

    const cents = order.items.reduce(
      (sum, it) => sum + Math.round(Number(it.unitPrice) * 100) * it.quantity,
      0,
    );
    const issuedAt = new Date();
    const stamp = issuedAt.toISOString().slice(0, 10).replace(/-/g, '');
    const invoiceNumber = `INV-${stamp}-${order.id.slice(-8).toUpperCase()}`;
    const invoice = await this.prisma.invoice.create({
      data: {
        orderId,
        vendorUserId: order.vendorUserId,
        customerUserId: order.customerUserId,
        invoiceNumber,
        totalAmount: (cents / 100).toFixed(2),
        issuedAt,
      },
    });
    await this.audit.record({
      actor: 'USER',
      actorUserId: userId,
      action: 'invoice.generated',
      payload: { invoiceId: invoice.id, orderId, invoiceNumber },
    });
    return invoice;
  }

  /** Invoices visible to the caller as vendor or customer, optionally filtered by order. */
  list(userId: string, orderId?: unknown) {
    const order = clean(orderId);
    return this.prisma.invoice.findMany({
      where: {
        OR: [{ vendorUserId: userId }, { customerUserId: userId }],
        ...(order ? { orderId: order } : {}),
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  /** Renders the invoice as a PDF for the order's customer or vendor. */
  async download(userId: string, id: string): Promise<InvoicePdf> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.customerUserId !== userId && invoice.vendorUserId !== userId) {
      throw new ForbiddenException('Not your invoice');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: invoice.orderId },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    const lines = [
      `Invoice ${invoice.invoiceNumber}`,
      `Issued: ${invoice.issuedAt.toISOString().slice(0, 10)}`,
      `Order: ${invoice.orderId}`,
      '',
      ...(order?.items ?? []).map(
        (it) => `${it.quantity} x ${it.product?.name ?? it.productId} @ ${Number(it.unitPrice).toFixed(2)}`,
      ),
      '',
      `Total: ${Number(invoice.totalAmount).toFixed(2)}`,
    ];
    await this.audit.record({
      actor: 'USER',
      actorUserId: userId,
      action: 'invoice.downloaded',
      payload: { invoiceId: invoice.id },
    });
    return { filename: `${invoice.invoiceNumber}.pdf`, content: buildPdf(lines) };
  }
}
