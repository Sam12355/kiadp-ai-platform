import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError, PaymentRequiredError, QuotaExceededError } from '../utils/errors.js';
import type { UserRole } from '@khalifa/shared';
import { getPrisma } from '../config/database.js';
import { getLogger } from '../utils/logger.js';
import { isTrialExpired } from '../services/auth.service.js';
import { getQuotaStatus } from './../services/quota.service.js';

// ── Tenant scoping ──
//
// There is no SUPER_ADMIN role. A "super admin" is an ADMIN whose tenantId is
// null; an "institution admin" is an ADMIN attached to a tenant. That convention
// is load-bearing, so it is resolved in exactly one place here rather than being
// re-derived at each call site.
//
// The tenantId is not carried in the JWT, so it costs one lookup per request.
// resolveTenantContext caches the result on the request, and every guard below
// reuses it rather than querying again.

declare global {
  namespace Express {
    interface Request {
      /** Caller's tenant. null for a super admin (platform-wide access). */
      callerTenantId?: string | null;
      /** True when the caller is an ADMIN with no tenant, i.e. the platform owner. */
      isSuperAdmin?: boolean;
      /** Set when a super admin is viewing the product as one institution. */
      impersonatedTenantId?: string;
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Header a super admin sends to view the product as one institution.
 *
 * Deliberately a per-request header rather than a second token. A token would have to be
 * minted, stored and expired, and while it existed it would be a credential that looks
 * like an institution admin — if it leaked, nothing in it would say otherwise. A header is
 * a scope request: the JWT still identifies the real person on every request, this
 * middleware re-checks their authority every time, and closing the tab ends it.
 */
const IMPERSONATE_HEADER = 'x-impersonate-tenant';

/**
 * Resolves the caller's tenant once and caches it on the request.
 * Must run AFTER authenticate. Every guard below depends on it.
 */
export async function resolveTenantContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  if (req.callerTenantId !== undefined) {
    next();
    return;
  }

  try {
    const user = await getPrisma().user.findUnique({
      where: { id: req.user.userId },
      select: { tenantId: true, role: true },
    });

    if (!user) {
      next(new UnauthorizedError('Authenticated user no longer exists'));
      return;
    }

    req.callerTenantId = user.tenantId;
    req.isSuperAdmin = user.role === 'ADMIN' && user.tenantId === null;

    // ── Impersonation ────────────────────────────────────────────────────────
    // A super admin asking to see the product as one institution. Two properties matter:
    //
    //  1. It can only ever NARROW access. The caller drops to that tenant's scope and
    //     loses isSuperAdmin, so every guard downstream treats them as an institution
    //     admin. There is no path here that widens anyone's reach.
    //  2. Authority is re-checked per request from the database, not taken from the
    //     header. A non-super-admin sending this header is refused, not ignored — a
    //     school admin trying to read another school is an attack, and it should surface
    //     as a 403 in the logs rather than silently succeeding as a no-op.
    const requested = req.header(IMPERSONATE_HEADER);
    if (requested) {
      if (!req.isSuperAdmin) {
        getLogger().warn(
          { userId: req.user.userId, callerTenantId: user.tenantId, requestedTenantId: requested, path: req.originalUrl },
          'rejected impersonation attempt by non-super-admin',
        );
        next(new ForbiddenError('Not permitted to view other institutions'));
        return;
      }
      if (!UUID_RE.test(requested)) {
        next(new ForbiddenError('Invalid institution'));
        return;
      }
      const target = await getPrisma().tenant.findUnique({ where: { id: requested }, select: { id: true } });
      if (!target) {
        next(new ForbiddenError('Institution not found'));
        return;
      }
      req.callerTenantId = target.id;
      req.isSuperAdmin = false;
      req.impersonatedTenantId = target.id;
      // Every impersonated request is logged with both identities. Support access to a
      // customer's data should never be silent, and this is the record of who saw what.
      getLogger().info(
        { superAdminId: req.user.userId, viewingTenantId: target.id, method: req.method, path: req.originalUrl },
        'super admin viewing institution',
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Guards a route whose URL parameter IS a tenant id (e.g. /tenants/:id).
 *
 * Deliberately takes an explicit parameter name: the previous implementation fell
 * back to `req.params.id` on any route, which on /documents/:id compared a document
 * id against a tenant id and denied everything. A guard is only mounted where the
 * parameter genuinely identifies a tenant.
 *
 * Also rejects non-UUID values, so callers cannot reach handlers that interpolate
 * the parameter into SQL.
 */
export function requireTenantParam(paramName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Express can surface a repeated path parameter as an array; anything that is not a
    // single string is rejected rather than coerced, so `?id=a&id=b` cannot slip through.
    const raw = req.params[paramName];
    const target = typeof raw === 'string' ? raw : undefined;

    if (!target || !UUID_RE.test(target)) {
      next(new ForbiddenError('Invalid institution identifier'));
      return;
    }

    // Super admin reaches every institution.
    if (req.isSuperAdmin) {
      next();
      return;
    }

    if (target !== req.callerTenantId) {
      next(new ForbiddenError('Access denied: resource belongs to a different institution'));
      return;
    }

    next();
  };
}

/** Restricts a route to the platform owner (ADMIN with no tenant). */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.isSuperAdmin) {
    next(new ForbiddenError('This action is restricted to platform administrators'));
    return;
  }
  next();
}

/**
 * Returns the tenant filter a list query should apply for this caller:
 * `{}` for a super admin (everything), `{ tenantId }` for an institution admin.
 *
 * Guards protect inbound identifiers; they do nothing for endpoints that leak rows
 * in the response. List handlers must spread this into their `where` clause.
 */
export function tenantScope(req: Request): { tenantId?: string } {
  return req.isSuperAdmin ? {} : { tenantId: req.callerTenantId ?? undefined };
}

/**
 * Blocks an institution whose free trial has run out.
 *
 * Mounted on the endpoints that cost money or grow the account — asking questions,
 * uploading documents, adding users — and deliberately NOT on the reads the expired
 * screen itself needs. Locking those too would leave the app unable to explain why it
 * had locked.
 *
 * Answers 402 Payment Required. It is the one status that says "your access is a billing
 * matter", which lets the client tell an expired trial apart from a permissions problem
 * without parsing the message.
 *
 * Must run AFTER resolveTenantContext. Reads the tenant fresh rather than trusting the
 * JWT: the token is issued for days, so a trial that lapses mid-session would otherwise
 * keep working until the user happened to log out.
 */
export async function requireLiveTenant(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // No tenant means the platform owner, who has no trial to expire.
  if (!req.callerTenantId) {
    next();
    return;
  }

  try {
    const tenant = await getPrisma().tenant.findUnique({
      where: { id: req.callerTenantId },
      select: { plan: true, trialEndsAt: true },
    });

    if (isTrialExpired(tenant)) {
      next(new PaymentRequiredError('Your free trial has ended. Contact us to continue using the platform.'));
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
}


/**
 * Blocks a question once the institution's monthly allowance is spent.
 *
 * Mounted after requireLiveTenant, so an expired trial is reported as an expired trial
 * rather than as a quota problem — the two need different things from the customer.
 *
 * Reads only; the counter is advanced after an answer is actually produced. A school is
 * not billed for a question the platform failed to answer.
 */
export async function requireQuota(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const status = await getQuotaStatus(req.callerTenantId);
    if (status.exhausted) {
      getLogger().info(
        { tenantId: req.callerTenantId, used: status.used, limit: status.limit, month: status.month },
        'question refused: monthly allowance spent',
      );
      next(new QuotaExceededError(
        `This institution has used all ${status.limit} questions included this month. ` +
        'Add credits or move to a larger plan to continue.',
      ));
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
