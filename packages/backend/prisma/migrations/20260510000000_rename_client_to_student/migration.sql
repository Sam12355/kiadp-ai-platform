-- Rename enum value CLIENT → STUDENT in UserRole
ALTER TYPE "UserRole" RENAME VALUE 'CLIENT' TO 'STUDENT';

-- Update the column default
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'STUDENT';
