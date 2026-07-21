import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { homeRouteFor } from '../lib/homeRoute';
import apiClient from '../api/client';
import type { LoginResponse } from '@khalifa/shared';
import { useLanguageStore } from '../store/languageStore';
import { translations } from '../i18n/translations';
import SearchableSelect from '../components/SearchableSelect';
import ThemeToggle from '../components/ThemeToggle';

interface PublicTenant {
  id: string;
  name: string;
  logoUrl?: string | null;
}

export default function Login() {
  const { lang, setLanguage } = useLanguageStore();
  const t = translations[lang];
  const [mode, setMode] = useState<'login' | 'register' | 'pending'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tenants, setTenants] = useState<PublicTenant[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  // null means "no failure". An empty string means the request failed without a usable
  // message, so the translated fallback is chosen at render time rather than baked in here —
  // this effect does not re-run when the language changes.
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  const [tenantsReload, setTenantsReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'ADMIN') {
        navigate(homeRouteFor(user), { replace: true });
      } else {
        navigate('/knowledge', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // The institution list is only needed on the register path, so it is fetched when the
  // user switches to it rather than on mount — most visitors only ever sign in.
  useEffect(() => {
    if (mode !== 'register') return;

    let cancelled = false;
    setTenantsLoading(true);
    setTenantsError(null);

    apiClient
      .get<{ success: boolean; data: PublicTenant[] }>('/tenants/public')
      .then(({ data }) => {
        if (!cancelled) setTenants(data.data);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setTenantsError(err.response?.data?.error?.message || '');
        }
      })
      .finally(() => {
        if (!cancelled) setTenantsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, tenantsReload]);

  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    setError('');
    setEmail('');
    setPassword('');
    setFullName('');
    setTenantId('');
  };

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
        navigate(homeRouteFor(user));
      } else {
        navigate('/knowledge');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t.invalidCredentials);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!tenantId) {
      setError(t.selectInstitutionFirst);
      return;
    }

    setLoading(true);

    try {
      await apiClient.post('/auth/register', { email, password, fullName, tenantId });
      setMode('pending');
    } catch (err: any) {
      // A 422 carries per-field messages under error.details; surfacing the first one is
      // more use than the generic "Validation failed" that sits in error.message.
      const apiError = err.response?.data?.error;
      const details = apiError?.details as Record<string, string[]> | undefined;
      const firstDetail = details ? Object.values(details).flat()[0] : undefined;
      setError(firstDetail || apiError?.message || t.registerFailed);
    } finally {
      setLoading(false);
    }
  };

  const selectedTenant = tenants.find((tenant) => tenant.id === tenantId);
  const registerBlocked =
    mode === 'register' && (tenantsLoading || tenantsError !== null || tenants.length === 0);

  const tenantOptions = useMemo(
    () => tenants.map((tenant) => ({ value: tenant.id, label: tenant.name })),
    [tenants]
  );

  const inputClass =
    'w-full px-4 py-2.5 bg-raised border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-[var(--color-palm-500)] focus:ring-1 focus:ring-[var(--color-palm-500)] transition-all placeholder:text-ink-faint';
  const labelClass =
    'text-[10px] font-bold text-ink-mute uppercase tracking-wider';

  return (
    <div className="min-h-screen flex items-center justify-center relative bg-[var(--color-surface)] py-6">
      {/* Language picker + theme toggle */}
      <div className="absolute top-4 ltr:right-4 rtl:left-4 z-50 flex items-center gap-2">
        <div className="flex items-center bg-raised p-1 rounded-xl border border-line-soft">
          <button
            onClick={() => setLanguage('en')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${lang === 'en' ? 'text-emerald-700 dark:text-emerald-400 bg-overlay' : 'text-ink-mute hover:text-ink'}`}
          >
            EN
          </button>
          <button
            onClick={() => setLanguage('ar')}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${lang === 'ar' ? 'text-emerald-700 dark:text-emerald-400 bg-overlay' : 'text-ink-mute hover:text-ink'}`}
          >
            AR
          </button>
        </div>
        <div className="bg-raised p-0.5 rounded-xl border border-line-soft">
          <ThemeToggle />
        </div>
      </div>

      {/* Dynamic background elements — clipped here rather than on the page container, so a
          tall form still scrolls instead of being cut off. */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-40 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[var(--color-palm-800)]/30 blur-[120px] animate-pulse-glow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[var(--color-earth-800)]/20 blur-[150px]" />
      </div>

      <div className="w-full max-w-md relative z-10 px-4 animate-fade-in">
        <div className="glass rounded-2xl p-6 shadow-[var(--shadow-elevated)]">
          {/* Logo */}
          <div className="text-center mb-5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--color-palm-500)] to-[var(--color-palm-700)] shadow-[var(--shadow-glow-green)] mx-auto mb-3 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <h1 className="tracking-tight whitespace-nowrap app-logo uppercase" style={{ fontSize: '2rem' }}>
              <span className="logo-text">Edu</span><span className="ai-highlight">AI</span>
            </h1>
            <p className="text-ink-soft mt-1.5 text-xs">{t.loginSubtitle}</p>
          </div>

          {/* Pending approval state */}
          {mode === 'pending' ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 mx-auto flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-700 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-ink font-bold text-base mb-1.5">{t.pendingApprovalTitle}</p>
                <p className="text-ink-mute text-sm leading-relaxed">{t.pendingApprovalMsg}</p>
                {selectedTenant && (
                  <p className="text-ink font-bold text-sm mt-2 truncate">{selectedTenant.name}</p>
                )}
              </div>
              <button
                onClick={() => switchMode('login')}
                className="text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-widest hover:opacity-80 transition-opacity"
              >
                ← {t.backToLogin}
              </button>
            </div>
          ) : (
            <>
              {/* Tab switcher */}
              <div className="flex items-center bg-raised rounded-xl p-1 mb-4 border border-line-soft">
                <button
                  onClick={() => switchMode('login')}
                  className={`flex-1 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${mode === 'login' ? 'bg-[var(--color-palm-700)] text-white shadow' : 'text-ink-mute hover:text-ink-soft'}`}
                >
                  {t.signIn}
                </button>
                <button
                  onClick={() => switchMode('register')}
                  className={`flex-1 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${mode === 'register' ? 'bg-[var(--color-palm-700)] text-white shadow' : 'text-ink-mute hover:text-ink-soft'}`}
                >
                  {t.register}
                </button>
              </div>

              <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-3.5">
                {error && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/25 rounded-lg text-red-700 dark:text-red-400 text-xs animate-slide-in font-bold">
                    {error}
                  </div>
                )}

                {mode === 'register' && (
                  <div className="space-y-1">
                    <label className={labelClass}>{t.fullName}</label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={inputClass}
                      placeholder={t.enterName}
                    />
                  </div>
                )}

                {mode === 'register' && (
                  <div className="space-y-1">
                    <label className={labelClass}>{t.institution}</label>
                    {tenantsLoading ? (
                      <div className="w-full px-4 py-2.5 bg-raised border border-line rounded-lg text-ink-mute text-sm">
                        {t.loadingInstitutions}
                      </div>
                    ) : tenantsError !== null ? (
                      <div className="space-y-2">
                        <div className="p-2.5 bg-red-500/10 border border-red-500/25 rounded-lg text-red-700 dark:text-red-400 text-xs font-bold">
                          {tenantsError || t.institutionLoadFailed}
                        </div>
                        <button
                          type="button"
                          onClick={() => setTenantsReload((n) => n + 1)}
                          className="text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:opacity-80 transition-opacity"
                        >
                          {t.tryAgain}
                        </button>
                      </div>
                    ) : tenants.length === 0 ? (
                      <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-lg text-amber-700 dark:text-amber-400 text-xs font-bold">
                        {t.noInstitutionsOpen}
                      </div>
                    ) : (
                      <SearchableSelect
                        options={tenantOptions}
                        value={tenantId}
                        onChange={setTenantId}
                        placeholder={t.chooseInstitution}
                        searchPlaceholder={t.searchInstitutions}
                      />
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  <label className={labelClass}>{t.emailAddress}</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder={mode === 'login' ? 'admin@school.edu' : 'you@example.com'}
                  />
                </div>

                <div className="space-y-1">
                  <label className={labelClass}>{t.password}</label>
                  <input
                    type="password"
                    required
                    minLength={mode === 'register' ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder={mode === 'register' ? t.minChars : '••••••••'}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || registerBlocked}
                  className="w-full py-2.5 px-4 bg-[var(--color-palm-700)] hover:bg-[var(--color-palm-600)] text-white rounded-lg font-semibold shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-palm-500)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center justify-center uppercase tracking-widest text-xs font-black">
                    {loading ? (
                      <svg className="animate-spin ltr:mr-2 rtl:ml-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : null}
                    {loading
                      ? (mode === 'login' ? t.signingIn : t.registering)
                      : (mode === 'login' ? t.signIn : t.register)}
                  </span>
                </button>
              </form>
            </>
          )}

          {mode !== 'pending' && (
            <div className="mt-5 pt-4 border-t border-line-soft text-center">
              <p className="text-ink-mute text-[10px] font-bold">
                {t.loginFooter}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
