// ================================================
// API Response Types
// ================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DashboardStats {
  totalDocuments: number;
  completedDocuments: number;
  failedDocuments: number;
  processingDocuments: number;
  totalChunks: number;
  totalQuestions: number;
  totalUsers: number;
  recentQuestions: number; // last 24h
}
