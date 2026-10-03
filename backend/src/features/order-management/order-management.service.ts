import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Vendors are MANAGER (or ADMIN) accounts; customers are USER accounts (same split as shared-channel). */
export const VENDOR_ROLES = ['MANAGER', 'ADMIN'];
export const CUSTOMER_ROLE = 'USER';

export interface ProductInput {
  name?: unknown;
  description?: unknown;
  unitPrice?: unknown;
  active?: unknown;
}

export interface CreateOrderInput {
  vendorUserId?: unknown;
  notes?: unknown;
  items?: unknown;
}

const ORDER_INCLUDE = {
  items: { include: { product: { select: { id: true, name: true } } } },
} as const;

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function price(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) throw new BadRequestException('unitPrice must be a non-negative number');
  return Math.round(n * 100) / 100;
}

@Injectable()
export class OrderManagementService {
  constructor(private readonly prisma: PrismaService) {}

  private async roleOf(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return user?.role ?? null;
  }

  private async assertVendor(userId: string): Promise<void> {
    const role = await this.roleOf(userId);
    if (!role || !VENDOR_ROLES.includes(role)) throw new ForbiddenException('Only vendors can do this');
  }

  private async assertCustomer(userId: string): Promise<void> {
    const role = await this.roleOf(userId);
    if (role !== CUSTOMER_ROLE) throw new ForbiddenException('Only customers can do this');
  }

  /** Vendors a customer can order from. */
  listVendors() {
    return this.prisma.user.findMany({
      where: { role: { in: VENDOR_ROLES as ('MANAGER' | 'ADMIN')[] } },
      select: { id: true, email: true, name: true },
      orderBy: { email: 'asc' },
    });
  }

  /** A vendor's active product catalog. */
  catalog(vendorUserId: string) {
    const vendor = clean(vendorUserId);
    if (!vendor) throw new BadRequestException('vendorId is required');
    return this.prisma.product.findMany({
      where: { vendorUserId: vendor, active: true },
      orderBy: { name: 'asc' },
    });
  }

  async listMyProducts(userId: string) {
    await this.assertVendor(userId);
    return this.prisma.product.findMany({ where: { vendorUserId: userId }, orderBy: { name: 'asc' } });
  }

  async createProduct(userId: string, input: ProductInput) {
    await this.assertVendor(userId);
    const name = clean(input?.name);
    if (!name) throw new BadRequestException('name is required');
    const description = clean(input?.description) || null;
    return this.prisma.product.create({
      data: { vendorUserId: userId, name, description, unitPrice: price(input?.unitPrice ?? 0) },
    });
  }

  async updateProduct(userId: string, productId: string, input: ProductInput) {
    await this.assertVendor(userId);
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.vendorUserId !== userId) throw new ForbiddenException('Not your product');
    const data: { name?: string; description?: string | null; unitPrice?: number; active?: boolean } = {};
    if (input?.name !== undefined) {
      const name = clean(input.name);
      if (!name) throw new BadRequestException('name is required');
      data.name = name;
    }
    if (input?.description !== undefined) data.description = clean(input.description) || null;
    if (input?.unitPrice !== undefined) data.unitPrice = price(input.unitPrice);
    if (typeof input?.active === 'boolean') data.active = input.active;
    return this.prisma.product.update({ where: { id: productId }, data });
  }

  /** Customer submits a purchase order: it lands in the vendor's queue as PENDING. */
  async createOrder(userId: string, input: CreateOrderInput) {
    await this.assertCustomer(userId);
    const vendorUserId = clean(input?.vendorUserId);
    if (!vendorUserId) throw new BadRequestException('vendorUserId is required');
    const raw = Array.isArray(input?.items) ? (input.items as { productId?: unknown; quantity?: unknown }[]) : [];
    const lines = new Map<string, number>();
    for (const it of raw) {
      const productId = clean(it?.productId);
      const quantity = Number(it?.quantity);
      if (!productId || !Number.isInteger(quantity) || quantity <= 0) continue;
      lines.set(productId, (lines.get(productId) ?? 0) + quantity);
    }
    if (lines.size === 0) throw new BadRequestException('Select at least one item');
    const products = await this.prisma.product.findMany({
      where: { id: { in: [...lines.keys()] }, vendorUserId, active: true },
    });
    if (products.length !== lines.size) throw new BadRequestException('Every item must be in the vendor catalog');
    return this.prisma.order.create({
      data: {
        customerUserId: userId,
        vendorUserId,
        status: 'PENDING',
        notes: clean(input?.notes) || null,
        items: {
          create: products.map((p) => ({ productId: p.id, quantity: lines.get(p.id)!, unitPrice: p.unitPrice })),
        },
      },
      include: ORDER_INCLUDE,
    });
  }

  async vendorQueue(userId: string) {
    await this.assertVendor(userId);
    return this.prisma.order.findMany({
      where: { vendorUserId: userId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  myOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { customerUserId: userId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  myNotifications(userId: string) {
    return this.prisma.orderNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Vendor confirms a pending order with an ETA; the customer is notified. */
  async confirmOrder(userId: string, orderId: string, estimatedDeliveryDate: unknown) {
    await this.assertVendor(userId);
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.vendorUserId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== 'PENDING') throw new BadRequestException('Only pending orders can be confirmed');
    const etaRaw = clean(estimatedDeliveryDate);
    const eta = etaRaw ? new Date(etaRaw) : null;
    if (!eta || Number.isNaN(eta.getTime())) throw new BadRequestException('estimatedDeliveryDate is required');
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CONFIRMED', estimatedDeliveryDate: eta, confirmedAt: new Date() },
      include: ORDER_INCLUDE,
    });
    const body = `Your order ${orderId} was confirmed. Estimated delivery: ${eta.toISOString().slice(0, 10)}.`;
    await this.prisma.orderNotification.create({ data: { orderId, userId: order.customerUserId, body } });
    // Best effort: also drop the update into a shared channel both parties belong to.
    try {
      const channel = await this.prisma.channel.findFirst({
        where: {
          AND: [
            { members: { some: { userId } } },
            { members: { some: { userId: order.customerUserId } } },
          ],
        },
        select: { id: true },
      });
      if (channel) await this.prisma.message.create({ data: { channelId: channel.id, authorUserId: userId, body } });
    } catch {
      /* channel notification is optional */
    }
    return updated;
  }
}
