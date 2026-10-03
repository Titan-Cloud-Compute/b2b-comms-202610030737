import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../shared/auth.service';
import { Channel, ChannelApi, ChannelMessage, CustomerOption } from './channel-api.service';

@Component({
  selector: 'app-channels',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="channels-page" data-testid="channels-page">
      <header class="page-header">
        <h1>Channels</h1>
        <p class="subtitle">Shared conversations between vendors and their customers.</p>
      </header>
      <div class="channels-layout">
        <aside class="channels-card">
          <h2>Your channels</h2>
          <ul class="channel-list" data-testid="channel-list">
            @for (ch of channels(); track ch.id) {
              <li>
                <button type="button" class="channel-item" data-testid="channel-item"
                        [class.active]="ch.id === selectedId()" (click)="select(ch.id)">
                  {{ ch.name }}
                </button>
              </li>
            } @empty {
              <li class="muted" data-testid="channel-empty">No channels yet.</li>
            }
          </ul>
          @if (isVendor()) {
            <form class="create-form" data-testid="create-channel-form" (ngSubmit)="createChannel()">
              <h2>New shared channel</h2>
              <label for="ch-name">Channel name</label>
              <input id="ch-name" name="channelName" [(ngModel)]="newName" data-testid="channel-name-input" />
              <fieldset class="customer-picker" data-testid="customer-picker">
                <legend>Customers</legend>
                @for (c of customers(); track c.id) {
                  <label class="customer-option">
                    <input type="checkbox" [checked]="picked().has(c.id)" (change)="toggleCustomer(c.id)"
                           [attr.data-customer-id]="c.id" data-testid="customer-option" />
                    {{ c.name || c.email }}
                  </label>
                } @empty {
                  <p class="muted">No customers available.</p>
                }
              </fieldset>
              @if (createError()) {
                <p class="error" role="alert">{{ createError() }}</p>
              }
              <button type="submit" class="btn-primary" data-testid="create-channel" [disabled]="creating()">
                {{ creating() ? 'Creating…' : 'Create channel' }}
              </button>
            </form>
          }
        </aside>
        <section class="channels-card thread">
          @if (selected(); as ch) {
            <h2 data-testid="channel-title">{{ ch.name }}</h2>
            @if (isVendor() && customers().length) {
              <div class="add-member">
                <select name="addMember" [(ngModel)]="addMemberId" data-testid="add-member-select" aria-label="Add customer">
                  <option value="">Add a customer…</option>
                  @for (c of customers(); track c.id) {
                    <option [value]="c.id">{{ c.name || c.email }}</option>
                  }
                </select>
                <button type="button" data-testid="add-member" (click)="addMember()" [disabled]="!addMemberId">Add</button>
              </div>
            }
            <ul class="message-list" data-testid="message-list">
              @for (m of messages(); track m.id) {
                <li class="message" data-testid="message-item">
                  <span class="meta">{{ m.authorUserId === myId() ? 'You' : 'Member' }} · {{ m.createdAt | date: 'short' }}</span>
                  <span class="body">{{ m.body }}</span>
                </li>
              } @empty {
                <li class="muted">No messages yet.</li>
              }
            </ul>
            <form class="composer" (ngSubmit)="send()">
              <input name="messageBody" [(ngModel)]="draft" placeholder="Write a message…"
                     data-testid="message-input" aria-label="Message" />
              <button type="submit" class="btn-primary" data-testid="send-message" [disabled]="sending()">Send</button>
            </form>
            @if (sendError()) {
              <p class="error" role="alert">{{ sendError() }}</p>
            }
          } @else {
            <p class="muted">Select a channel to view its messages.</p>
          }
        </section>
      </div>
    </div>
  `,
  styles: [`
    .channels-page { max-width: 1100px; margin: 0 auto; padding: 2rem 1rem; }
    .page-header { margin-bottom: 1.5rem; }
    h1 { font-size: var(--font-size-xl); color: var(--color-text-primary); margin: 0 0 0.25rem; }
    h2 { font-size: var(--font-size-md, 1rem); color: var(--color-text-primary); margin: 0 0 0.5rem; }
    .subtitle, .muted { color: var(--color-text-secondary); font-size: var(--font-size-sm); margin: 0; }
    .channels-layout { display: grid; grid-template-columns: 300px 1fr; gap: 1rem; }
    .channels-card { background: white; border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
    .channel-list, .message-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
    .channel-item { width: 100%; text-align: left; background: none; border: 1px solid transparent; border-radius: var(--radius-card); padding: 0.5rem; cursor: pointer; }
    .channel-item.active { border-color: var(--color-border); font-weight: 600; }
    .create-form, .customer-picker { display: flex; flex-direction: column; gap: 0.4rem; }
    .message-list { max-height: 420px; overflow-y: auto; }
    .message { display: flex; flex-direction: column; padding: 0.4rem 0; border-bottom: 1px solid var(--color-border); }
    .meta { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
    .composer, .add-member { display: flex; gap: 0.5rem; }
    .composer input { flex: 1; }
    .error { color: var(--color-error); margin: 0; }
  `],
})
export class ChannelsComponent implements OnInit, OnDestroy {
  private api = inject(ChannelApi);
  private auth = inject(AuthService);
  private source: EventSource | null = null;

  channels = signal<Channel[]>([]);
  customers = signal<CustomerOption[]>([]);
  messages = signal<ChannelMessage[]>([]);
  selectedId = signal<string | null>(null);
  picked = signal<Set<string>>(new Set());
  creating = signal(false);
  sending = signal(false);
  createError = signal('');
  sendError = signal('');

  newName = '';
  draft = '';
  addMemberId = '';

  isVendor = computed(() => this.auth.hasRole('MANAGER', 'ADMIN'));
  myId = computed(() => this.auth.user()?.id ?? '');
  selected = computed(() => this.channels().find(c => c.id === this.selectedId()) ?? null);

  async ngOnInit(): Promise<void> {
    await this.loadChannels();
    if (this.isVendor()) {
      try { this.customers.set(await this.api.listCustomers()); } catch { this.customers.set([]); }
    }
  }

  ngOnDestroy(): void {
    this.closeStream();
  }

  private async loadChannels(selectId?: string): Promise<void> {
    try {
      this.channels.set(await this.api.listChannels());
    } catch {
      this.channels.set([]);
    }
    const target = selectId ?? this.selectedId() ?? this.channels()[0]?.id;
    if (target && this.channels().some(c => c.id === target)) await this.select(target);
  }

  async select(id: string): Promise<void> {
    if (this.selectedId() === id && this.source) return;
    this.selectedId.set(id);
    this.sendError.set('');
    this.closeStream();
    try {
      this.messages.set(await this.api.listMessages(id));
    } catch {
      this.messages.set([]);
    }
    this.openStream(id);
  }

  private openStream(id: string): void {
    const src = this.api.openStream(id);
    if (!src) return;
    src.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data) as ChannelMessage;
        if (msg.channelId === this.selectedId()) this.appendMessage(msg);
      } catch { /* ignore malformed frames */ }
    };
    this.source = src;
  }

  private closeStream(): void {
    this.source?.close();
    this.source = null;
  }

  private appendMessage(msg: ChannelMessage): void {
    if (this.messages().some(m => m.id === msg.id)) return;
    this.messages.update(list => [...list, msg]);
  }

  toggleCustomer(id: string): void {
    this.picked.update(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async createChannel(): Promise<void> {
    const name = this.newName.trim();
    const ids = [...this.picked()];
    if (!name || ids.length === 0) {
      this.createError.set('Enter a channel name and pick at least one customer.');
      return;
    }
    this.createError.set('');
    this.creating.set(true);
    try {
      const ch = await this.api.createChannel(name, ids);
      this.newName = '';
      this.picked.set(new Set());
      await this.loadChannels(ch.id);
    } catch (e) {
      this.createError.set((e as Error)?.message || 'Could not create the channel.');
    } finally {
      this.creating.set(false);
    }
  }

  async addMember(): Promise<void> {
    const id = this.selectedId();
    if (!id || !this.addMemberId) return;
    try {
      await this.api.addMembers(id, [this.addMemberId]);
      this.addMemberId = '';
    } catch (e) {
      this.sendError.set((e as Error)?.message || 'Could not add the customer.');
    }
  }

  async send(): Promise<void> {
    const id = this.selectedId();
    const body = this.draft.trim();
    if (!id || !body) return;
    this.sending.set(true);
    this.sendError.set('');
    try {
      const msg = await this.api.sendMessage(id, body);
      this.draft = '';
      this.appendMessage(msg);
    } catch (e) {
      this.sendError.set((e as Error)?.message || 'Could not send the message.');
    } finally {
      this.sending.set(false);
    }
  }
}
