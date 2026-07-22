import { getPrisma } from '../config/database.js';
import { planForBand } from '../config/pricing.js';
import { currentMonth } from './quota.service.js';

/**
 * What an institution costs to serve, against what it pays.
 *
 * The platform already tracks provider spend, but only in total — which answers "is the API
 * bill going up" and not "is this school worth having". Those are different questions, and
 * only the second one prices anything.
 *
 * Cost is ATTRIBUTED, not measured per school. api_usage_day records tokens by model, with
 * no tenant on them, so a per-school figure would need every provider call tagged with the
 * caller. Rather than pretend, this multiplies each school's counted questions by the
 * measured average cost of a question — 3,213 input and 489 output tokens across four model
 * calls, taken from this deployment's own usage. That is an estimate and is labelled as one
 * everywhere it surfaces.
 */

/** USD per 1M tokens. Provider list prices — verify before quoting anyone. */
const RATES = {
  miniIn: 0.15,
  miniOut: 0.60,
  advancedIn: 2.50,
  advancedOut: 10.00,
  embedding: 0.02,
} as const;

/** Measured on this deployment: tokens consumed per answered question. */
const TOKENS_PER_QUESTION = { input: 3213, output: 489, embedding: 179 } as const;

/** LKR per USD. A rough conversion — the reported figures are indicative, not accounting. */
export const LKR_PER_USD = 300;

function costPerQuestionUsd(advanced: boolean): number {
  const inRate = advanced ? RATES.advancedIn : RATES.miniIn;
  const outRate = advanced ? RATES.advancedOut : RATES.miniOut;
  return (
    (TOKENS_PER_QUESTION.input * inRate) / 1e6 +
    (TOKENS_PER_QUESTION.output * outRate) / 1e6 +
    (TOKENS_PER_QUESTION.embedding * RATES.embedding) / 1e6
  );
}

/**
 * Share of questions assumed to reach the expensive model, for schools whose plan allows it.
 *
 * A guess, and the single biggest lever in this estimate: at 0% a question costs about LKR
 * 0.23, at 100% about LKR 3.88. It is exposed in the response so nobody mistakes the output
 * for a measurement.
 */
const ADVANCED_SHARE = 0.15;

export interface TenantEconomics {
  tenantId: string;
  name: string;
  month: string;
  studentCap: number | null;
  plan: string;
  allowAdvancedModel: boolean;
  questionsThisMonth: number;
  creditsUsedThisMonth: number;
  /** Annual fee implied by the assigned band. Null when no band is assigned. */
  annualPriceLkr: number | null;
  /** Estimated provider cost for this month's questions. */
  estimatedCostLkr: number;
  /** One twelfth of the annual fee, so both sides of the comparison cover a month. */
  monthlyRevenueLkr: number | null;
  /** Revenue minus cost for the month. Null when the school pays nothing yet. */
  monthlyMarginLkr: number | null;
  /** Cost as a share of revenue. Null when there is no revenue to divide by. */
  costShareOfRevenue: number | null;
}

export async function tenantEconomics(month = currentMonth()): Promise<{
  assumptions: { advancedShare: number; lkrPerUsd: number; tokensPerQuestion: typeof TOKENS_PER_QUESTION };
  tenants: TenantEconomics[];
}> {
  const tenants = await getPrisma().tenant.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, plan: true, studentCap: true, allowAdvancedModel: true,
      usageMonths: { where: { month }, select: { questions: true, creditsUsed: true } },
    },
  });

  return {
    assumptions: { advancedShare: ADVANCED_SHARE, lkrPerUsd: LKR_PER_USD, tokensPerQuestion: TOKENS_PER_QUESTION },
    tenants: tenants.map((t) => {
      const questions = t.usageMonths[0]?.questions ?? 0;
      const creditsUsed = t.usageMonths[0]?.creditsUsed ?? 0;

      // A school barred from the expensive model cannot incur its cost, whatever the
      // platform-wide mix happens to be.
      const perQuestionUsd = t.allowAdvancedModel
        ? (1 - ADVANCED_SHARE) * costPerQuestionUsd(false) + ADVANCED_SHARE * costPerQuestionUsd(true)
        : costPerQuestionUsd(false);

      const estimatedCostLkr = Math.round(questions * perQuestionUsd * LKR_PER_USD);
      const annualPriceLkr = t.studentCap ? planForBand(t.studentCap).pricePerYear : null;
      const monthlyRevenueLkr = annualPriceLkr === null ? null : Math.round(annualPriceLkr / 12);

      return {
        tenantId: t.id,
        name: t.name,
        month,
        studentCap: t.studentCap,
        plan: t.plan,
        allowAdvancedModel: t.allowAdvancedModel,
        questionsThisMonth: questions,
        creditsUsedThisMonth: creditsUsed,
        annualPriceLkr,
        estimatedCostLkr,
        monthlyRevenueLkr,
        monthlyMarginLkr: monthlyRevenueLkr === null ? null : monthlyRevenueLkr - estimatedCostLkr,
        costShareOfRevenue:
          monthlyRevenueLkr === null || monthlyRevenueLkr === 0
            ? null
            : Number((estimatedCostLkr / monthlyRevenueLkr).toFixed(4)),
      };
    }),
  };
}
