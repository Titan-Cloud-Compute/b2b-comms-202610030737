import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../shared/api/api-client.service';

export interface VendorOption {
  id: string;
  email: string;
  name: string | null;
}

export interface Product {
  id: string;
  vendorUserId: string;
  name: string;
  description: string | null;
  unitPrice: string | number;
  active: boolean;
}

export interface OrderItem {
  id?: string;
  productId: string;
  quantity: number;
  unitPrice: string | number;
  product?: { id: string; name: string };
}

export interface Order {
  id: string;
  customerUserId: string;
  vendorUserId: string;
  status: 'PENDING' | 'CONFIRMED';
  notes: string | null;
  estimatedDeliveryDate: string | null;
  createdAt: string;
  items: OrderItem[];
}

export interface OrderNotification {
  id: string;
  orderId: string;
  body: string;
  createdAt: string;
}

function list<T>(rows: T[] | null): T[] {
  return Array.isArray(rows) ? rows : [];
}

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private api = inject(ApiClient);

  async listVendors(): Promise<VendorOption[]> {
    return list(await this.api.get<VendorOption[] | null>('orders/vendors'));
  }

  async catalog(vendorId: string): Promise<Product[]> {
    return list(await this.api.get<Product[] | null>('orders/catalog', { params: { vendorId } }));
  }

  async myProducts(): Promise<Product[]> {
    return list(await this.api.get<Product[] | null>('orders/products'));
  }

  createProduct(input: { name: string; description?: string; unitPrice: number }): Promise<Product> {
    return this.api.post<Product>('orders/products', input);
  }

  updateProduct(id: string, input: Partial<{ name: string; unitPrice: number; active: boolean }>): Promise<Product> {
    return this.api.patch<Product>(`orders/products/${encodeURIComponent(id)}`, input);
  }

  createOrder(vendorUserId: string, items: { productId: string; quantity: number }[], notes: string): Promise<Order> {
    return this.api.post<Order>('orders', { vendorUserId, items, notes });
  }

  async vendorQueue(): Promise<Order[]> {
    return list(await this.api.get<Order[] | null>('orders/vendor'));
  }

  async myOrders(): Promise<Order[]> {
    return list(await this.api.get<Order[] | null>('orders/mine'));
  }

  async notifications(): Promise<OrderNotification[]> {
    return list(await this.api.get<OrderNotification[] | null>('orders/notifications'));
  }

  confirm(id: string, estimatedDeliveryDate: string): Promise<Order> {
    return this.api.patch<Order>(`orders/${encodeURIComponent(id)}/confirm`, { estimatedDeliveryDate });
  }
}
