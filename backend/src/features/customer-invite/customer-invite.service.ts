import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../../auth/mailer.service';

/** Activation links stay valid for 7 days. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InvitationView = {
  id: string;
  email: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

interface InvitationRow {
  id: string;
  email: string;
  status: 'PENDING' | 'ACCEPTED';
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

export function normalizeEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) throw new BadRequestException('a valid email address is required');
  return email;
}

/** Base URL of the web app used to build the activation link. */
export function appBaseUrl(): string {
  const raw = process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:4200';
  return raw.replace(/\/+$/, '');
}

export function activationUrl(token: string, base: string = appBaseUrl()): string {
  return `${base}/#/activate-invite?token=${encodeURIComponent(token)}`;
}

function view(row: InvitationRow, now: Date = new Date()): InvitationView {
  const expired = row.status === 'PENDING' && row.expiresAt.getTime() <= now.getTime();
  return {
    id: row.id,
    email: row.email,
    status: expired ? 'EXPIRED' : row.status,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class CustomerInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  /** Admin: create a single-use expiring invitation and email the activation link. */
  async invite(adminUserId: string, rawEmail: unknown): Promise<InvitationView> {
    const email = normalizeEmail(rawEmail);
    const existing = await this.prisma.runAsAdmin((tx) => tx.user.findUnique({ where: { email } }));
    if (existing) throw new ConflictException('an account with this email already exists');

    const token = randomBytes(24).toString('hex');
    const row = await this.prisma.runAsAdmin((tx) =>
      tx.customerInvitation.create({
        data: {
          email,
          token,
          invitedByUserId: adminUserId,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      }),
    );
    await this.mailer.sendCustomerInvitation(email, activationUrl(token));
    return view(row as InvitationRow);
  }

  /** Admin: list invitations, newest first. */
  async list(): Promise<InvitationView[]> {
    const rows = await this.prisma.runAsAdmin((tx) =>
      tx.customerInvitation.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    );
    const now = new Date();
    return (rows as InvitationRow[]).map((r) => view(r, now));
  }

  /** Public: is this activation token usable? */
  async preview(token: string): Promise<{ valid: boolean; email?: string }> {
    const row = token
      ? await this.prisma.runAsAdmin((tx) => tx.customerInvitation.findUnique({ where: { token } }))
      : null;
    if (!row || view(row as InvitationRow).status !== 'PENDING') return { valid: false };
    return { valid: true, email: row.email };
  }

  /** Public: redeem the token — creates the customer's account (role USER) and Customer record. */
  async activate(body: { token?: unknown; password?: unknown; name?: unknown }): Promise<{ email: string }> {
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null;
    if (!token) throw new BadRequestException('token is required');
    if (password.length < 8) throw new BadRequestException('password must be at least 8 characters');
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    return this.prisma.runAsAdmin(async (tx) => {
      const claimed = await tx.customerInvitation.updateMany({
        where: { token, status: 'PENDING', expiresAt: { gt: now } },
        data: { status: 'ACCEPTED', acceptedAt: now },
      });
      if (claimed.count !== 1) throw new NotFoundException('invitation is invalid or has expired');
      const invite = await tx.customerInvitation.findUnique({ where: { token } });
      if (!invite) throw new NotFoundException('invitation is invalid or has expired');

      const taken = await tx.user.findUnique({ where: { email: invite.email } });
      if (taken) throw new ConflictException('an account with this email already exists');
      const user = await tx.user.create({
        data: { email: invite.email, passwordHash, name, role: 'USER' },
      });
      await tx.customer.create({ data: { userId: user.id, email: invite.email, name } });
      await tx.customerInvitation.update({ where: { id: invite.id }, data: { acceptedUserId: user.id } });
      return { email: invite.email };
    });
  }
}
