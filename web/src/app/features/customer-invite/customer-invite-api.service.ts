import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../shared/api/api-client.service';

export type CustomerInvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED';

export interface CustomerInvitation {
  id: string;
  email: string;
  status: CustomerInvitationStatus;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string | null;
}

export interface InvitePreview {
  valid: boolean;
  email?: string;
}

@Injectable({ providedIn: 'root' })
export class CustomerInviteApi {
  private api = inject(ApiClient);

  async list(): Promise<CustomerInvitation[]> {
    const rows = await this.api.get<CustomerInvitation[] | null>('customer-invites');
    return Array.isArray(rows) ? rows : [];
  }

  send(email: string): Promise<CustomerInvitation> {
    return this.api.post<CustomerInvitation>('customer-invites', { email });
  }

  preview(token: string): Promise<InvitePreview> {
    return this.api.get<InvitePreview>(`customer-invites/token/${encodeURIComponent(token)}`);
  }

  activate(token: string, password: string, name?: string): Promise<{ email: string }> {
    return this.api.post<{ email: string }>('customer-invites/activate', { token, password, name });
  }
}
