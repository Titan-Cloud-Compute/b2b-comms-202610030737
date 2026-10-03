import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../shared/api/api-client.service';

export interface NotificationPreferences {
  orderAlerts: boolean;
  messageAlerts: boolean;
}

export interface AlertFeedItem {
  id: string;
  kind: 'order' | 'message';
  body: string;
  createdAt: string;
  orderId?: string;
  channelId?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationPreferencesApi {
  private api = inject(ApiClient);

  async get(): Promise<NotificationPreferences> {
    const p = await this.api.get<Partial<NotificationPreferences> | null>('notifications/preferences');
    return { orderAlerts: p?.orderAlerts !== false, messageAlerts: p?.messageAlerts !== false };
  }

  save(prefs: NotificationPreferences): Promise<NotificationPreferences> {
    return this.api.put<NotificationPreferences>('notifications/preferences', prefs);
  }

  async feed(): Promise<AlertFeedItem[]> {
    const rows = await this.api.get<AlertFeedItem[] | null>('notifications/feed');
    return Array.isArray(rows) ? rows : [];
  }
}
