import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import apiClient from '../api/client';
import { User, Mail, Save, AlertCircle, CheckCircle, Shield, Camera, Upload } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { translations } from '../i18n/translations';

export default function Settings() {
  const { user, setUser } = useAuthStore();
  const { lang } = useLanguageStore();
  const t = translations[lang];
  const navigate = useNavigate();
  const location = useLocation();
  const isClientRoute = location.pathname.startsWith('/knowledge');
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    user?.avatarUrl || null
  );

  // Sync with store when hydration occurs or user updates
  useEffect(() => {
    if (user?.avatarUrl) {
      setAvatarPreview(user.avatarUrl);
    }
  }, [user?.avatarUrl]);

  useEffect(() => {
    if (user?.fullName) setFullName(user.fullName);
    if (user?.email) setEmail(user.email);
  }, [user?.fullName, user?.email]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatar(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('fullName', fullName);
      formData.append('email', email);
      if (avatar) {
        formData.append('avatar', avatar);
      }

      const response = await apiClient.patch('/auth/profile', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const updatedUser = response.data.data;
      setUser(updatedUser);
      
      setSuccess(t.profileUpdated);
      setAvatar(null);
      // Removed manual localStorage set as zustand-persist handles this automatically with the correct key 'khalifa-auth-storage'
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t.profileUpdateFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in py-12">
      {/* Back button for client portal */}
      {isClientRoute && (
        <button
          onClick={() => navigate('/knowledge')}
          className="flex items-center gap-2 text-sm font-semibold transition-all group"
          style={{ color: 'var(--color-text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#22c55e')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          {t.backToChat || 'Back to Chat'}
        </button>
      )}
      <div className="border-b border-white/5 pb-6">
        <h1 className="text-4xl font-black text-white tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>{t.profileSettings}</h1>
        <p className="text-[var(--color-secondary)] mt-2 font-medium">{t.manageSecurity}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Profile Card & Avatar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass rounded-[2.5rem] p-8 border border-white/5 text-center bg-white/[0.02] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-transparent opacity-50" />
            
            <div className="relative inline-block mb-6">
              <div 
                className="w-32 h-32 rounded-[2.5rem] bg-gradient-to-br from-emerald-500 to-emerald-800 flex items-center justify-center mx-auto shadow-2xl border-4 border-white/10 overflow-hidden relative"
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500" />
                ) : (
                  <span className="text-4xl font-black text-white">{user?.fullName?.charAt(0).toUpperCase()}</span>
                )}
                
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                  <Camera className="w-8 h-8 text-white scale-90 group-hover:scale-100 transition-transform" />
                </div>
              </div>
              
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 ltr:-right-2 rtl:-left-2 w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-xl border-4 border-black hover:scale-110 hover:bg-emerald-400 transition-all z-20"
              >
                <Upload className="w-4 h-4" />
              </button>
            </div>

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleAvatarChange} 
              className="hidden" 
              accept="image/*" 
            />

            <h2 className="text-2xl font-black text-white tracking-tight leading-none">{user?.fullName}</h2>
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Shield className="w-3 h-3" />
              {t[user?.role?.toLowerCase() as keyof typeof t] || user?.role}
            </p>
          </div>
        </div>

        {/* Edit Form */}
        <div className="lg:col-span-2">
          <div className="glass rounded-[2.5rem] p-10 border border-white/5 shadow-2xl relative overflow-hidden backdrop-blur-3xl bg-white/[0.01]">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2" />
            
            <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                  <User className="w-5 h-5 text-emerald-400" />
                  {t.personalIdentity}
                </h3>
              </div>

              {error && (
                <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3 text-sm animate-shake">
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
                  <label className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">{t.fullName}</label>
                  <div className="relative group">
                    <User className="absolute ltr:left-5 rtl:right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="text"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 ltr:pl-14 rtl:pr-14 ltr:pr-6 rtl:pl-6 text-sm focus:border-emerald-500/40 focus:outline-none transition-all placeholder:text-gray-700 font-medium text-white shadow-inner"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t.enterName}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">{t.emailAddress}</label>
                  <div className="relative group">
                    <Mail className="absolute ltr:left-5 rtl:right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="email"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 ltr:pl-14 rtl:pr-14 ltr:pr-6 rtl:pl-6 text-sm focus:border-emerald-500/40 focus:outline-none transition-all placeholder:text-gray-700 font-medium text-white shadow-inner"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full md:w-auto px-12 py-5 bg-gradient-to-r from-emerald-600 to-emerald-400 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-2xl hover:shadow-emerald-500/30 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-3 group"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  )}
                  {loading ? t.saving : t.saveChanges}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
