import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../shared/auth.service';
import { Order, OrderNotification, OrdersApi, Product, VendorOption } from './orders-api.service';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="orders-page" data-testid="orders-page">
      <header class="page-header">
        <h1>Orders</h1>
        <p class="subtitle">
          {{ isVendor() ? 'Review incoming purchase orders and manage your products.' : 'Browse a vendor catalog and submit purchase orders.' }}
        </p>
      </header>

      @if (isVendor()) {
        <section class="orders-card" data-testid="order-queue">
          <h2>Order queue</h2>
          <ul class="order-list">
            @for (o of queue(); track o.id) {
              <li class="order" data-testid="queue-order" [attr.data-order-id]="o.id">
                <div class="order-head">
                  <strong>Order {{ o.id }}</strong>
                  <span class="status" data-testid="order-status">{{ o.status === 'PENDING' ? 'Pending' : 'Confirmed' }}</span>
                </div>
                <ul class="items">
                  @for (it of o.items; track $index) {
                    <li>{{ it.quantity }} × {{ it.product?.name || it.productId }}</li>
                  }
                </ul>
                @if (o.status === 'PENDING') {
                  <div class="confirm-row">
                    <label [attr.for]="'eta-' + o.id">Estimated delivery</label>
                    <input type="date" [id]="'eta-' + o.id" [name]="'eta-' + o.id" data-testid="eta-input"
                           [ngModel]="eta()[o.id] || ''" (ngModelChange)="setEta(o.id, $event)" />
                    <button type="button" class="btn-primary" data-testid="confirm-order"
                            [disabled]="busy()" (click)="confirm(o)">Confirm</button>
                  </div>
                } @else if (o.estimatedDeliveryDate) {
                  <p class="muted" data-testid="order-eta">Estimated delivery: {{ o.estimatedDeliveryDate | date: 'mediumDate' : 'UTC' }}</p>
                }
              </li>
            } @empty {
              <li class="muted" data-testid="queue-empty">No orders yet.</li>
            }
          </ul>
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        </section>

        <section class="orders-card" data-testid="products-manager">
          <h2>Your products</h2>
          <ul class="order-list">
            @for (p of products(); track p.id) {
              <li class="product" data-testid="managed-product">
                <span>{{ p.name }} · {{ price(p.unitPrice) }}</span>
                <button type="button" data-testid="toggle-product" (click)="toggleProduct(p)">
                  {{ p.active ? 'Hide from catalog' : 'Show in catalog' }}
                </button>
              </li>
            } @empty {
              <li class="muted">No products yet.</li>
            }
          </ul>
          <form class="inline-form" (ngSubmit)="addProduct()">
            <input name="productName" [(ngModel)]="newProductName" placeholder="Product name"
                   aria-label="Product name" data-testid="product-name-input" />
            <input name="productPrice" type="number" min="0" step="0.01" [(ngModel)]="newProductPrice"
                   aria-label="Unit price" data-testid="product-price-input" />
            <button type="submit" class="btn-primary" data-testid="add-product">Add product</button>
          </form>
        </section>
      } @else {
        <section class="orders-card" data-testid="catalog">
          <h2>Product catalog</h2>
          <label for="vendor-select">Vendor</label>
          <select id="vendor-select" name="vendor" [ngModel]="vendorId()" (ngModelChange)="selectVendor($event)"
                  data-testid="vendor-select">
            <option value="">Select a vendor…</option>
            @for (v of vendors(); track v.id) {
              <option [value]="v.id">{{ v.name || v.email }}</option>
            }
          </select>
          <ul class="order-list">
            @for (p of catalog(); track p.id) {
              <li class="product" data-testid="catalog-product">
                <span>{{ p.name }} · {{ price(p.unitPrice) }}</span>
                <input type="number" min="0" step="1" [attr.aria-label]="'Quantity of ' + p.name"
                       data-testid="quantity-input" [ngModel]="qty()[p.id] || 0"
                       (ngModelChange)="setQty(p.id, $event)" [name]="'qty-' + p.id" />
              </li>
            } @empty {
              <li class="muted">{{ vendorId() ? 'This vendor has no products yet.' : 'Pick a vendor to see its catalog.' }}</li>
            }
          </ul>
          <form class="inline-form" (ngSubmit)="submitOrder()" data-testid="order-form">
            <input name="notes" [(ngModel)]="notes" placeholder="Notes (optional)" aria-label="Order notes" />
            <button type="submit" class="btn-primary" data-testid="submit-order" [disabled]="busy()">Submit purchase order</button>
          </form>
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        </section>

        <section class="orders-card" data-testid="my-orders">
          <h2>Your orders</h2>
          <ul class="order-list">
            @for (o of myOrders(); track o.id) {
              <li class="order" data-testid="my-order">
                <strong>Order {{ o.id }}</strong>
                <span class="status" data-testid="my-order-status">{{ o.status === 'PENDING' ? 'Pending' : 'Confirmed' }}</span>
                @if (o.estimatedDeliveryDate) {
                  <span class="muted">· ETA {{ o.estimatedDeliveryDate | date: 'mediumDate' : 'UTC' }}</span>
                }
              </li>
            } @empty {
              <li class="muted">No orders yet.</li>
            }
          </ul>
        </section>

        <section class="orders-card" data-testid="order-notifications">
          <h2>Notifications</h2>
          <ul class="order-list">
            @for (n of notifications(); track n.id) {
              <li data-testid="order-notification">{{ n.body }}</li>
            } @empty {
              <li class="muted">No notifications.</li>
            }
          </ul>
        </section>
      }
    </div>
  `,
  styles: [`
    .orders-page { max-width: 1100px; margin: 0 auto; padding: 2rem 1rem; display: flex; flex-direction: column; gap: 1rem; }
    h1 { font-size: var(--font-size-xl); color: var(--color-text-primary); margin: 0 0 0.25rem; }
    h2 { font-size: var(--font-size-md, 1rem); color: var(--color-text-primary); margin: 0 0 0.5rem; }
    .subtitle, .muted { color: var(--color-text-secondary); font-size: var(--font-size-sm); margin: 0; }
    .orders-card { background: white; border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
    .order-list, .items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .order, .product { border-bottom: 1px solid var(--color-border); padding: 0.4rem 0; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: space-between; }
    .order-head, .confirm-row, .inline-form { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .status { font-weight: 600; }
    .error { color: var(--color-error); margin: 0; }
  `],
})
export class OrdersComponent implements OnInit {
  private api = inject(OrdersApi);
  private auth = inject(AuthService);

  isVendor = computed(() => this.auth.hasRole('MANAGER', 'ADMIN'));

  // Vendor state
  queue = signal<Order[]>([]);
  products = signal<Product[]>([]);
  eta = signal<Record<string, string>>({});
  newProductName = '';
  newProductPrice: number | null = null;

  // Customer state
  vendors = signal<VendorOption[]>([]);
  vendorId = signal('');
  catalog = signal<Product[]>([]);
  qty = signal<Record<string, number>>({});
  myOrders = signal<Order[]>([]);
  notifications = signal<OrderNotification[]>([]);
  notes = '';

  busy = signal(false);
  error = signal('');

  async ngOnInit(): Promise<void> {
    if (this.isVendor()) {
      await Promise.all([this.loadQueue(), this.loadProducts()]);
    } else {
      try { this.vendors.set(await this.api.listVendors()); } catch { this.vendors.set([]); }
      if (this.vendors().length === 1) await this.selectVendor(this.vendors()[0].id);
      await this.loadCustomerOrders();
    }
  }

  price(v: string | number): string {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : String(v);
  }

  private async loadQueue(): Promise<void> {
    try { this.queue.set(await this.api.vendorQueue()); } catch { this.queue.set([]); }
  }

  private async loadProducts(): Promise<void> {
    try { this.products.set(await this.api.myProducts()); } catch { this.products.set([]); }
  }

  private async loadCustomerOrders(): Promise<void> {
    try { this.myOrders.set(await this.api.myOrders()); } catch { this.myOrders.set([]); }
    try { this.notifications.set(await this.api.notifications()); } catch { this.notifications.set([]); }
  }

  setEta(orderId: string, value: string): void {
    this.eta.update(m => ({ ...m, [orderId]: value }));
  }

  async confirm(order: Order): Promise<void> {
    const date = this.eta()[order.id];
    if (!date) {
      this.error.set('Set an estimated delivery date before confirming.');
      return;
    }
    this.error.set('');
    this.busy.set(true);
    try {
      await this.api.confirm(order.id, date);
      await this.loadQueue();
    } catch (e) {
      this.error.set((e as Error)?.message || 'Could not confirm the order.');
    } finally {
      this.busy.set(false);
    }
  }

  async addProduct(): Promise<void> {
    const name = this.newProductName.trim();
    if (!name) return;
    try {
      await this.api.createProduct({ name, unitPrice: Number(this.newProductPrice) || 0 });
      this.newProductName = '';
      this.newProductPrice = null;
      await this.loadProducts();
    } catch (e) {
      this.error.set((e as Error)?.message || 'Could not add the product.');
    }
  }

  async toggleProduct(p: Product): Promise<void> {
    try {
      await this.api.updateProduct(p.id, { active: !p.active });
      await this.loadProducts();
    } catch (e) {
      this.error.set((e as Error)?.message || 'Could not update the product.');
    }
  }

  async selectVendor(id: string): Promise<void> {
    this.vendorId.set(id);
    this.qty.set({});
    if (!id) { this.catalog.set([]); return; }
    try { this.catalog.set(await this.api.catalog(id)); } catch { this.catalog.set([]); }
  }

  setQty(productId: string, value: number | string): void {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    this.qty.update(m => ({ ...m, [productId]: n }));
  }

  async submitOrder(): Promise<void> {
    const items = Object.entries(this.qty())
      .filter(([, q]) => q > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));
    if (!this.vendorId() || items.length === 0) {
      this.error.set('Pick a vendor and set a quantity for at least one product.');
      return;
    }
    this.error.set('');
    this.busy.set(true);
    try {
      await this.api.createOrder(this.vendorId(), items, this.notes.trim());
      this.notes = '';
      this.qty.set({});
      await this.loadCustomerOrders();
    } catch (e) {
      this.error.set((e as Error)?.message || 'Could not submit the order.');
    } finally {
      this.busy.set(false);
    }
  }
}
