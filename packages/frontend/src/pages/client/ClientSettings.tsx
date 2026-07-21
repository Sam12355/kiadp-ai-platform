import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';
import apiClient from '../../api/client';
import ThemeToggle from '../../components/ThemeToggle';
import {
  User, Mail, Save, AlertCircle, CheckCircle, Shield, Camera, Upload,
  Lock, Eye, EyeOff, Globe, LogOut, MessageSquare, Settings, KeyRound,
} from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  messages: unknown[];
  updatedAt: number;
}

type Tab = 'profile' | 'security' | 'preferences';

export default function ClientSettings() {
  const { user, logout, setUser } = useAuthStore();
  const { lang, setLanguage } = useLanguageStore();
  const t = translations[lang];
  const navigate = useNavigate();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  useEffect(() => {
    const savedIndex = localStorage.getItem('eduai_sessions_index');
    if (savedIndex) {
      try { setSessions((JSON.parse(savedIndex) as { id: string; title: string; updatedAt: number }[]).map(m => ({ ...m, messages: [] }))); } catch {}
    } else {
      const oldSaved = localStorage.getItem('eduai_all_sessions');
      if (oldSaved) {
        try { setSessions((JSON.parse(oldSaved) as ChatSession[]).map(({ id, title, updatedAt }) => ({ id, title, updatedAt, messages: [] }))); } catch {}
      }
    }
  }, []);

  // ── Profile state ──
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl || null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Security state ──
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [securitySuccess, setSecuritySuccess] = useState('');

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

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true); setProfileError(''); setProfileSuccess('');
    try {
      const formData = new FormData();
      formData.append('fullName', fullName);
      formData.append('email', email);
      if (avatar) formData.append('avatar', avatar);
      const response = await apiClient.patch('/auth/profile', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUser(response.data.data);
      setProfileSuccess('Profile updated successfully.');
      setAvatar(null);
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (err: any) {
      setProfileError(err.response?.data?.error?.message || (err.response?.data?.error?.message ?? err.response?.data?.error) || 'Failed to update profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setSecurityError('New passwords do not match.'); return; }
    if (newPassword.length < 8) { setSecurityError('Password must be at least 8 characters.'); return; }
    setSecurityLoading(true); setSecurityError(''); setSecuritySuccess('');
    try {
      await apiClient.patch('/auth/profile', { currentPassword, password: newPassword });
      setSecuritySuccess('Password changed successfully.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => setSecuritySuccess(''), 3000);
    } catch (err: any) {
      setSecurityError((err.response?.data?.error?.message ?? err.response?.data?.error) || 'Failed to change password. Check your current password.');
    } finally {
      setSecurityLoading(false);
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

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: KeyRound },
    { id: 'preferences', label: 'Preferences', icon: Settings },
  ];

  const PasswordInput = ({
    label, value, onChange, show, onToggle, placeholder,
  }: { label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; placeholder: string }) => (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-mute">{label}</label>
      <div className="relative">
        <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-raised border border-line rounded-2xl py-4 pl-14 pr-12 text-sm focus:border-emerald-500/40 focus:outline-none transition-all placeholder:text-ink-faint font-medium text-ink"
        />
        <button type="button" onClick={onToggle} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-soft transition-colors">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen text-ink overflow-hidden" style={{ fontFamily: 'var(--font-body)', background: 'transparent' }}>

      {/* ════════ SIDEBAR ════════ */}
      <aside
        className="sidebar-container h-full flex-none flex flex-col z-20 overflow-hidden transition-all duration-300"
        style={{ width: isSidebarOpen ? 280 : 0, minWidth: isSidebarOpen ? 280 : 0 }}
      >
        {/* Branding */}
        <div className="px-5 pt-7 pb-4">
          <button onClick={() => navigate('/knowledge')} className="flex items-center">
            <span className="whitespace-nowrap flex items-center gap-1.5 uppercase app-logo">
              {/* .logo-text clips a white→grey gradient into the glyphs — invisible on a light
                  sidebar — so re-point it at the ink tokens. */}
              <span className="logo-text" style={{ backgroundImage: 'linear-gradient(to bottom, var(--t-ink), var(--t-ink-soft))' }}>Edu</span><span className="ai-highlight">AI</span>
            </span>
          </button>
        </div>

        {/* Nav links */}
        <div className="px-3 pb-3 space-y-1">
          <button onClick={() => navigate('/knowledge')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-ink-mute hover:text-ink hover:bg-overlay transition-all text-left">
            <MessageSquare className="w-4 h-4 flex-shrink-0" /> Back to Chat
          </button>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left ${activeTab === tab.id ? 'bg-emerald-500/10 text-accent border border-emerald-500/20' : 'text-ink-mute hover:text-ink hover:bg-overlay'}`}>
                <Icon className="w-4 h-4 flex-shrink-0" /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Chat history */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="sidebar-section-label mt-2">{t.recent}</div>
          {sessions.length === 0 && (
            <p className="text-[11px] text-ink-faint px-3 italic">No recent chats</p>
          )}
          {sessions.map((s) => (
            <div key={s.id} onClick={() => navigate('/knowledge')}
              className="sidebar-item group relative flex items-center cursor-pointer">
              <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-30 me-3" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: 'var(--color-text-secondary)' }}>{s.title}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{timeAgo(s.updatedAt)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* User card */}
        <div className="p-4" style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <div className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-raised border border-line-soft">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff' }}>
              {avatarPreview
                ? <img src={avatarPreview} alt={user?.fullName} className="w-full h-full object-cover" />
                : user?.fullName?.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate text-ink">{user?.fullName}</p>
              <p className="text-[11px] truncate text-ink-faint">{user?.email}</p>
            </div>
          </div>
          <button onClick={() => { logout(); navigate('/login'); }}
            className="w-full mt-2 flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-widest text-ink-faint hover:text-red-600 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* ════════ MAIN AREA ════════ */}
      <main className="flex-1 flex flex-col relative overflow-hidden">

        {/* Top bar */}
        <header className="h-14 flex items-center px-4 flex-none z-30 gap-3" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-lg transition-colors text-ink-faint hover:text-ink hover:bg-overlay">
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {isSidebarOpen
                ? <><path d="M3 3h7v18H3z" /><path d="M14 6h7M14 12h7M14 18h7" /></>
                : <><path d="M4 6h16M4 12h16M4 18h16" /></>}
            </svg>
          </button>
          <span className="text-sm font-bold text-ink-soft capitalize">{activeTab}</span>
          <div className="flex-1" />
          <ThemeToggle />
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-10 space-y-8 animate-fade-in">

            {/* ── PROFILE TAB ── */}
            {activeTab === 'profile' && (
              <>
                <div>
                  <h1 className="text-3xl font-black text-ink tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>Profile</h1>
                  <p className="text-ink-mute mt-1 text-sm">Update your display name, email, and photo.</p>
                </div>

                <form onSubmit={handleProfileSave} className="space-y-6">
                  {/* Avatar */}
                  <div className="flex items-center gap-6 p-6 glass rounded-[1.5rem] border border-line-soft">
                    <div className="relative group flex-shrink-0 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                      <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-800 flex items-center justify-center border-2 border-line">
                        {avatarPreview
                          ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                          /* Initial and camera both sit on solid emerald / the scrim, so white holds in both themes. */
                          : <span className="text-3xl font-black text-white">{user?.fullName?.charAt(0).toUpperCase()}</span>}
                      </div>
                      <div className="absolute inset-0 bg-scrim opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity flex items-center justify-center">
                        <Camera className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink">{user?.fullName}</p>
                      <p className="text-xs text-ink-faint mt-0.5">{user?.email}</p>
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-raised hover:bg-overlay border border-line rounded-xl text-[10px] font-black uppercase tracking-widest text-ink-mute hover:text-ink transition-all cursor-pointer">
                        <Upload className="w-3 h-3" /> Change Photo
                      </button>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  </div>

                  {profileError && (
                    <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />{profileError}
                    </div>
                  )}
                  {profileSuccess && (
                    <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-accent text-sm">
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />{profileSuccess}
                    </div>
                  )}

                  <div className="glass rounded-[1.5rem] p-6 border border-line-soft space-y-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-mute">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                          placeholder="Your full name"
                          className="w-full bg-raised border border-line rounded-2xl py-4 pl-14 pr-5 text-sm focus:border-emerald-500/40 focus:outline-none transition-all placeholder:text-ink-faint font-medium text-ink" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-mute">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                          placeholder="your@email.com"
                          className="w-full bg-raised border border-line rounded-2xl py-4 pl-14 pr-5 text-sm focus:border-emerald-500/40 focus:outline-none transition-all placeholder:text-ink-faint font-medium text-ink" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-raised border border-line rounded-xl">
                        <Shield className="w-3.5 h-3.5 text-accent" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-accent">{user?.role}</span>
                      </div>
                    </div>
                  </div>

                  <button type="submit" disabled={profileLoading}
                    className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-600 to-emerald-400 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl hover:shadow-emerald-500/30 disabled:opacity-50 transition-all active:scale-95 cursor-pointer">
                    {profileLoading ? <div className="w-4 h-4 border-2 border-line-strong border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                    {profileLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </form>
              </>
            )}

            {/* ── SECURITY TAB ── */}
            {activeTab === 'security' && (
              <>
                <div>
                  <h1 className="text-3xl font-black text-ink tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>Security</h1>
                  <p className="text-ink-mute mt-1 text-sm">Change your password to keep your account safe.</p>
                </div>

                <form onSubmit={handlePasswordChange} className="glass rounded-[1.5rem] p-6 border border-line-soft space-y-5">
                  {securityError && (
                    <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />{securityError}
                    </div>
                  )}
                  {securitySuccess && (
                    <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-accent text-sm">
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />{securitySuccess}
                    </div>
                  )}

                  <PasswordInput label="Current Password" value={currentPassword} onChange={setCurrentPassword}
                    show={showCurrent} onToggle={() => setShowCurrent(s => !s)} placeholder="Enter your current password" />
                  <div className="border-t border-line-soft" />
                  <PasswordInput label="New Password" value={newPassword} onChange={setNewPassword}
                    show={showNew} onToggle={() => setShowNew(s => !s)} placeholder="Min. 8 characters" />
                  <PasswordInput label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword}
                    show={showConfirm} onToggle={() => setShowConfirm(s => !s)} placeholder="Repeat new password" />

                  {newPassword && (
                    <div className="space-y-1.5">
                      {[
                        { label: 'At least 8 characters', ok: newPassword.length >= 8 },
                        { label: 'Passwords match', ok: newPassword === confirmPassword && confirmPassword.length > 0 },
                      ].map(({ label, ok }) => (
                        <div key={label} className={`flex items-center gap-2 text-xs ${ok ? 'text-accent' : 'text-ink-faint'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-accent' : 'bg-line-strong'}`} />
                          {label}
                        </div>
                      ))}
                    </div>
                  )}

                  <button type="submit" disabled={securityLoading || !currentPassword || !newPassword || !confirmPassword}
                    className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-600 to-emerald-400 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl hover:shadow-emerald-500/30 disabled:opacity-40 transition-all active:scale-95 cursor-pointer">
                    {securityLoading ? <div className="w-4 h-4 border-2 border-line-strong border-t-white rounded-full animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    {securityLoading ? 'Updating...' : 'Change Password'}
                  </button>
                </form>
              </>
            )}

            {/* ── PREFERENCES TAB ── */}
            {activeTab === 'preferences' && (
              <>
                <div>
                  <h1 className="text-3xl font-black text-ink tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>Preferences</h1>
                  <p className="text-ink-mute mt-1 text-sm">Customize your experience.</p>
                </div>

                <div className="glass rounded-[1.5rem] p-6 border border-line-soft space-y-6">
                  {/* Language */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-accent" />
                      <span className="text-sm font-bold text-ink">Language</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ code: 'en', label: 'English', native: 'English' }, { code: 'ar', label: 'Arabic', native: 'العربية' }].map((lng) => (
                        <button key={lng.code} onClick={() => setLanguage(lng.code as any)}
                          className={`flex items-center justify-between px-4 py-3.5 rounded-2xl border text-sm font-medium transition-all cursor-pointer ${lang === lng.code ? 'bg-emerald-500/10 border-emerald-500/40 text-accent' : 'bg-raised border-line text-ink-mute hover:text-ink hover:border-line-strong'}`}>
                          <span>{lng.label}</span>
                          <span className="text-xs opacity-60">{lng.native}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-line-soft" />

                  {/* Account info */}
                  <div className="space-y-3">
                    <span className="text-sm font-bold text-ink">Account Info</span>
                    <div className="space-y-2 text-sm">
                      {[
                        { label: 'Name', value: user?.fullName },
                        { label: 'Email', value: user?.email },
                        { label: 'Role', value: user?.role },
                        { label: 'Account Status', value: user?.isActive ? 'Active' : 'Inactive' },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-center py-2 border-b border-line-soft last:border-0">
                          <span className="text-ink-mute text-xs uppercase tracking-widest font-bold">{label}</span>
                          <span className="text-ink font-medium">{value ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-line-soft" />

                  {/* Sign out */}
                  <button onClick={() => { logout(); navigate('/login'); }}
                    className="flex items-center gap-2 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
