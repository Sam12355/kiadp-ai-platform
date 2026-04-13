// ================================================
// Auth Types
// ================================================

export enum UserRole {
  ADMIN = 'ADMIN',
  CLIENT = 'CLIENT',
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
