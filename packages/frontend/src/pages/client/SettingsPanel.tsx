import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';
import apiClient from '../../api/client';
import ThemeToggle from '../../components/ThemeToggle';
import {
  User, Mail, Save, AlertCircle, CheckCircle, Shield, Camera,
  Lock, Eye, EyeOff, Globe, LogOut, X, KeyRound, Settings, Building2,
} from 'lucide-react';

type Tab = 'profile' | 'security' | 'preferences';

interface Props {
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = { ADMIN: 'Admin', STUDENT: 'Student', CLIENT: 'Student' };

export default function SettingsPanel({ onClose }: Props) {
  const { user, logout, setUser } = useAuthStore();
  const { lang, setLanguage } = useLanguageStore();
  const t = translations[lang];
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // Profile
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl || null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Security
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [secLoading, setSecLoading] = useState(false);
  const [secError, setSecError] = useState('');
  const [secSuccess, setSecSuccess] = useState('');

  useEffect(() => { if (user?.avatarUrl) setAvatarPreview(user.avatarUrl); }, [user?.avatarUrl]);
  useEffect(() => {
    if (user?.fullName) setFullName(user.fullName);
    if (user?.email) setEmail(user.email);
  }, [user?.fullName, user?.email]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setAvatar(f);
      const r = new FileReader();
      r.onloadend = () => setAvatarPreview(r.result as string);
      r.readAsDataURL(f);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true); setProfileError(''); setProfileSuccess('');
    try {
      const fd = new FormData();
      fd.append('fullName', fullName);
      fd.append('email', email);
      if (avatar) fd.append('avatar', avatar);
      const res = await apiClient.patch('/auth/profile', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUser(res.data.data);
      setProfileSuccess(t.profileUpdated);
      setAvatar(null);
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (err: any) {
      setProfileError(err.response?.data?.error || t.profileUpdateFailed);
    } finally { setProfileLoading(false); }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { setSecError(t.passwordMismatch); return; }
    if (newPw.length < 8) { setSecError(t.passwordTooShort); return; }
    setSecLoading(true); setSecError(''); setSecSuccess('');
    try {
      await apiClient.patch('/auth/profile', { currentPassword: currentPw, password: newPw });
      setSecSuccess(t.passwordChanged);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => setSecSuccess(''), 3000);
    } catch (err: any) {
      setSecError(err.response?.data?.error || t.passwordChangeFailed);
    } finally { setSecLoading(false); }
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'profile', label: t.profile, icon: User },
    { id: 'security', label: t.security, icon: KeyRound },
    { id: 'preferences', label: t.preferences, icon: Settings },
  ];

  const PwField = ({ label, value, onChange, show, toggle, placeholder }: {
    label: string; value: string; onChange: (v: string) => void;
    show: boolean; toggle: () => void; placeholder: string;
  }) => (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">{label}</label>
      <div className="relative">
        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-raised border border-line rounded-2xl py-3 pl-11 pr-11 text-sm focus:border-emerald-500/40 focus:outline-none placeholder:text-ink-faint text-ink transition-colors" />
        <button type="button" onClick={toggle} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-soft transition-colors">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim backdrop-blur-sm animate-fade-in" onClick={onClose}>
      {/* Modal box — stop click propagation so clicks inside don't close */}
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-raised border border-line rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0 border-b border-line-soft">
          <h2 className="text-base font-black text-ink uppercase tracking-widest">{t.profileSettings}</h2>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={onClose} className="p-2 rounded-xl bg-overlay hover:bg-surface border border-line text-ink-mute hover:text-ink transition-all cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-overlay mx-6 mt-4 rounded-xl p-1 gap-1 flex-shrink-0">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer ${activeTab === id ? 'bg-raised text-ink shadow-sm' : 'text-ink-mute hover:text-ink'}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar px-6 py-4">

          {/* ── PROFILE ── */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSave} className="space-y-4">
              {/* Avatar */}
              <div className="flex items-center gap-5 p-5 bg-overlay border border-line rounded-2xl">
                <div className="relative group cursor-pointer flex-shrink-0" onClick={() => fileRef.current?.click()}>
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center border border-line">
                    {avatarPreview
                      ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                      /* Initial and camera both sit on solid emerald / the scrim, so white holds in both themes. */
                      : <span className="text-2xl font-black text-white">{user?.fullName?.charAt(0).toUpperCase()}</span>}
                  </div>
                  <div className="absolute inset-0 bg-scrim opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity flex items-center justify-center">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">{user?.fullName}</p>
                  <p className="text-xs text-ink-faint mt-0.5">{user?.email}</p>
                  {user?.tenantName && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Building2 className="w-3 h-3 text-accent" />
                      <span className="text-xs text-accent font-medium">{user.tenantName}</span>
                    </div>
                  )}
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-raised hover:bg-surface border border-line rounded-xl text-[10px] font-black uppercase tracking-widest text-ink-mute hover:text-ink transition-all cursor-pointer">
                    <Camera className="w-3 h-3" /> {t.changePhoto}
                  </button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>

              {profileError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-accent text-sm">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />{profileSuccess}
                </div>
              )}

              <div className="space-y-3 p-5 bg-overlay border border-line rounded-2xl">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">{t.fullName}</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                    <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                      className="w-full bg-raised border border-line rounded-2xl py-3 pl-11 pr-4 text-sm focus:border-emerald-500/40 focus:outline-none placeholder:text-ink-faint text-ink transition-colors" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">{t.emailAddress}</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full bg-raised border border-line rounded-2xl py-3 pl-11 pr-4 text-sm focus:border-emerald-500/40 focus:outline-none placeholder:text-ink-faint text-ink transition-colors" />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Shield className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-accent">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</span>
                </div>
              </div>

              <button type="submit" disabled={profileLoading}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-400 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl disabled:opacity-50 transition-all active:scale-95 cursor-pointer">
                {profileLoading ? <div className="w-4 h-4 border-2 border-line-strong border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                {profileLoading ? t.saving : t.saveChanges}
              </button>
            </form>
          )}

          {/* ── SECURITY ── */}
          {activeTab === 'security' && (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <p className="text-sm text-ink-mute">{t.manageSecurity}</p>

              <div className="space-y-3 p-5 bg-overlay border border-line rounded-2xl">
                {secError && (
                  <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{secError}
                  </div>
                )}
                {secSuccess && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-accent text-sm">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />{secSuccess}
                  </div>
                )}
                <PwField label={t.currentPassword} value={currentPw} onChange={setCurrentPw}
                  show={showCurrent} toggle={() => setShowCurrent(s => !s)} placeholder="••••••••" />
                <div className="border-t border-line-soft" />
                <PwField label={t.newPassword} value={newPw} onChange={setNewPw}
                  show={showNew} toggle={() => setShowNew(s => !s)} placeholder={t.minChars} />
                <PwField label={t.confirmPassword} value={confirmPw} onChange={setConfirmPw}
                  show={showConfirm} toggle={() => setShowConfirm(s => !s)} placeholder="••••••••" />

                {newPw && (
                  <div className="space-y-1 pt-1">
                    {[
                      { label: t.atLeast8Chars, ok: newPw.length >= 8 },
                      { label: t.passwordsMatch, ok: newPw === confirmPw && confirmPw.length > 0 },
                    ].map(({ label, ok }) => (
                      <div key={label} className={`flex items-center gap-2 text-xs ${ok ? 'text-accent' : 'text-ink-faint'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? 'bg-accent' : 'bg-line-strong'}`} />
                        {label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button type="submit" disabled={secLoading || !currentPw || !newPw || !confirmPw}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-400 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl disabled:opacity-40 transition-all active:scale-95 cursor-pointer">
                {secLoading ? <div className="w-4 h-4 border-2 border-line-strong border-t-white rounded-full animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {secLoading ? t.changingPassword : t.changePassword}
              </button>
            </form>
          )}

          {/* ── PREFERENCES ── */}
          {activeTab === 'preferences' && (
            <div className="space-y-4">
              {/* Language */}
              <div className="p-5 bg-overlay border border-line rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-accent" />
                  <span className="text-sm font-bold text-ink">{t.language}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { code: 'en', label: 'English', native: 'English' },
                    { code: 'ar', label: 'Arabic', native: 'العربية' },
                    { code: 'si', label: 'Sinhala', native: 'සිංහල' },
                    { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
                  ].map(lng => (
                    <button key={lng.code} onClick={() => setLanguage(lng.code as any)}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all cursor-pointer ${lang === lng.code ? 'bg-emerald-500/10 border-emerald-500/40 text-accent' : 'bg-raised border-line text-ink-mute hover:text-ink hover:border-line-strong'}`}>
                      <span className="font-medium">{lng.label}</span>
                      <span className="text-xs opacity-60">{lng.native}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Account info */}
              <div className="p-5 bg-overlay border border-line rounded-2xl space-y-3">
                <span className="text-sm font-bold text-ink">{t.accountInfo}</span>
                <div className="space-y-0">
                  {[
                    { label: t.fullName, value: user?.fullName },
                    { label: t.emailAddress, value: user?.email },
                    { label: t.institution, value: user?.tenantName },
                    { label: t.role, value: ROLE_LABELS[user?.role ?? ''] ?? user?.role },
                    { label: t.accountStatus, value: user?.isActive ? t.active : t.inactive },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between items-center py-2.5 border-b border-line-soft last:border-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-ink-faint">{label}</span>
                      <span className="text-sm text-ink font-medium">{value ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sign out */}
              <button onClick={() => logout()}
                className="flex items-center gap-2 px-5 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
                <LogOut className="w-3.5 h-3.5" /> {t.signOut}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

