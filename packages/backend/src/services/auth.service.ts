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
      role: 'CLIENT',
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
  };
}
