/**
 * The commercial ladder: what an institution of a given size pays, gets, and may use.
 *
 * One module, because these numbers appear in at least four places — the admin screen that
 * assigns a plan, the quota guard, the model router, and eventually a public pricing page.
 * Four copies of a price list is four chances to quote a school one figure and bill another.
 *
 * ── How the price is built ────────────────────────────────────────────────────────────
 * Marginal bands, like income tax: the first 100 students cost one rate, the next 200 a
 * lower one, and so on. The obvious alternative — a flat per-student rate that steps down
 * at thresholds — is wrong, and not subtly: at 600 students × 450 you get 270,000, but at
 * 650 × 380 you get 247,000. The larger school pays less. Charging each band separately
 * cannot produce that, because the total only ever moves in one direction.
 *
 * ── Where the numbers come from ───────────────────────────────────────────────────────
 * Measured on this deployment, not estimated: 3,213 input and 489 output tokens per
 * answered question across four model calls. At list prices that is about LKR 0.23 on
 * gpt-4o-mini and LKR 3.88 on gpt-4o — a 17x spread that dominates everything else. The
 * rates below hold API cost near 12-19% of revenue with some gpt-4o in the mix, and near
 * 5% without it.
 *
 * Verify the provider's prices and your own exchange rate before quoting. Both move, and
 * this file is where they are assumed.
 */

/** Questions per student per month, the assumption the allowances rest on. */
export const QUESTIONS_PER_STUDENT_MONTH = 8;

/** Smallest and largest rungs. Anything bigger is a conversation, not a self-serve plan. */
export const MIN_BAND = 50;
export const MAX_BAND = 1000;
export const BAND_STEP = 50;

/**
 * Marginal price bands, LKR per student per year, applied cumulatively.
 * `upTo` is inclusive; the final band is open-ended.
 */
const PRICE_BANDS: { upTo: number; ratePerStudent: number }[] = [
  { upTo: 100, ratePerStudent: 600 },
  { upTo: 300, ratePerStudent: 480 },
  { upTo: 600, ratePerStudent: 400 },
  { upTo: Number.MAX_SAFE_INTEGER, ratePerStudent: 320 },
];

/**
 * Above this size a plan includes the expensive model for questions that warrant it.
 *
 * This is a commercial dial, not a technical limit. It exists because the model choice IS
 * the cost: capping smaller plans to the cheap model is what keeps their margin safe while
 * still letting them be priced for a small school's budget.
 */
export const ADVANCED_MODEL_FROM_STUDENTS = 300;

export interface PlanBand {
  students: number;
  /** Annual price in LKR. */
  pricePerYear: number;
  /** Effective LKR per student per year — the number a bursar will actually compare. */
  pricePerStudent: number;
  questionsPerMonth: number;
  allowAdvancedModel: boolean;
}

/** Round to the nearest thousand rupees. A quote with a 7 on the end looks computed, not set. */
function roundPrice(value: number): number {
  return Math.round(value / 1000) * 1000;
}

/** Annual price for an exact headcount, before rounding to a band. */
export function priceForStudents(students: number): number {
  let total = 0;
  let counted = 0;
  for (const band of PRICE_BANDS) {
    const inThisBand = Math.max(0, Math.min(students, band.upTo) - counted);
    total += inThisBand * band.ratePerStudent;
    counted = band.upTo;
    if (students <= band.upTo) break;
  }
  return roundPrice(total);
}

/**
 * The rung a given headcount falls on: the next band at or above it.
 *
 * Rounds UP, so a school of 210 buys the 250 band. Rounding down would sell them an
 * allowance their roll cannot fit inside, and the first thing they would meet is a wall.
 */
export function bandForStudents(students: number): number {
  if (students <= MIN_BAND) return MIN_BAND;
  if (students >= MAX_BAND) return MAX_BAND;
  return Math.ceil(students / BAND_STEP) * BAND_STEP;
}

export function planForBand(students: number): PlanBand {
  const band = bandForStudents(students);
  const pricePerYear = priceForStudents(band);
  return {
    students: band,
    pricePerYear,
    pricePerStudent: Math.round(pricePerYear / band),
    questionsPerMonth: band * QUESTIONS_PER_STUDENT_MONTH,
    allowAdvancedModel: band >= ADVANCED_MODEL_FROM_STUDENTS,
  };
}

/** Every rung, for a pricing page or an admin dropdown. */
export function allBands(): PlanBand[] {
  const out: PlanBand[] = [];
  for (let s = MIN_BAND; s <= MAX_BAND; s += BAND_STEP) out.push(planForBand(s));
  return out;
}

/**
 * Pay-as-you-go packs, for a school that will not commit to a year or that has run
 * through its allowance mid-term.
 *
 * Priced ABOVE the per-question rate of every plan — roughly LKR 11-15 against LKR 4-6.
 * That ordering is the point: if buying credits were cheaper per question than a plan,
 * nobody would take a plan, and the recurring revenue this business needs would never
 * form. Credits are a convenience, not a discount.
 */
export interface CreditPack {
  questions: number;
  priceLkr: number;
  /** LKR per question, for display. */
  pricePerQuestion: number;
}

export const CREDIT_PACKS: CreditPack[] = [
  { questions: 200, priceLkr: 3000, pricePerQuestion: 15 },
  { questions: 1000, priceLkr: 13000, pricePerQuestion: 13 },
  { questions: 5000, priceLkr: 55000, pricePerQuestion: 11 },
];
