import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getPrisma } from '../config/database.js';
import { getEnv } from '../config/env.js';
import { UnauthorizedError, ConflictError, NotFoundError } from '../utils/errors.js';
import type { RegisterInput, LoginInput } from '../validators/auth.validator.js';
import type { UserProfile, AuthTokens } from '@khalifa/shared';

// ── Helpers ──

function generateTokens(userId: string, email: string, role: string): AuthTokens {
  const env = getEnv();
  
  // Access token (JWT)
  const accessToken = jwt.sign(
    { userId, email, role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRY as any }
  );

  // Refresh token (Opaque random string)
  const refreshToken = crypto.randomBytes(40).toString('hex');

  return { accessToken, refreshToken };
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Service Methods ──

export async function registerUser(input: RegisterInput): Promise<{ pending: true; message: string }> {
  const prisma = getPrisma();
  
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    throw new ConflictError('User with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  await prisma.user.create({
    data: {
      email: input.email,
      fullName: input.fullName,
      passwordHash,
      role: 'STUDENT',
      isActive: false,
      isPendingApproval: true,
    },
  });

  return {
    pending: true,
    message: 'Your registration has been submitted. An administrator will review and approve your account.',
  };
}

export async function loginUser(input: LoginInput): Promise<{ user: UserProfile; tokens: AuthTokens }> {
  const prisma = getPrisma();
  
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { tenant: { select: { name: true, logoUrl: true, plan: true, trialEndsAt: true } } },
  });

  if (!user) {
    throw new UnauthorizedError('Invalid credentials or account disabled');
  }

  if (user.isPendingApproval) {
    throw new UnauthorizedError('Your account is pending admin approval. Please wait for an administrator to activate your account.');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Invalid credentials or account disabled');
  }

  const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
  if (!isValidPassword) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const tokens = generateTokens(user.id, user.email, user.role);
  
  const env = getEnv();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(tokens.refreshToken),
      expiresAt,
    },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: user.role as unknown as UserProfile['role'],
      isActive: user.isActive,
      isPendingApproval: user.isPendingApproval,
      createdAt: user.createdAt.toISOString(),
      tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null,
      tenantLogoUrl: user.tenant?.logoUrl ?? null,
      tenantPlan: user.tenant?.plan ?? null,
      tenantTrialEndsAt: user.tenant?.trialEndsAt?.toISOString() ?? null,
    },
    tokens,
  };
}

export async function refreshAccessToken(refreshTokenStr: string): Promise<AuthTokens> {
  const prisma = getPrisma();
  const tokenHash = hashRefreshToken(refreshTokenStr);

  const refreshTokenRecord = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!refreshTokenRecord || refreshTokenRecord.isRevoked || refreshTokenRecord.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = refreshTokenRecord.user;
  if (!user.isActive) {
    throw new UnauthorizedError('Account disabled');
  }

  // Revoke old token
  await prisma.refreshToken.update({
    where: { id: refreshTokenRecord.id },
    data: { isRevoked: true },
  });

  // Generate new tokens
  const tokens = generateTokens(user.id, user.email, user.role);
  
  const env = getEnv();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(tokens.refreshToken),
      expiresAt,
    },
  });

  return tokens;
}

export async function logoutUser(userId: string): Promise<void> {
  const prisma = getPrisma();
  
  // Revoke all refresh tokens for the user to force them out everywhere
  await prisma.refreshToken.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true },
  });
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const prisma = getPrisma();
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: { select: { name: true, logoUrl: true, plan: true, trialEndsAt: true } } },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    role: user.role as unknown as UserProfile['role'],
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    tenantId: user.tenantId,
    tenantName: user.tenant?.name ?? null,
    tenantLogoUrl: user.tenant?.logoUrl ?? null,
    // /auth/me is what the app re-reads on every reload, so the trial state has to travel
    // with it — otherwise an expired institution would look live again after a refresh.
    tenantPlan: user.tenant?.plan ?? null,
    tenantTrialEndsAt: user.tenant?.trialEndsAt?.toISOString() ?? null,
  };
}

/** How long a self-serve trial runs. */
export const TRIAL_DAYS = 7;

/**
 * True when an institution's free trial has run out.
 *
 * Kept as one exported predicate because the answer is needed in three places — the
 * request guard, the auth payload and the admin views — and three copies of a date
 * comparison is how they end up disagreeing about who is locked out.
 */
export function isTrialExpired(tenant: { plan: string; trialEndsAt: Date | null } | null | undefined): boolean {
  if (!tenant || tenant.plan !== 'trial' || !tenant.trialEndsAt) return false;
  return tenant.trialEndsAt.getTime() <= Date.now();
}

/** URL-safe, collision-free slug for a new institution. */
async function uniqueSlug(name: string): Promise<string> {
  const prisma = getPrisma();
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'institution';

  // Sequential suffix rather than a random one: two schools called "St Mary's" should read
  // st-marys and st-marys-2, not st-marys-f3a9.
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await prisma.tenant.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * Self-serve trial signup: creates an institution and the admin who owns it.
 *
 * This is the only unauthenticated endpoint that creates a tenant, so what it must NOT do
 * matters as much as what it does. The role is hardcoded to ADMIN-with-a-tenant — an
 * institution admin — and never read from the request; accepting a role here would let
 * anyone mint a platform owner, since a super admin is just an ADMIN whose tenantId is
 * null. The plan is likewise fixed to 'trial'.
 *
 * Tenant and user are created in one transaction. A tenant with no admin is unreachable
 * and a user with no tenant would land in the panel with nothing to manage, so a partial
 * failure must leave neither behind.
 */
export async function startTrial(input: {
  institutionName: string;
  fullName: string;
  email: string;
  password: string;
}): Promise<{ user: UserProfile; tokens: AuthTokens }> {
  const prisma = getPrisma();
  const email = input.email.trim().toLowerCase();

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const slug = await uniqueSlug(input.institutionName);

  const user = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: input.institutionName.trim(), slug, plan: 'trial', trialEndsAt },
    });
    return tx.user.create({
      data: {
        email,
        fullName: input.fullName.trim(),
        passwordHash,
        role: 'ADMIN',
        isActive: true,
        isPendingApproval: false,
        tenantId: tenant.id,
      },
      include: { tenant: true },
    });
  });

  const tokens = generateTokens(user.id, user.email, user.role);
  const env = getEnv();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_EXPIRY_DAYS);
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hashRefreshToken(tokens.refreshToken), expiresAt },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: user.role as unknown as UserProfile['role'],
      isActive: user.isActive,
      isPendingApproval: user.isPendingApproval,
      createdAt: user.createdAt.toISOString(),
      tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null,
      tenantLogoUrl: user.tenant?.logoUrl ?? null,
      tenantPlan: user.tenant?.plan ?? null,
      tenantTrialEndsAt: user.tenant?.trialEndsAt?.toISOString() ?? null,
    },
    tokens,
  };
}
