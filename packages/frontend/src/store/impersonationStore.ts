import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * "View as institution" for the platform owner.
 *
 * Deliberately separate from authStore: this is not a second identity, it is a lens on the
 * one you already have. Keeping it out of the auth state means signing out cannot leave a
 * half-impersonated session behind, and nothing here is ever treated as a credential — the
 * server re-checks on every request that the real caller is a super admin, and refuses
 * otherwise. Losing this state fails safe: you simply see your own scope again.
 *
 * Persisted so a page refresh does not silently drop you back to platform-wide view while
 * the banner is off screen.
 */
interface ImpersonationState {
  tenantId: string | null;
  tenantName: string | null;
  start: (tenantId: string, tenantName: string) => void;
  stop: () => void;
}

export const useImpersonationStore = create<ImpersonationState>()(
  persist(
    (set) => ({
      tenantId: null,
      tenantName: null,
      start: (tenantId, tenantName) => set({ tenantId, tenantName }),
      stop: () => set({ tenantId: null, tenantName: null }),
    }),
    {
      name: 'eduai-impersonation',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
