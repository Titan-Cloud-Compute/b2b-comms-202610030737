import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CustomerInviteApi } from './customer-invite-api.service';

@Component({
  selector: 'app-activate-invite',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="activate-page" data-testid="activate-invite-page">
      <h1>Activate your customer account</h1>
      @if (activated()) {
        <p class="success" data-testid="activate-status" role="status">
          Your account {{ inviteEmail() }} is active. <a routerLink="/login">Sign in</a>
        </p>
      } @else if (invalid()) {
        <p class="error" data-testid="activate-error" role="alert">This invitation link is invalid or has expired.</p>
      } @else {
        <form data-testid="activate-invite-form" (ngSubmit)="activate()">
          @if (inviteEmail()) { <p class="muted" data-testid="activate-email">{{ inviteEmail() }}</p> }
          <label for="activate-name">Name</label>
          <input id="activate-name" name="name" type="text" data-testid="activate-name" [(ngModel)]="name" />
          <label for="activate-password">Password</label>
          <input id="activate-password" name="password" type="password" minlength="8" required
                 data-testid="activate-password" [(ngModel)]="password" />
          <button type="submit" data-testid="activate-submit" [disabled]="busy() || password.length < 8">
            Activate account
          </button>
        </form>
        @if (error()) { <p class="error" data-testid="activate-error" role="alert">{{ error() }}</p> }
      }
    </div>
  `,
  styles: [`
    .activate-page { max-width: 420px; margin: 3rem auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
    form { display: flex; flex-direction: column; gap: 0.5rem; }
    .muted { color: var(--color-text-secondary); }
    .error { color: var(--color-danger); }
  `],
})
export class ActivateInviteComponent implements OnInit {
  private api = inject(CustomerInviteApi);
  private route = inject(ActivatedRoute);

  token = '';
  name = '';
  password = '';
  inviteEmail = signal('');
  invalid = signal(false);
  activated = signal(false);
  busy = signal(false);
  error = signal('');

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.invalid.set(true);
      return;
    }
    try {
      const p = await this.api.preview(this.token);
      if (!p?.valid) this.invalid.set(true);
      else this.inviteEmail.set(p.email ?? '');
    } catch {
      this.invalid.set(true);
    }
  }

  async activate(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const res = await this.api.activate(this.token, this.password, this.name.trim() || undefined);
      if (res?.email) this.inviteEmail.set(res.email);
      this.activated.set(true);
    } catch (e: unknown) {
      this.error.set((e as Error)?.message || 'Could not activate account');
    } finally {
      this.busy.set(false);
    }
  }
}
