import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import apiClient from '../api/client';
import type { LoginResponse } from '@khalifa/shared';
import { useLanguageStore } from '../store/languageStore';
import { translations } from '../i18n/translations';

export default function Login() {
  const { lang, setLanguage } = useLanguageStore();
  const t = translations[lang];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  // If already authenticated, redirect to the appropriate page
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.role === 'ADMIN' ? '/admin' : '/knowledge', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Apply language directionality
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiClient.post<{ success: boolean; data: LoginResponse }>('/auth/login', {
        email,
        password,
      });

      const { user, tokens } = response.data.data;
      setAuth(user, tokens);

      if (user.role === 'ADMIN') {
        navigate('/admin');
      } else {
        navigate('/knowledge');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t.invalidCredentials);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[var(--color-surface)]">
      {/* Language Picker */}
      <div className="absolute top-8 ltr:right-8 rtl:left-8 z-50 flex items-center bg-white/5 p-1 rounded-xl border border-white/5 backdrop-blur-xl">
        <button 
          onClick={() => setLanguage('en')}
          className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${lang === 'en' ? 'text-emerald-400 bg-white/10 shadow-lg shadow-emerald-500/10' : 'text-gray-500 hover:text-white'}`}
        >
          EN
        </button>
        <button 
          onClick={() => setLanguage('ar')}
          className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${lang === 'ar' ? 'text-emerald-500 bg-white/10 shadow-lg shadow-emerald-500/10' : 'text-gray-500 hover:text-white'}`}
        >
          AR
        </button>
      </div>

      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 z-0 opacity-40 mix-blend-screen pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[var(--color-palm-800)]/30 blur-[120px] animate-pulse-glow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[var(--color-earth-800)]/20 blur-[150px]" />
      </div>

      <div className="w-full max-w-md relative z-10 px-4 animate-fade-in">
        <div className="glass rounded-2xl p-8 shadow-[var(--shadow-elevated)] border-t border-[rgba(255,255,255,0.1)]">
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--color-palm-500)] to-[var(--color-palm-700)] shadow-[var(--shadow-glow-green)] mx-auto mb-6 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <h1 className="tracking-tight whitespace-nowrap app-logo uppercase mb-2" style={{ fontSize: '2.8rem' }}>
              <span className="kiadp-text">KIADP</span> <span className="ai-highlight">AI</span>
            </h1>
            <p className="text-[var(--color-text-secondary)] mt-2 text-sm">{t.loginSubtitle}</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm animate-slide-in font-bold">
                {error}
              </div>
            )}
            
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">{t.emailAddress}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-black/20 border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:outline-none focus:border-[var(--color-palm-500)] focus:ring-1 focus:ring-[var(--color-palm-500)] transition-all placeholder:text-white/20"
                placeholder="admin@khalifa.ae"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">{t.password}</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-black/20 border border-[rgba(255,255,255,0.1)] rounded-lg text-white focus:outline-none focus:border-[var(--color-palm-500)] focus:ring-1 focus:ring-[var(--color-palm-500)] transition-all placeholder:text-white/20"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-[var(--color-palm-600)] to-[var(--color-palm-500)] hover:from-[var(--color-palm-500)] hover:to-[var(--color-palm-400)] text-white rounded-lg font-semibold shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-palm-500)] focus:ring-offset-2 focus:ring-offset-[var(--color-surface)] transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
            >
              <span className="relative z-10 flex items-center justify-center uppercase tracking-widest text-xs font-black">
                {loading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : null}
                {loading ? t.signingIn : t.signIn}
              </span>
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-[rgba(255,255,255,0.05)] text-center">
            <p className="text-[var(--color-text-muted)] text-[10px] font-bold">
              {t.loginFooter}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
