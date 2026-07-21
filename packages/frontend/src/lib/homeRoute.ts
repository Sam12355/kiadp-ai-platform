import type { UserProfile } from '@khalifa/shared';

/**
 * Where a signed-in user belongs.
 *
 * There is no SUPER_ADMIN role — a platform owner is an ADMIN with no tenant, an
 * institution admin is an ADMIN with one. That rule decides routing in the landing page,
 * the login form and the trial signup, so it lives in one place: three copies of it is how
 * a new entry point ends up sending institution admins to the platform console.
 */
export function homeRouteFor(user: Pick<UserProfile, 'role' | 'tenantId'> | null | undefined): string {
  if (!user) return '/login';
  if (user.role === 'ADMIN') return user.tenantId ? '/school' : '/admin';
  return '/knowledge';
}

/** True when the user's institution is on a lapsed free trial. */
export function isTrialExpired(
  user: Pick<UserProfile, 'tenantPlan' | 'tenantTrialEndsAt'> | null | undefined,
): boolean {
  if (!user?.tenantPlan || user.tenantPlan !== 'trial' || !user.tenantTrialEndsAt) return false;
  return new Date(user.tenantTrialEndsAt).getTime() <= Date.now();
}

/** Whole days left in the trial, floored at 0. Null when no trial is running. */
export function trialDaysLeft(
  user: Pick<UserProfile, 'tenantPlan' | 'tenantTrialEndsAt'> | null | undefined,
): number | null {
  if (!user?.tenantPlan || user.tenantPlan !== 'trial' || !user.tenantTrialEndsAt) return null;
  const ms = new Date(user.tenantTrialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
