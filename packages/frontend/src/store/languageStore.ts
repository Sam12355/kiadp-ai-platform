import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type SupportedLang = 'en' | 'ar' | 'si' | 'ta';

export const LANGUAGE_LABELS: Record<SupportedLang, string> = {
  en: 'English',
  ar: 'العربية',
  si: 'සිංහල',
  ta: 'தமிழ்',
};

const RTL_LANGS = new Set<SupportedLang>(['ar']);

interface LanguageState {
  lang: SupportedLang;
  setLanguage: (lang: SupportedLang) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      lang: 'en',
      setLanguage: (lang) => {
        document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
        document.documentElement.lang = lang;
        set({ lang });
      },
    }),
    {
      name: 'eduai-language-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.dir = RTL_LANGS.has(state.lang) ? 'rtl' : 'ltr';
          document.documentElement.lang = state.lang;
        }
      },
    }
  )
);
