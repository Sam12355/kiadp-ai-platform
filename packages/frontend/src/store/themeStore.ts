import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

/**
 * Applying the theme is a single attribute on <html>; every colour in the app resolves
 * from the token blocks in globals.css keyed off it. Light is the absence of the
 * attribute, so the default costs nothing and a missing/failed rehydrate lands on light
 * rather than on an unstyled page.
 */
function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      // Light by default: this is a product used in classrooms and offices, in daylight,
      // and frequently projected. Dark is a preference, not the baseline.
      theme: 'light',
      setTheme: (theme) => {
        apply(theme);
        set({ theme });
      },
      toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
    }),
    {
      name: 'eduai-theme-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        // Rehydration runs after first paint. index.html applies the stored theme inline
        // before React mounts, so this only reconciles — it is not what prevents a flash.
        if (state) apply(state.theme);
      },
    },
  ),
);
