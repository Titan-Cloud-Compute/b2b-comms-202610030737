import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  AlertFeedItem,
  NotificationPreferences,
  NotificationPreferencesApi,
} from './notification-preferences-api.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="notifications-page" data-testid="notifications-page">
      <header class="page-header">
        <h1>Notifications</h1>
        <p class="subtitle">Choose which events alert you. Changes apply to events from now on.</p>
      </header>

      <section class="card" data-testid="notification-preferences">
        <h2>Alert preferences</h2>
        <label class="toggle-row">
          <span>Order alerts</span>
          <input type="checkbox" data-testid="pref-order-alerts"
                 [checked]="prefs().orderAlerts" [disabled]="busy()"
                 (change)="toggle('orderAlerts', $any($event.target).checked)" />
        </label>
        <label class="toggle-row">
          <span>Message alerts</span>
          <input type="checkbox" data-testid="pref-message-alerts"
                 [checked]="prefs().messageAlerts" [disabled]="busy()"
                 (change)="toggle('messageAlerts', $any($event.target).checked)" />
        </label>
        @if (status()) { <p class="muted" data-testid="pref-status" role="status">{{ status() }}</p> }
      </section>

      <section class="card" data-testid="notification-feed">
        <h2>Alert feed</h2>
        <ul class="list">
          @for (a of feed(); track a.kind + a.id) {
            <li class="row" data-testid="alert-item" [attr.data-kind]="a.kind">
              <span>
                <strong>{{ a.kind === 'order' ? 'Order' : 'Message' }}</strong>
                · {{ a.body }} · {{ a.createdAt | date: 'short' }}
              </span>
            </li>
          } @empty {
            <li class="muted" data-testid="alert-feed-empty">No alerts yet.</li>
          }
        </ul>
      </section>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </div>
  `,
  styles: [`
    .notifications-page { max-width: 1100px; margin: 0 auto; padding: 2rem 1rem; display: flex; flex-direction: column; gap: 1rem; }
    h1 { font-size: var(--font-size-xl); color: var(--color-text-primary); margin: 0 0 0.25rem; }
    h2 { font-size: var(--font-size-md, 1rem); color: var(--color-text-primary); margin: 0 0 0.5rem; }
    .subtitle, .muted { color: var(--color-text-secondary); }
    .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md, 8px); padding: 1rem; }
    .toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; }
    .list { list-style: none; margin: 0; padding: 0; }
    .row { padding: 0.5rem 0; border-bottom: 1px solid var(--color-border); }
    .error { color: var(--color-danger); }
  `],
})
export class NotificationsComponent implements OnInit {
  private api = inject(NotificationPreferencesApi);

  prefs = signal<NotificationPreferences>({ orderAlerts: true, messageAlerts: true });
  feed = signal<AlertFeedItem[]>([]);
  busy = signal(false);
  status = signal('');
  error = signal('');

  async ngOnInit(): Promise<void> {
    try {
      this.prefs.set(await this.api.get());
    } catch (e: unknown) {
      this.error.set((e as Error)?.message || 'Could not load preferences');
    }
    await this.loadFeed();
  }

  async loadFeed(): Promise<void> {
    try {
      this.feed.set(await this.api.feed());
    } catch (e: unknown) {
      this.error.set((e as Error)?.message || 'Could not load alerts');
    }
  }

  async toggle(key: keyof NotificationPreferences, value: boolean): Promise<void> {
    const previous = this.prefs();
    const next = { ...previous, [key]: value };
    this.prefs.set(next);
    this.busy.set(true);
    this.status.set('');
    this.error.set('');
    try {
      this.prefs.set(await this.api.save(next));
      this.status.set('Preferences saved');
      await this.loadFeed();
    } catch (e: unknown) {
      this.prefs.set(previous);
      this.error.set((e as Error)?.message || 'Could not save preferences');
    } finally {
      this.busy.set(false);
    }
  }
}
