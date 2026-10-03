import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface NotificationPreferences {
  orderAlerts: boolean;
  messageAlerts: boolean;
}

export interface UpdatePreferencesInput {
  orderAlerts?: unknown;
  messageAlerts?: unknown;
}

export type AlertKind = 'order' | 'message';

export interface AlertFeedItem {
  id: string;
  kind: AlertKind;
  body: string;
  createdAt: Date;
  orderId?: string;
  channelId?: string;
}

interface PrefRow extends NotificationPreferences {
  effectiveFrom: Date;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = { orderAlerts: true, messageAlerts: true };

const FEED_LIMIT = 50;

/** Returns the preference row in force at `at` (rows sorted by effectiveFrom ascending). */
export function preferenceAt(rows: PrefRow[], at: Date): NotificationPreferences {
  let current: NotificationPreferences = DEFAULT_PREFERENCES;
  for (const r of rows) {
    if (new Date(r.effectiveFrom).getTime() <= new Date(at).getTime()) current = r;
    else break;
  }
  return current;
}

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  private async rows(userId: string): Promise<PrefRow[]> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { effectiveFrom: 'asc' },
    });
    return rows.map((r) => ({ orderAlerts: r.orderAlerts, messageAlerts: r.messageAlerts, effectiveFrom: r.effectiveFrom }));
  }

  /** Current preferences (defaults when the user never saved any). */
  async get(userId: string): Promise<NotificationPreferences> {
    const p = preferenceAt(await this.rows(userId), new Date());
    return { orderAlerts: p.orderAlerts, messageAlerts: p.messageAlerts };
  }

  /** Appends a new effective-dated row; governs events from now on. */
  async update(userId: string, input: UpdatePreferencesInput): Promise<NotificationPreferences> {
    const body = (input ?? {}) as UpdatePreferencesInput;
    for (const k of ['orderAlerts', 'messageAlerts'] as const) {
      if (body[k] !== undefined && typeof body[k] !== 'boolean') {
        throw new BadRequestException(`${k} must be a boolean`);
      }
    }
    const current = await this.get(userId);
    const next: NotificationPreferences = {
      orderAlerts: typeof body.orderAlerts === 'boolean' ? body.orderAlerts : current.orderAlerts,
      messageAlerts: typeof body.messageAlerts === 'boolean' ? body.messageAlerts : current.messageAlerts,
    };
    await this.prisma.notificationPreference.create({
      data: { userId, ...next, effectiveFrom: new Date() },
    });
    return next;
  }

  /** Whether an event of `kind` occurring at `at` should alert the user. */
  async allows(userId: string, kind: AlertKind, at: Date = new Date()): Promise<boolean> {
    const p = preferenceAt(await this.rows(userId), at);
    return kind === 'order' ? p.orderAlerts : p.messageAlerts;
  }

  /**
   * Alert feed: order notifications for the user plus messages posted by
   * others in channels the user belongs to, each kept only when the
   * preference in force at the event's time allowed that kind of alert.
   */
  async feed(userId: string): Promise<AlertFeedItem[]> {
    const rows = await this.rows(userId);
    const [orderNotes, memberships] = await Promise.all([
      this.prisma.orderNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: FEED_LIMIT,
      }),
      this.prisma.channelMember.findMany({ where: { userId }, select: { channelId: true } }),
    ]);
    const channelIds = memberships.map((m) => m.channelId);
    const messages = channelIds.length
      ? await this.prisma.message.findMany({
          where: { channelId: { in: channelIds }, authorUserId: { not: userId } },
          orderBy: { createdAt: 'desc' },
          take: FEED_LIMIT,
        })
      : [];

    const items: AlertFeedItem[] = [
      ...orderNotes
        .filter((n) => preferenceAt(rows, n.createdAt).orderAlerts)
        .map((n) => ({ id: n.id, kind: 'order' as const, body: n.body, createdAt: n.createdAt, orderId: n.orderId })),
      ...messages
        .filter((m) => preferenceAt(rows, m.createdAt).messageAlerts)
        .map((m) => ({ id: m.id, kind: 'message' as const, body: m.body, createdAt: m.createdAt, channelId: m.channelId })),
    ];
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items.slice(0, FEED_LIMIT);
  }
}
