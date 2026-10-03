import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { VendorApi, VendorProfileInput } from './vendor-api.service';

@Component({
  selector: 'app-vendor-profile',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="vendor-page" data-testid="vendor-profile">
      <header class="page-header">
        <h1>Company profile</h1>
        <p class="subtitle">Tell us about your company and who we should contact.</p>
      </header>
      <form class="vendor-card" data-testid="vendor-profile-form" (ngSubmit)="save()">
        <h2>Company</h2>
        <div class="form-group">
          <label for="vp-company">Company name *</label>
          <input id="vp-company" name="companyName" [(ngModel)]="model.companyName" required />
        </div>
        <div class="form-group">
          <label for="vp-website">Website</label>
          <input id="vp-website" name="website" [(ngModel)]="model.website" />
        </div>
        <div class="form-group">
          <label for="vp-address">Address</label>
          <input id="vp-address" name="address" [(ngModel)]="model.address" />
        </div>
        <h2>Contact details</h2>
        <div class="form-group">
          <label for="vp-contact-name">Contact name *</label>
          <input id="vp-contact-name" name="contactName" [(ngModel)]="model.contactName" required />
        </div>
        <div class="form-group">
          <label for="vp-contact-email">Contact email *</label>
          <input id="vp-contact-email" type="email" name="contactEmail" [(ngModel)]="model.contactEmail" required />
        </div>
        <div class="form-group">
          <label for="vp-contact-phone">Contact phone</label>
          <input id="vp-contact-phone" name="contactPhone" [(ngModel)]="model.contactPhone" />
        </div>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" class="btn-primary" data-testid="vendor-profile-submit" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Save profile' }}
        </button>
      </form>
    </div>
  `,
  styles: [`
    .vendor-page { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
    .page-header { margin-bottom: 1.5rem; }
    h1 { font-size: var(--font-size-xl); color: var(--color-text-primary); margin: 0 0 0.25rem; }
    h2 { font-size: var(--font-size-md, 1rem); color: var(--color-text-primary); margin: 1rem 0 0.5rem; }
    .subtitle { color: var(--color-text-secondary); font-size: var(--font-size-sm); margin: 0; }
    .vendor-card { background: white; border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.25rem; }
    .error { color: var(--color-error); margin: 0; }
  `],
})
export class VendorProfileComponent implements OnInit {
  private vendor = inject(VendorApi);
  private router = inject(Router);

  model: VendorProfileInput = {
    companyName: '', website: '', address: '', contactName: '', contactEmail: '', contactPhone: '',
  };
  saving = signal(false);
  error = signal('');

  async ngOnInit(): Promise<void> {
    try {
      const existing = await this.vendor.getProfile();
      if (existing) {
        this.model = {
          companyName: existing.companyName, website: existing.website ?? '', address: existing.address ?? '',
          contactName: existing.contactName, contactEmail: existing.contactEmail, contactPhone: existing.contactPhone ?? '',
        };
      }
    } catch { /* new vendor — start blank */ }
  }

  async save(): Promise<void> {
    const m = this.model;
    if (!m.companyName?.trim() || !m.contactName?.trim() || !m.contactEmail?.trim()) {
      this.error.set('Company name, contact name and contact email are required.');
      return;
    }
    this.error.set('');
    this.saving.set(true);
    try {
      await this.vendor.saveProfile(m);
      await this.router.navigate(['/vendor']);
    } catch (e) {
      this.error.set((e as Error)?.message || 'Could not save your profile.');
    } finally {
      this.saving.set(false);
    }
  }
}
