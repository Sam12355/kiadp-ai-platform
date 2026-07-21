ALTER TABLE "documents" ADD COLUMN "course_id" TEXT;
CREATE INDEX "documents_course_id_idx" ON "documents"("course_id");
