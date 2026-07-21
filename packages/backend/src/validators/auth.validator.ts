import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  fullName: z.string().min(2, 'Full name is required'),
  // Which institution the student is asking to join. Required: without it the account has
  // no tenant, and every admin list is tenant-scoped, so nobody would ever see the request.
  tenantId: z.string().uuid('Choose your institution'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;


/**
 * Trial signup. Note what is absent: role and tenantId. Both are decided by the server —
 * an unauthenticated caller must not be able to name the role it is given, since a super
 * admin here is only an ADMIN whose tenantId is null.
 */
export const trialSignupSchema = z.object({
  institutionName: z.string().trim().min(2, 'Institution name is required').max(120),
  fullName: z.string().trim().min(2, 'Your name is required').max(120),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});

export type TrialSignupInput = z.infer<typeof trialSignupSchema>;
