import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { VendorApi, VendorDocument, VendorProfile, vendorDocStatusLabel } from './vendor-api.service';

@Component({
  selector: 'app-vendor-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <div class="vendor-page" data-testid="vendor-dashboard">
      <header class="page-header">
        <h1>Vendor dashboard</h1>
        @if (profile(); as p) {
          <p class="subtitle">{{ p.companyName }} · {{ p.contactName }} ({{ p.contactEmail }})
            — <a routerLink="/vendor/profile">Edit profile</a></p>
        } @else if (loaded()) {
          <p class="notice" data-testid="vendor-profile-required">
            Complete your <a routerLink="/vendor/profile">company profile</a> before uploading compliance documents.
          </p>
        }
      </header>

      <form class="vendor-card" data-testid="vendor-doc-upload" (ngSubmit)="upload()">
        <h2>Upload compliance document</h2>
        <div class="form-group">
          <label for="vd-type">Document type</label>
          <select id="vd-type" name="docType" [(ngModel)]="docType" [disabled]="!profile()">
            <option value="Business license">Business license</option>
            <option value="Insurance certificate">Insurance certificate</option>
            <option value="Tax form">Tax form</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label for="vd-file">File</label>
          <input id="vd-file" type="file" name="file" (change)="onFile($event)" [disabled]="!profile()" />
        </div>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" class="btn-primary" data-testid="vendor-doc-submit"
                [disabled]="!profile() || !file || uploading()">
          {{ uploading() ? 'Uploading…' : 'Upload' }}
        </button>
      </form>

      <section class="vendor-card" data-testid="vendor-doc-library">
        <h2>Document library</h2>
        @if (documents().length === 0) {
          <p class="empty">No documents uploaded yet.</p>
        } @else {
          <ul class="doc-list">
            @for (d of documents(); track d.id) {
              <li class="doc-row" data-testid="vendor-doc-row">
                <span class="doc-name">{{ d.fileName }}</span>
                <span class="doc-type">{{ d.docType }}</span>
                <span class="doc-date">{{ d.uploadedAt | date: 'mediumDate' }}</span>
                <span class="doc-status" data-testid="vendor-doc-status">{{ label(d.status) }}</span>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
  styles: [`
    .vendor-page { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; display: flex; flex-direction: column; gap: 1.5rem; }
    h1 { font-size: var(--font-size-xl); color: var(--color-text-primary); margin: 0 0 0.25rem; }
    h2 { font-size: var(--font-size-md, 1rem); color: var(--color-text-primary); margin: 0 0 0.5rem; }
    .subtitle, .notice, .empty { color: var(--color-text-secondary); font-size: var(--font-size-sm); margin: 0; }
    .vendor-card { background: white; border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.25rem; }
    .error { color: var(--color-error); margin: 0; }
    .doc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .doc-row { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.75rem; align-items: center; }
    .doc-status { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
  `],
})
export class VendorDashboardComponent implements OnInit {
  private vendor = inject(VendorApi);

  profile = signal<VendorProfile | null>(null);
  documents = signal<VendorDocument[]>([]);
  loaded = signal(false);
  uploading = signal(false);
  error = signal('');
  docType = 'Business license';
  file: File | null = null;

  readonly label = vendorDocStatusLabel;

  async ngOnInit(): Promise<void> {
    try {
      this.profile.set(await this.vendor.getProfile());
      if (this.profile()) this.documents.set(await this.vendor.listDocuments());
    } catch {
      this.error.set('Could not load your vendor details.');
    } finally {
      this.loaded.set(true);
    }
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
  }

  async upload(): Promise<void> {
    if (!this.profile() || !this.file) return;
    this.error.set('');
    this.uploading.set(true);
    try {
      const doc = await this.vendor.uploadDocument(this.file, this.docType);
      this.documents.set([doc, ...this.documents()]);
      this.file = null;
    } catch (e) {
      this.error.set((e as Error)?.message || 'Upload failed.');
    } finally {
      this.uploading.set(false);
    }
  }
}
