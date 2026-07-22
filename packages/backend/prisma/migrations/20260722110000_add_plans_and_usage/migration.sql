-- Plan limits on the institution.
--
-- questions_per_month is nullable and defaults to NULL on purpose: NULL means "no limit".
-- Adding a column to live data must never begin enforcing a cap that nobody agreed to, so
-- every institution that exists today stays unmetered until a plan is assigned to it.
--
-- allow_advanced_model defaults TRUE for the same reason — behaviour is unchanged until the
-- lower bands explicitly turn it off.
ALTER TABLE "tenants" ADD COLUMN "student_cap" INTEGER;
ALTER TABLE "tenants" ADD COLUMN "questions_per_month" INTEGER;
ALTER TABLE "tenants" ADD COLUMN "question_credits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN "allow_advanced_model" BOOLEAN NOT NULL DEFAULT true;

-- One counter row per institution per month. Read on every question, so it is a counter
-- rather than an aggregate over a table that only grows.
CREATE TABLE "tenant_usage_month" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "questions" INTEGER NOT NULL DEFAULT 0,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_usage_month_pkey" PRIMARY KEY ("id")
);

-- The unique pair is what makes the per-question increment a single upsert with no read.
CREATE UNIQUE INDEX "tenant_usage_month_tenant_id_month_key" ON "tenant_usage_month"("tenant_id", "month");
CREATE INDEX "tenant_usage_month_tenant_id_idx" ON "tenant_usage_month"("tenant_id");

ALTER TABLE "tenant_usage_month" ADD CONSTRAINT "tenant_usage_month_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
