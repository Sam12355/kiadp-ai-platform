import { getPrisma } from '../config/database.js';
import { getLogger } from '../utils/logger.js';

/**
 * The monthly question allowance: reading it, checking it, and counting against it.
 *
 * Kept in one place because the same three numbers — used, included, remaining — are needed
 * by the guard that blocks a question, the screen that shows a school where it stands, and
 * the invoice that explains what was extra. Deriving them separately in three places is how
 * a customer ends up being told two different figures on the same day.
 */

/** Calendar month key, "YYYY-MM". */
export function currentMonth(at: Date = new Date()): string {
  // UTC, so the boundary is the same everywhere and a month never rolls twice or not at
  // all. For a Sri Lankan school that means the reset lands at 05:30 local on the 1st,
  // which is a fair trade for a key that cannot disagree with itself across servers.
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface QuotaStatus {
  /** Questions counted this month. */
  used: number;
  /** Questions the plan includes, or null when the institution is unmetered. */
  limit: number | null;
  /** Null when unmetered; never negative. */
  remaining: number | null;
  /** Pay-as-you-go balance. Not yet spent — that is a separate step. */
  credits: number;
  /** True when the allowance is spent and no credits remain. */
  exhausted: boolean;
  month: string;
}

/**
 * Where an institution stands this month.
 *
 * An institution with no `questionsPerMonth` is unmetered and always allowed. That is not
 * an oversight: every institution predates the plan columns, and a limit nobody agreed to
 * must not appear the moment the column does.
 */
export async function getQuotaStatus(tenantId: string | null | undefined): Promise<QuotaStatus> {
  const month = currentMonth();
  const empty: QuotaStatus = { used: 0, limit: null, remaining: null, credits: 0, exhausted: false, month };

  // No tenant is the platform owner, who is not on a plan.
  if (!tenantId) return empty;

  const prisma = getPrisma();
  const [tenant, usage] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { questionsPerMonth: true, questionCredits: true },
    }),
    prisma.tenantUsageMonth.findUnique({
      where: { tenantId_month: { tenantId, month } },
      select: { questions: true },
    }),
  ]);

  if (!tenant) return empty;

  const used = usage?.questions ?? 0;
  const limit = tenant.questionsPerMonth;
  const credits = tenant.questionCredits;

  if (limit === null) {
    return { used, limit: null, remaining: null, credits, exhausted: false, month };
  }

  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, credits, exhausted: remaining === 0 && credits <= 0, month };
}

/**
 * Count one answered question, spending a credit if the month's allowance is gone.
 *
 * The order is: included questions first, then pay-as-you-go credits. That is what makes
 * credits work as BOTH things they need to be — an overflow for a school that outgrew its
 * plan mid-term, and a standalone product for a school that wants no commitment at all.
 * The second needs no special case: an institution on credits alone is simply one whose
 * allowance is zero, so every question falls straight through to the credit branch.
 *
 * Called AFTER an answer is produced. A question that failed on a rate limit or a provider
 * outage is not something a school should be billed for, and a credit is real money.
 *
 * The increment happens first and the decision is read from its result, so two questions
 * arriving together cannot both believe they were the last one inside the allowance.
 */
export async function recordQuestion(tenantId: string | null | undefined): Promise<void> {
  if (!tenantId) return;
  const month = currentMonth();
  const prisma = getPrisma();

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { questionsPerMonth: true },
    });

    // Atomic, and it returns the post-increment count — which is what decides whether this
    // particular question was inside the allowance or over it.
    const usage = await prisma.tenantUsageMonth.upsert({
      where: { tenantId_month: { tenantId, month } },
      update: { questions: { increment: 1 } },
      create: { tenantId, month, questions: 1 },
      select: { questions: true },
    });

    const limit = tenant?.questionsPerMonth ?? null;
    if (limit === null || usage.questions <= limit) return; // inside the plan; nothing to spend

    // Over the allowance: this one costs a credit. updateMany with a positive-balance
    // condition rather than a plain decrement, so a race cannot drive the balance below
    // zero and hand out questions nobody paid for.
    const spent = await prisma.tenant.updateMany({
      where: { id: tenantId, questionCredits: { gt: 0 } },
      data: { questionCredits: { decrement: 1 } },
    });

    if (spent.count > 0) {
      await prisma.tenantUsageMonth.update({
        where: { tenantId_month: { tenantId, month } },
        // Tracked apart from `questions` so an invoice can show what was included and what
        // was bought — the first thing asked when a bill is queried.
        data: { creditsUsed: { increment: 1 } },
      });
    } else {
      // The guard should have refused this before it reached a model. Reaching here means
      // it slipped through the soft edge of the limit, so it is logged rather than hidden.
      getLogger().warn({ tenantId, month, used: usage.questions, limit }, 'question served with no allowance or credit left');
    }
  } catch (err) {
    // Never fail a delivered answer over bookkeeping. The student has been helped; a lost
    // tick is the smaller harm, and it is logged so it is not silent.
    getLogger().warn({ err: (err as Error)?.message, tenantId, month }, 'failed to record question usage');
  }
}

/**
 * Whether this institution's plan pays for the expensive model.
 *
 * This is the single largest cost decision the platform makes. Measured on this
 * deployment, one question costs about LKR 0.23 answered by gpt-4o-mini and LKR 3.88
 * answered by gpt-4o — a 17x difference that swamps every other variable, including how
 * many students a school has.
 *
 * Defaults to allowed when there is no tenant (the platform owner) or the row is missing,
 * so a lookup failure degrades to the better answer rather than quietly downgrading a
 * school that paid for it. The wrong-but-cheap failure would be far harder to notice.
 */
export async function allowsAdvancedModel(tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return true;
  try {
    const tenant = await getPrisma().tenant.findUnique({
      where: { id: tenantId },
      select: { allowAdvancedModel: true },
    });
    return tenant?.allowAdvancedModel ?? true;
  } catch (err) {
    getLogger().warn({ err: (err as Error)?.message, tenantId }, 'model policy lookup failed; allowing advanced model');
    return true;
  }
}
