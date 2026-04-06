import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';
import apiClient from '../../api/client';
import { User, Mail, Save, AlertCircle, CheckCircle, Shield, Camera, Upload } from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  messages: unknown[];
  updatedAt: number;
}

export default function ClientSettings() {
  const { user, logout, setUser } = useAuthStore();
  const { lang, setLanguage } = useLanguageStore();
  const t = translations[lang];
  const navigate = useNavigate();

  // ── Sidebar state (read-only view of chat history) ──
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('khalifa_all_sessions');
    if (saved) {
      try { setSessions(JSON.parse(saved)); } catch {}
    }
  }, []);

  // ── Profile form state ──
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (user?.avatarUrl) setAvatarPreview(user.avatarUrl); }, [user?.avatarUrl]);
  useEffect(() => {
    if (user?.fullName) setFullName(user.fullName);
    if (user?.email) setEmail(user.email);
  }, [user?.fullName, user?.email]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatar(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      const formData = new FormData();
      formData.append('fullName', fullName);
      formData.append('email', email);
      if (avatar) formData.append('avatar', avatar);
      const response = await apiClient.patch('/auth/profile', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUser(response.data.data);
      setSuccess(t.profileUpdated);
      setAvatar(null);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t.profileUpdateFailed);
    } finally {
      setLoading(false);
    }
  };

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t.justNow;
    if (mins < 60) return `${mins}${t.mAgo}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}${t.hAgo}`;
    return `${Math.floor(hrs / 24)}${t.dAgo}`;
  };

  return (
    <div className="flex h-screen text-white overflow-hidden" style={{ fontFamily: 'var(--font-body)', background: 'transparent' }}>

      {/* ════════ SIDEBAR ════════ */}
      <aside
        className="sidebar-container h-full flex-none flex flex-col z-20 overflow-hidden"
        style={{ width: isSidebarOpen ? 280 : 0, minWidth: isSidebarOpen ? 280 : 0 }}
      >
        {/* Branding */}
        <div className="px-5 pt-7 pb-6">
          <div className="flex items-center justify-between">
            <button onClick={() => navigate('/knowledge')} className="flex items-center">
              <span className="whitespace-nowrap flex items-center gap-1.5 uppercase app-logo">
                <span className="kiadp-text">KIADP</span> <span className="ai-highlight">AI</span>
              </span>
            </button>
            <button
              onClick={() => navigate('/knowledge')}
              title={t.backToChat}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all outline-none"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </button>
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="sidebar-section-label">{t.recent}</div>
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => navigate('/knowledge')}
              className="sidebar-item group relative flex items-center cursor-pointer"
            >
              <svg className="w-4 h-4 flex-shrink-0 opacity-30 me-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: 'var(--color-text-secondary)' }}>{s.title}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{timeAgo(s.updatedAt)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* User profile — highlighted as active */}
        <div className="p-4" style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <div className="w-full flex items-center gap-3 p-2 rounded-xl" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)' }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 overflow-hidden" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff' }}>
              {avatarPreview ? (
                <img src={avatarPreview} alt={user?.fullName} className="w-full h-full object-cover" />
              ) : (
                user?.fullName?.charAt(0) || '?'
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-medium truncate text-white">{user?.fullName}</p>
              <p className="text-[11px] truncate" style={{ color: 'var(--color-palm-400)' }}>{t.profileSettings}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full mt-2 flex items-center justify-center gap-2 py-2 text-[10px] font-semibold uppercase tracking-widest transition-all"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            {t.signOut}
          </button>
        </div>
      </aside>

      {/* ════════ MAIN AREA ════════ */}
      <main className="flex-1 flex flex-col relative overflow-hidden" style={{ background: 'transparent' }}>

        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-4 flex-none z-30" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-overlay)', e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent', e.currentTarget.style.color = 'var(--color-text-muted)')}
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {isSidebarOpen
                  ? <><path d="M3 3h7v18H3z" /><path d="M14 6h7M14 12h7M14 18h7" /></>
                  : <><path d="M4 6h16M4 12h16M4 18h16" /></>
                }
              </svg>
            </button>
            <button
              onClick={() => navigate('/knowledge')}
              className="flex items-center gap-2 text-[13px] font-medium transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#22c55e')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
              {t.backToChat}
            </button>
          </div>

          {/* Language selector */}
          <div className="relative z-50 flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setIsLanguageMenuOpen(!isLanguageMenuOpen); }}
              className="px-3 py-1.5 rounded-lg flex items-center gap-2 text-[11px] font-semibold border transition-all cursor-pointer"
              style={{ background: 'var(--color-surface-raised)', borderColor: isLanguageMenuOpen ? 'var(--color-palm-500)' : 'var(--color-border-default)', color: isLanguageMenuOpen ? '#fff' : 'var(--color-text-muted)' }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
              {lang.toUpperCase()}
              <svg className={`w-3 h-3 transition-transform ${isLanguageMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {isLanguageMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsLanguageMenuOpen(false)} />
                <div className="absolute top-full end-0 mt-2 w-32 rounded-xl overflow-hidden shadow-2xl z-50 animate-fade-in"
                  style={{ background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-hover)' }}>
                  {[{ code: 'en', label: 'English' }, { code: 'ar', label: 'العربية' }].map((lng) => (
                    <button
                      key={lng.code}
                      onClick={() => { setLanguage(lng.code as any); setIsLanguageMenuOpen(false); }}
                      className="w-full text-start px-4 py-2.5 text-[12px] font-medium transition-colors border-b last:border-0 border-white/5 cursor-pointer"
                      style={{ color: lang === lng.code ? '#22c55e' : 'var(--color-text-secondary)', background: lang === lng.code ? 'rgba(34,197,94,0.05)' : 'transparent' }}
                    >
                      {lng.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </header>

        {/* Settings Content */}
        <div className="flex-1 overflow-y-auto z-10">
          <div className="max-w-4xl mx-auto px-6 py-10 space-y-8 animate-fade-in">

            <div className="border-b border-white/5 pb-6">
              <h1 className="text-4xl font-black text-white tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>{t.profileSettings}</h1>
              <p className="text-[var(--color-text-secondary)] mt-2 font-medium">{t.manageSecurity}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              {/* Avatar Card */}
              <div className="lg:col-span-1">
                <div className="glass rounded-[2.5rem] p-8 border border-white/5 text-center bg-white/[0.02] shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-transparent opacity-50" />
                  <div className="relative inline-block mb-6">
                    <div
                      className="w-32 h-32 rounded-[2.5rem] bg-gradient-to-br from-emerald-500 to-emerald-800 flex items-center justify-center mx-auto shadow-2xl border-4 border-white/10 overflow-hidden relative cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500" />
                      ) : (
                        <span className="text-4xl font-black text-white">{user?.fullName?.charAt(0).toUpperCase()}</span>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-2 ltr:-right-2 rtl:-left-2 w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-xl border-4 border-black hover:scale-110 hover:bg-emerald-400 transition-all z-20">
                      <Upload className="w-4 h-4" />
                    </button>
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleAvatarChange} className="hidden" accept="image/*" />
                  <h2 className="text-2xl font-black text-white tracking-tight leading-none">{user?.fullName}</h2>
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <Shield className="w-3 h-3" />
                    {t[user?.role?.toLowerCase() as keyof typeof t] as string || user?.role}
                  </p>
                </div>
              </div>

              {/* Edit Form */}
              <div className="lg:col-span-2">
                <div className="glass rounded-[2.5rem] p-10 border border-white/5 shadow-2xl relative overflow-hidden backdrop-blur-3xl bg-white/[0.01]">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2" />
                  <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                      <User className="w-5 h-5 text-emerald-400" />
                      {t.personalIdentity}
                    </h3>

                    {error && (
                      <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3 text-sm">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span className="font-bold">{error}</span>
                      </div>
                    )}
                    {success && (
                      <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-3 text-sm animate-fade-in font-bold">
                        <CheckCircle className="w-5 h-5 flex-shrink-0" />
                        {success}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-text-secondary)] ml-1">{t.fullName}</label>
                        <div className="relative group">
                          <User className="absolute ltr:left-5 rtl:right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-emerald-400 transition-colors" />
                          <input type="text"
                            className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 ltr:pl-14 rtl:pr-14 ltr:pr-6 rtl:pl-6 text-sm focus:border-emerald-500/40 focus:outline-none transition-all placeholder:text-gray-700 font-medium text-white shadow-inner"
                            value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t.enterName} />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-text-secondary)] ml-1">{t.emailAddress}</label>
                        <div className="relative group">
                          <Mail className="absolute ltr:left-5 rtl:right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-emerald-400 transition-colors" />
                          <input type="email"
                            className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 ltr:pl-14 rtl:pr-14 ltr:pr-6 rtl:pl-6 text-sm focus:border-emerald-500/40 focus:outline-none transition-all placeholder:text-gray-700 font-medium text-white shadow-inner"
                            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
                        </div>
                      </div>
                    </div>

                    <div className="pt-8 border-t border-white/5">
                      <button type="submit" disabled={loading}
                        className="px-12 py-5 bg-gradient-to-r from-emerald-600 to-emerald-400 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-2xl hover:shadow-emerald-500/30 disabled:opacity-50 transition-all active:scale-95 flex items-center gap-3 group">
                        {loading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                        {loading ? t.saving : t.saveChanges}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
