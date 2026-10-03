import { Routes } from '@angular/router';
import { authGuard, roleGuard } from '../shared/auth.guards';

/**
 * Feature route registry.
 *
 * Each story appends its Angular routes to this array.
 * app.routes.ts spreads FEATURE_ROUTES before the wildcard catch-all so new
 * feature routes are picked up automatically.
 */
export const FEATURE_ROUTES: Routes = [
  // Story: vendor-onboarding — company profile + compliance document library.
  {
    path: 'vendor',
    loadComponent: () => import('../shared/layout.component').then(m => m.LayoutComponent),
    data: { rendersSupportFooterInLayout: true },
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./vendor-onboarding/vendor-dashboard.component').then(m => m.VendorDashboardComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./vendor-onboarding/vendor-profile.component').then(m => m.VendorProfileComponent),
      },
    ],
  },
  // Story: shared-channel — vendor/customer shared channels with live messages.
  {
    path: 'channels',
    loadComponent: () => import('../shared/layout.component').then(m => m.LayoutComponent),
    data: { rendersSupportFooterInLayout: true },
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./shared-channel/channels.component').then(m => m.ChannelsComponent),
      },
    ],
  },
  // Story: order-management — customer catalog + purchase orders, vendor queue with confirm/ETA.
  {
    path: 'orders',
    loadComponent: () => import('../shared/layout.component').then(m => m.LayoutComponent),
    data: { rendersSupportFooterInLayout: true },
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./order-management/orders.component').then(m => m.OrdersComponent),
      },
    ],
  },
  // Story: invoice-generation — vendor issues invoices for confirmed orders, customer downloads PDFs.
  {
    path: 'invoices',
    loadComponent: () => import('../shared/layout.component').then(m => m.LayoutComponent),
    data: { rendersSupportFooterInLayout: true },
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./invoice-generation/invoices.component').then(m => m.InvoicesComponent),
      },
    ],
  },
  // Story: notification-preferences — order/message alert toggles + preference-filtered alert feed.
  {
    path: 'notifications',
    loadComponent: () => import('../shared/layout.component').then(m => m.LayoutComponent),
    data: { rendersSupportFooterInLayout: true },
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./notification-preferences/notifications.component').then(m => m.NotificationsComponent),
      },
    ],
  },
  // Story: customer-invite — admin invites a customer by email (activation link).
  {
    path: 'customer-invites',
    loadComponent: () => import('../shared/layout.component').then(m => m.LayoutComponent),
    data: { rendersSupportFooterInLayout: true },
    canActivate: [authGuard, roleGuard('ADMIN')],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./customer-invite/customer-invite.component').then(m => m.CustomerInviteComponent),
      },
    ],
  },
  // Story: customer-invite — public activation page reached from the invitation email.
  {
    path: 'activate-invite',
    loadComponent: () =>
      import('./customer-invite/activate-invite.component').then(m => m.ActivateInviteComponent),
    data: { hideSupportFooter: true },
  },
];
