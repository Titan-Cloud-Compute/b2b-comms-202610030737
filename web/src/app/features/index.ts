import { Routes } from '@angular/router';
import { authGuard } from '../shared/auth.guards';

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
];
