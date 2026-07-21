// ================================================
// Auth Types
// ================================================

export enum UserRole {
  ADMIN = 'ADMIN',
  STUDENT = 'STUDENT',
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  role: UserRole;
  isActive: boolean;
  isPendingApproval?: boolean;
  createdAt: string;
  tenantId?: string | null;
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
  /// 'trial' until someone pays. Absent for users with no institution.
  tenantPlan?: string | null;
  /// ISO date the free trial lapses; null when there is no trial running.
  tenantTrialEndsAt?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  user: UserProfile;
  tokens: AuthTokens;
}

export interface RegisterResponse {
  pending: true;
  message: string;
}

export interface RefreshRequest {
  refreshToken: string;
}
