-- Self-serve trial signups need an expiry; institutions created by a platform admin do not.
-- Defaulting to 'paid' means every tenant that already exists is unaffected by the trial
-- lockout, which is the safe direction for a column added to live data.
ALTER TABLE "tenants" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'paid';
ALTER TABLE "tenants" ADD COLUMN "trial_ends_at" TIMESTAMP(3);

-- Expiry is checked on nearly every tenant-scoped request.
CREATE INDEX "tenants_plan_trial_ends_at_idx" ON "tenants"("plan", "trial_ends_at");
