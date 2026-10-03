import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../shared/api/api-client.service';

export type VendorDocumentStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export interface VendorProfile {
  id: string;
  companyName: string;
  website: string | null;
  address: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
}

export type VendorProfileInput = Omit<VendorProfile, 'id'>;

export interface VendorDocument {
  id: string;
  fileName: string;
  docType: string;
  status: VendorDocumentStatus;
  uploadedAt: string;
}

/** Human labels for the review status — the raw enum is never rendered. */
export const VENDOR_DOC_STATUS_LABELS: Record<VendorDocumentStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export function vendorDocStatusLabel(status: string): string {
  return VENDOR_DOC_STATUS_LABELS[status as VendorDocumentStatus] ?? 'Pending review';
}

@Injectable({ providedIn: 'root' })
export class VendorApi {
  private api = inject(ApiClient);

  async getProfile(): Promise<VendorProfile | null> {
    const res = await this.api.get<{ profile: VendorProfile | null } | null>('vendor/profile');
    return res?.profile ?? null;
  }

  saveProfile(input: VendorProfileInput): Promise<VendorProfile> {
    return this.api.put<VendorProfile>('vendor/profile', input);
  }

  async listDocuments(): Promise<VendorDocument[]> {
    const rows = await this.api.get<VendorDocument[] | null>('vendor/documents');
    return Array.isArray(rows) ? rows : [];
  }

  uploadDocument(file: File, docType: string): Promise<VendorDocument> {
    return this.api.upload<VendorDocument>('vendor/documents', file, { docType });
  }
}
