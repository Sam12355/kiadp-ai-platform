import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface LanguageState {
  lang: 'en' | 'ar';
  setLanguage: (lang: 'en' | 'ar') => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      lang: 'en',
      setLanguage: (lang) => {
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = lang;
        set({ lang });
      },
    }),
    {
      name: 'khalifa-language-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
          document.documentElement.lang = state.lang;
        }
      },
    }
  )
);
