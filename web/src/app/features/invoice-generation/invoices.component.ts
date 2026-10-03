import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../shared/auth.service';
import { Order, OrdersApi } from '../order-management/orders-api.service';
import { Invoice, InvoicesApi } from './invoices-api.service';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="invoices-page" data-testid="invoices-page">
      <header class="page-header">
        <h1>Invoices</h1>
        <p class="subtitle">
          {{ isVendor() ? 'Generate invoices for confirmed orders.' : 'Download invoices for your orders.' }}
        </p>
      </header>

      @if (isVendor()) {
        <section class="invoices-card" data-testid="invoiceable-orders">
          <h2>Confirmed orders awaiting an invoice</h2>
          <ul class="list">
            @for (o of uninvoiced(); track o.id) {
              <li class="row" data-testid="invoiceable-order" [attr.data-order-id]="o.id">
                <span>Order {{ o.id }} · {{ orderTotal(o) }}</span>
                <button type="button" class="btn-primary" data-testid="generate-invoice"
                        [disabled]="busy()" (click)="generate(o)">Generate invoice</button>
              </li>
            } @empty {
              <li class="muted">No confirmed orders awaiting an invoice.</li>
            }
          </ul>
        </section>
      }

      <section class="invoices-card" data-testid="invoice-list">
        <h2>Issued invoices</h2>
        <ul class="list">
          @for (inv of invoices(); track inv.id) {
            <li class="row" data-testid="invoice-row" [attr.data-order-id]="inv.orderId">
              <span>
                <strong>{{ inv.invoiceNumber }}</strong>
                · Order {{ inv.orderId }} · {{ money(inv.totalAmount) }}
                · {{ inv.issuedAt | date: 'mediumDate' }}
              </span>
              <button type="button" data-testid="download-invoice" (click)="download(inv)">Download PDF</button>
            </li>
          } @empty {
            <li class="muted" data-testid="invoices-empty">No invoices yet.</li>
          }
        </ul>
      </section>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    </div>
  `,
  styles: [`
    .invoices-page { max-width: 1100px; margin: 0 auto; padding: 2rem 1rem; display: flex; flex-direction: column; gap: 1rem; }
    h1 { font-size: var(--font-size-xl); color: var(--color-text-primary); margin: 0 0 0.25rem; }
    h2 { font-size: var(--font-size-md, 1rem); color: var(--color-text-primary); margin: 0 0 0.5rem; }
    .subtitle, .muted { color: var(--color-text-secondary); font-size: var(--font-size-sm); margin: 0; }
    .invoices-card { background: white; border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .row { border-bottom: 1px solid var(--color-border); padding: 0.4rem 0; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: space-between; }
    .error { color: var(--color-error); margin: 0; }
  `],
})
export class InvoicesComponent implements OnInit {
  private api = inject(InvoicesApi);
  private orders = inject(OrdersApi);
  private auth = inject(AuthService);

  isVendor = computed(() => this.auth.hasRole('MANAGER', 'ADMIN'));

  invoices = signal<Invoice[]>([]);
  confirmedOrders = signal<Order[]>([]);
  busy = signal(false);
  error = signal('');

  uninvoiced = computed(() => {
    const invoiced = new Set(this.invoices().map(i => i.orderId));
    return this.confirmedOrders().filter(o => o.status === 'CONFIRMED' && !invoiced.has(o.id));
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try { this.invoices.set(await this.api.list()); } catch { this.invoices.set([]); }
    if (this.isVendor()) {
      try { this.confirmedOrders.set(await this.orders.vendorQueue()); } catch { this.confirmedOrders.set([]); }
    }
  }

  money(v: string | number): string {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : String(v);
  }

  orderTotal(o: Order): string {
    return this.money(o.items.reduce((sum, it) => sum + Number(it.unitPrice) * it.quantity, 0));
  }

  async generate(order: Order): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      await this.api.generate(order.id);
      await this.load();
    } catch (e) {
      this.error.set((e as Error)?.message || 'Could not generate the invoice.');
    } finally {
      this.busy.set(false);
    }
  }

  async download(inv: Invoice): Promise<void> {
    this.error.set('');
    try {
      const blob = await this.api.download(inv.id);
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inv.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      this.error.set((e as Error)?.message || 'Could not download the invoice.');
    }
  }
}
