import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

/** Vendors are MANAGER (or ADMIN) accounts; customers are USER accounts. */
export const VENDOR_ROLES = ['MANAGER', 'ADMIN'];
export const CUSTOMER_ROLE = 'USER';

export interface CreateChannelInput {
  name?: string;
  customerIds?: string[];
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  authorUserId: string;
  body: string;
  createdAt: Date | string;
}

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function idList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()))];
}

@Injectable()
export class SharedChannelService {
  /** In-process fan-out of newly posted messages to SSE subscribers. */
  private readonly events = new Subject<ChannelMessage>();

  constructor(private readonly prisma: PrismaService) {}

  private async roleOf(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return user?.role ?? null;
  }

  async assertMember(channelId: string, userId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { id: true } });
    if (!channel) throw new NotFoundException('Channel not found');
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!member) throw new ForbiddenException('You are not a member of this channel');
  }

  /** Customer accounts a vendor can add to a channel. */
  async listCustomers(userId: string) {
    const role = await this.roleOf(userId);
    if (!role || !VENDOR_ROLES.includes(role)) throw new ForbiddenException('Only vendors can list customers');
    return this.prisma.user.findMany({
      where: { role: CUSTOMER_ROLE },
      select: { id: true, email: true, name: true },
      orderBy: { email: 'asc' },
    });
  }

  /** Only channels the caller belongs to. */
  listChannels(userId: string) {
    return this.prisma.channel.findMany({
      where: { members: { some: { userId } } },
      include: { members: { select: { userId: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async customerUsers(ids: string[]) {
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, role: CUSTOMER_ROLE },
      select: { id: true, email: true, name: true },
    });
    if (users.length !== ids.length) throw new BadRequestException('Every member must be an existing customer');
    for (const u of users) {
      await this.prisma.customer.upsert({
        where: { userId: u.id },
        create: { userId: u.id, email: u.email, name: u.name ?? null },
        update: { email: u.email, name: u.name ?? null },
      });
    }
    return users;
  }

  async createChannel(userId: string, input: CreateChannelInput) {
    const role = await this.roleOf(userId);
    if (!role || !VENDOR_ROLES.includes(role)) throw new ForbiddenException('Only vendors can create channels');
    const name = clean(input?.name);
    if (!name) throw new BadRequestException('name is required');
    const customerIds = idList(input?.customerIds).filter((id) => id !== userId);
    if (customerIds.length === 0) throw new BadRequestException('Add at least one customer');
    const customers = await this.customerUsers(customerIds);
    return this.prisma.channel.create({
      data: {
        name,
        createdByUserId: userId,
        members: {
          create: [
            { userId, role: 'VENDOR' as const },
            ...customers.map((c) => ({ userId: c.id, role: 'CUSTOMER' as const })),
          ],
        },
      },
      include: { members: { select: { userId: true, role: true } } },
    });
  }

  async addMembers(channelId: string, userId: string, customerIds: unknown) {
    await this.assertMember(channelId, userId);
    const role = await this.roleOf(userId);
    if (!role || !VENDOR_ROLES.includes(role)) throw new ForbiddenException('Only vendors can add members');
    const ids = idList(customerIds);
    if (ids.length === 0) throw new BadRequestException('customerIds is required');
    const customers = await this.customerUsers(ids);
    for (const c of customers) {
      await this.prisma.channelMember.upsert({
        where: { channelId_userId: { channelId, userId: c.id } },
        create: { channelId, userId: c.id, role: 'CUSTOMER' },
        update: {},
      });
    }
    return this.prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true, role: true },
    });
  }

  async listMessages(channelId: string, userId: string) {
    await this.assertMember(channelId, userId);
    return this.prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
  }

  async postMessage(channelId: string, userId: string, bodyText: unknown) {
    await this.assertMember(channelId, userId);
    const body = clean(bodyText);
    if (!body) throw new BadRequestException('body is required');
    if (body.length > 4000) throw new BadRequestException('body is too long');
    const message = await this.prisma.message.create({
      data: { channelId, authorUserId: userId, body },
    });
    this.events.next(message);
    return message;
  }

  /** Live feed of messages posted to one channel (caller must already be verified as member). */
  stream(channelId: string): Observable<{ type: string; data: ChannelMessage }> {
    return this.events.pipe(
      filter((m) => m.channelId === channelId),
      map((m) => ({ type: 'message', data: m })),
    );
  }
}
