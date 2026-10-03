import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../shared/api/api-client.service';

export interface ChannelMemberRef {
  userId: string;
  role: 'VENDOR' | 'CUSTOMER';
}

export interface Channel {
  id: string;
  name: string;
  createdByUserId: string;
  createdAt: string;
  members?: ChannelMemberRef[];
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
}

export interface CustomerOption {
  id: string;
  email: string;
  name: string | null;
}

@Injectable({ providedIn: 'root' })
export class ChannelApi {
  private api = inject(ApiClient);

  async listChannels(): Promise<Channel[]> {
    const rows = await this.api.get<Channel[] | null>('channels');
    return Array.isArray(rows) ? rows : [];
  }

  async listCustomers(): Promise<CustomerOption[]> {
    const rows = await this.api.get<CustomerOption[] | null>('channels/customers');
    return Array.isArray(rows) ? rows : [];
  }

  createChannel(name: string, customerIds: string[]): Promise<Channel> {
    return this.api.post<Channel>('channels', { name, customerIds });
  }

  addMembers(channelId: string, customerIds: string[]): Promise<ChannelMemberRef[]> {
    return this.api.post<ChannelMemberRef[]>(`channels/${encodeURIComponent(channelId)}/members`, { customerIds });
  }

  async listMessages(channelId: string): Promise<ChannelMessage[]> {
    const rows = await this.api.get<ChannelMessage[] | null>(`channels/${encodeURIComponent(channelId)}/messages`);
    return Array.isArray(rows) ? rows : [];
  }

  sendMessage(channelId: string, body: string): Promise<ChannelMessage> {
    return this.api.post<ChannelMessage>(`channels/${encodeURIComponent(channelId)}/messages`, { body });
  }

  /** Live message feed (server-sent events). Caller must close() the returned source. */
  openStream(channelId: string): EventSource | null {
    if (typeof EventSource === 'undefined') return null;
    return new EventSource(this.api.url(`channels/${encodeURIComponent(channelId)}/stream`), {
      withCredentials: true,
    });
  }
}
