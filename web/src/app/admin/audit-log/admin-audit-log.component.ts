import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { ApiClient } from '../../shared/api/api-client.service';

export type AuditActorKind = 'ADMIN' | 'USER' | 'SYSTEM';

export interface AuditLogRow {
  id: string;
  actor: AuditActorKind;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  outcome: 'success' | 'failure';
  payloadJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogPage {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogParams {
  actor?: AuditActorKind | '';
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Admin Audit Log tab — chronological (newest first) list of user actions and
 * system events from GET /api/admin/audit-log.
 */
@Component({
  selector: 'app-admin-audit-log',
  standalone: true,
  imports: [DatePipe, JsonPipe],
  template: `
    <section class="audit-log" data-testid="audit-log">
      <div class="toolbar">
        <label for="audit-actor">Actor</label>
        <select id="audit-actor" data-testid="audit-log-actor-filter" [value]="actor()" (change)="onActorChange($event)">
          <option value="">All</option>
          <option value="ADMIN">Admin</option>
          <option value="USER">User</option>
          <option value="SYSTEM">System</option>
        </select>
      </div>

      @if (loading()) {
        <p class="state" data-testid="audit-log-loading">Loading audit log…</p>
      } @else if (error()) {
        <p class="state error" data-testid="audit-log-error">{{ error() }}</p>
      } @else if (rows().length === 0) {
        <p class="state" data-testid="audit-log-empty">No audit events recorded yet.</p>
      } @else {
        <table class="audit-table">
          <thead>
            <tr><th>Time</th><th>Actor</th><th>User</th><th>Action</th><th>Outcome</th><th>Details</th></tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr data-testid="audit-log-row">
                <td>{{ row.createdAt | date: 'yyyy-MM-dd HH:mm:ss' }}</td>
                <td>{{ row.actor }}</td>
                <td>{{ row.actorEmail ?? row.actorUserId ?? '—' }}</td>
                <td>{{ row.action }}</td>
                <td [class.failure]="row.outcome === 'failure'">{{ row.outcome }}</td>
                <td class="details">{{ row.payloadJson | json }}</td>
              </tr>
            }
          </tbody>
        </table>
        <div class="pager">
          <button type="button" data-testid="audit-log-prev" [disabled]="page() <= 1" (click)="goTo(page() - 1)">Previous</button>
          <span>Page {{ page() }} of {{ totalPages() }} ({{ total() }} events)</span>
          <button type="button" data-testid="audit-log-next" [disabled]="page() >= totalPages()" (click)="goTo(page() + 1)">Next</button>
        </div>
      }
    </section>
  `,
  styles: [`
    .toolbar { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem; }
    .audit-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); }
    .audit-table th, .audit-table td { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
    .details { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .failure { color: var(--color-error-600); }
    .state { color: var(--color-text-secondary); }
    .error { color: var(--color-error-600); }
    .pager { display: flex; gap: 1rem; align-items: center; margin-top: 1rem; }
  `],
})
export class AdminAuditLogComponent implements OnInit {
  private api = inject(ApiClient);

  readonly pageSize = 50;
  rows = signal<AuditLogRow[]>([]);
  total = signal(0);
  page = signal(1);
  actor = signal<AuditActorKind | ''>('');
  loading = signal(false);
  error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / this.pageSize));
  }

  onActorChange(event: Event): void {
    this.actor.set((event.target as HTMLSelectElement).value as AuditActorKind | '');
    this.page.set(1);
    void this.load();
  }

  goTo(page: number): void {
    this.page.set(page);
    void this.load();
  }

  getAuditLog(params: AuditLogParams): Promise<AuditLogPage> {
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') q[k] = String(v);
    }
    return this.api.get<AuditLogPage>('admin/audit-log', { params: q });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.getAuditLog({ actor: this.actor(), page: this.page(), pageSize: this.pageSize });
      const rows = [...(res?.rows ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      this.rows.set(rows);
      this.total.set(res?.total ?? rows.length);
    } catch {
      this.error.set('Could not load the audit log. Please try again.');
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
