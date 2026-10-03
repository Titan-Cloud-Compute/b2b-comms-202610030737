import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../shared/api/api-client.service';

export interface Invoice {
  id: string;
  orderId: string;
  vendorUserId: string;
  customerUserId: string;
  invoiceNumber: string;
  totalAmount: string | number;
  issuedAt: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class InvoicesApi {
  private api = inject(ApiClient);

  async list(): Promise<Invoice[]> {
    const rows = await this.api.get<Invoice[] | null>('invoices');
    return Array.isArray(rows) ? rows : [];
  }

  generate(orderId: string): Promise<Invoice> {
    return this.api.post<Invoice>('invoices', { orderId });
  }

  download(id: string): Promise<Blob> {
    return this.api.getBlob(`invoices/${encodeURIComponent(id)}/download`);
  }
}
