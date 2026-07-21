import { useEffect } from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { TrialExpiredScreen, useTrialLock } from '../../components/TrialState';
import BubblesBackground from '../../components/BubblesBackground';
import { User, LogOut } from 'lucide-react';

import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';

export default function ClientLayout() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { lang, setLanguage } = useLanguageStore();
  const t = translations[lang];
  const navigate = useNavigate();
  const locked = useTrialLock();

  // Apply language directionality
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, user, navigate]);

  if (!isAuthenticated) return null;

  // A student whose institution's trial has lapsed sees the same notice as their admin.
  // Their questions are the running cost, so leaving them able to ask would mean the
  // trial never actually ends.
  if (locked) return <TrialExpiredScreen />;

  return (
    <div className="min-h-screen bg-transparent text-ink flex flex-col relative overflow-hidden">
      <BubblesBackground variant="white" />

      <main className="flex-1 overflow-y-auto z-10">
        <Outlet />
      </main>
    </div>
  );
}
