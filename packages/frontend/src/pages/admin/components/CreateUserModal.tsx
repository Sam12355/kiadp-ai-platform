import { useState } from 'react';
import { X, User, Mail, Shield, Lock, Save, AlertCircle } from 'lucide-react';
import Portal from '../../../components/Portal';
import apiClient from '../../../api/client';
import SearchableSelect from '../../../components/SearchableSelect';
import { useLanguageStore } from '../../../store/languageStore';
import { translations } from '../../../i18n/translations';

interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
  const { lang } = useLanguageStore();
  const t = translations[lang];
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('CLIENT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await apiClient.post('/admin/users', {
        fullName,
        email,
        password,
        role,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || t.failedCreateUser);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
      <div 
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-700"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-transparent backdrop-blur-[20px] cursor-pointer transition-all duration-1000" 
          onClick={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        {/* Modal Content */}
        <div 
          className="w-full max-w-xl rounded-[3rem] p-12 shadow-[0_32px_128px_rgba(0,0,0,0.3)] border border-white/20 relative z-10 animate-fade-in overflow-visible" 
          style={{ background: 'rgba(255, 255, 255, 0.001)', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10 }}
        >
          <div className="absolute top-0 right-0 p-8">
            <button onClick={onClose} className="p-4 rounded-2xl hover:bg-white/10 transition-colors text-white/50 hover:text-white group">
              <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
            </button>
          </div>

          <div className="mb-12">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
                <User className="w-6 h-6 text-emerald-400" />
              </div>
              <h2 className="text-3xl font-black text-white tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>
                {t.onboardUser}
              </h2>
            </div>
            <p className="text-gray-400 font-medium">{t.onboardSubtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {error && (
              <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3 text-sm animate-shake font-bold">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 ml-1">{t.fullLegalName}</label>
                <div className="relative group">
                  <User className="absolute ltr:left-5 rtl:right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 group-focus-within:text-emerald-400 transition-colors" />
                  <input
                    required
                    type="text"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 ltr:pl-14 rtl:pr-14 ltr:pr-6 rtl:pl-6 text-sm text-white focus:border-emerald-500/40 focus:outline-none transition-all placeholder:text-gray-700 font-medium"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t.enterName}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 ml-1">{t.accountEmail}</label>
                <div className="relative group">
                  <Mail className="absolute ltr:left-5 rtl:right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 group-focus-within:text-emerald-400 transition-colors" />
                  <input
                    required
                    type="email"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 ltr:pl-14 rtl:pr-14 ltr:pr-6 rtl:pl-6 text-sm text-white focus:border-emerald-500/40 focus:outline-none transition-all placeholder:text-gray-700 font-medium"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@khalifa.ai"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 ml-1">{t.systemRole}</label>
                <SearchableSelect
                  options={[
                    { value: 'CLIENT', label: t.standardUser },
                    { value: 'ADMIN', label: t.platformAdministrator }
                  ]}
                  value={role}
                  onChange={setRole}
                  placeholder={t.registryType}
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 ml-1">{t.initializationCode}</label>
                <div className="relative group">
                  <Lock className="absolute ltr:left-5 rtl:right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 group-focus-within:text-emerald-400 transition-colors" />
                  <input
                    required
                    type="password"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 ltr:pl-14 rtl:pr-14 ltr:pr-6 rtl:pl-6 text-sm text-white focus:border-emerald-500/40 focus:outline-none transition-all placeholder:text-gray-700 font-medium"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.setPassword}
                  />
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-white/5 flex gap-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/5 transition-all border border-white/5"
              >
                {t.discard}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-[2] py-5 bg-gradient-to-r from-emerald-600 to-emerald-400 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl shadow-2xl hover:shadow-emerald-500/30 disabled:opacity-50 transition-all flex items-center justify-center gap-3 group"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />
                )}
                {loading ? t.registering : t.provisionAccount}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
