import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserProfile, AuthTokens } from '@khalifa/shared';

interface AuthState {
  user: UserProfile | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  /**
   * Set when the server answers 402, or when the trial clock runs out while the app is
   * open. Deliberately NOT persisted: it is a live fact about the account, and a stale
   * `true` in localStorage would lock out an institution that has since been reactivated.
   */
  trialLocked: boolean;
  setTrialLocked: (locked: boolean) => void;
  setAuth: (user: UserProfile, tokens: AuthTokens) => void;
  updateTokens: (tokens: AuthTokens) => void;
  setUser: (user: UserProfile) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      trialLocked: false,
      setTrialLocked: (trialLocked) => set({ trialLocked }),

      setAuth: (user, tokens) => {
        localStorage.setItem('accessToken', tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);
        set({ user, tokens, isAuthenticated: true, trialLocked: false });
      },

      updateTokens: (tokens) => {
        localStorage.setItem('accessToken', tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);
        set({ tokens });
      },

      setUser: (user) => {
        set({ user });
      },

      logout: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({ user: null, tokens: null, isAuthenticated: false });
      },
    }),
    {
      name: 'eduai-auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
