import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, User } from './auth.service';

/**
 * Functional route guard — redirects unauthenticated visitors to /login,
 * preserving the intended destination as `returnUrl` so the login component
 * can resume the navigation after a successful sign-in.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * Role-based route guard factory. Returns a CanActivateFn that:
 * - redirects unauthenticated visitors to /login (with returnUrl)
 * - redirects authenticated visitors whose role is not in `roles` to /dashboard
 */
export function roleGuard(...roles: User['role'][]): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }
    if (auth.hasRole(...roles)) return true;
    return router.createUrlTree(['/dashboard']);
  };
}
