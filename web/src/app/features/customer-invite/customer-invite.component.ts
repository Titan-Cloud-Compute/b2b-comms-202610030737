import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomerInvitation, CustomerInviteApi } from './customer-invite-api.service';

@Component({
  selector: 'app-customer-invite',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <div class="invite-page" data-testid="customer-invite-page">
      <header class="page-header">
        <h1>Invite customer</h1>
        <p class="subtitle">Send an invitation email with an activation link to a customer.</p>
      </header>

      <section class="card">
        <form data-testid="customer-invite-form" (ngSubmit)="send()">
          <label for="invite-email">Customer email</label>
          <div class="form-row">
            <input id="invite-email" name="email" type="email" required
                   data-testid="invite-email" placeholder="customer@example.com"
                   [(ngModel)]="email" [disabled]="busy()" />
            <button type="submit" data-testid="invite-send" [disabled]="busy() || !email.trim()">
              {{ busy() ? 'Sending…' : 'Send invitation' }}
            </button>
          </div>
        </form>
        @if (status()) { <p class="success" data-testid="invite-status" role="status">{{ status() }}</p> }
        @if (error()) { <p class="error" data-testid="invite-error" role="alert">{{ error() }}</p> }
      </section>

      <section class="card" data-testid="customer-invite-list">
        <h2>Invitations</h2>
        <ul class="list">
          @for (i of invites(); track i.id) {
            <li class="row" data-testid="customer-invite-item">
              <span>{{ i.email }}</span>
              <span class="badge" [attr.data-status]="i.status">{{ i.status }}</span>
              <span class="muted">expires {{ i.expiresAt | date: 'short' }}</span>
            </li>
          } @empty {
            <li class="muted">No invitations yet.</li>
          }
        </ul>
      </section>
    </div>
  `,
  styles: [`
    .invite-page { max-width: 1100px; margin: 0 auto; padding: 2rem 1rem; display: flex; flex-direction: column; gap: 1rem; }
    h1 { font-size: var(--font-size-xl); color: var(--color-text-primary); margin: 0 0 0.25rem; }
    h2 { font-size: var(--font-size-md, 1rem); color: var(--color-text-primary); margin: 0 0 0.5rem; }
    .subtitle, .muted { color: var(--color-text-secondary); }
    .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md, 8px); padding: 1rem; }
    .form-row { display: flex; gap: 0.5rem; margin-top: 0.25rem; }
    .form-row input { flex: 1; }
    .list { list-style: none; margin: 0; padding: 0; }
    .row { display: flex; gap: 1rem; padding: 0.5rem 0; border-bottom: 1px solid var(--color-border); }
    .success { color: var(--color-success, inherit); }
    .error { color: var(--color-danger); }
  `],
})
export class CustomerInviteComponent implements OnInit {
  private api = inject(CustomerInviteApi);

  email = '';
  invites = signal<CustomerInvitation[]>([]);
  busy = signal(false);
  status = signal('');
  error = signal('');

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      this.invites.set(await this.api.list());
    } catch (e: unknown) {
      this.error.set((e as Error)?.message || 'Could not load invitations');
    }
  }

  async send(): Promise<void> {
    const email = this.email.trim();
    if (!email || this.busy()) return;
    this.busy.set(true);
    this.status.set('');
    this.error.set('');
    try {
      const invite = await this.api.send(email);
      this.status.set(`Invitation sent to ${invite?.email || email}`);
      this.email = '';
      if (invite?.id) {
        this.invites.update(list => [invite, ...list.filter(i => i.id !== invite.id)]);
      } else {
        await this.load();
      }
    } catch (e: unknown) {
      this.error.set((e as Error)?.message || 'Could not send invitation');
    } finally {
      this.busy.set(false);
    }
  }
}
