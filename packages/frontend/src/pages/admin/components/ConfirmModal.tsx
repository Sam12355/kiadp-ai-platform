import { AlertTriangle, X, Trash2, ArrowRight } from 'lucide-react';
import Portal from '../../../components/Portal';
import { useLanguageStore } from '../../../store/languageStore';
import { translations } from '../../../i18n/translations';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export default function ConfirmModal({ 
  title, 
  message, 
  confirmText, 
  onClose, 
  onConfirm,
  loading = false 
}: ConfirmModalProps) {
  const { lang } = useLanguageStore();
  const t = translations[lang];
  const finalConfirmText = confirmText || t.confirm;
  return (
    <Portal>
      <div 
        className="fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-500"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {/* Backdrop - 20px BLUR GLASS OVERLAY */}
        <div 
          className="absolute inset-0 bg-transparent backdrop-blur-[20px] cursor-pointer transition-all duration-1000" 
          onClick={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        {/* Modal Content - CRYSTAL PANEL */}
        <div 
          className="w-full max-w-md rounded-[2.5rem] p-12 shadow-2xl border border-white/10 text-center relative z-10 animate-fade-in overflow-hidden" 
          style={{ background: 'rgba(255, 255, 255, 0.001)', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10 }}
        >
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-red-600 via-red-400 to-red-600 animate-pulse" />
          
          <button onClick={onClose} className="absolute top-8 right-8 p-3 rounded-2xl hover:bg-white/10 transition-colors text-gray-400">
            <X className="w-6 h-6" />
          </button>

          <div className="w-20 h-20 rounded-[2rem] bg-red-500/10 flex items-center justify-center mx-auto mb-8 border border-red-500/20 shadow-inner relative group">
            <AlertTriangle className="w-10 h-10 text-red-500 group-hover:scale-110 transition-transform duration-300" />
            <div className="absolute inset-0 rounded-[2rem] bg-red-500/5 blur-xl group-hover:blur-2xl transition-all" />
          </div>

          <h3 className="text-3xl font-bold text-white mb-4 tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>{title}</h3>
          <p className="text-[var(--color-secondary)] text-sm leading-relaxed mb-10 font-medium px-2">
            {message}
          </p>

          <div className="flex flex-col gap-3">
            <button 
              onClick={onConfirm} 
              disabled={loading}
              className="w-full py-4 px-8 rounded-2xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 transition-all shadow-xl hover:shadow-red-600/20 disabled:opacity-50 flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {loading ? t.executing : finalConfirmText}
            </button>
            
            <button 
              onClick={onClose} 
              className="w-full py-4 px-8 rounded-2xl text-sm font-bold text-white/50 hover:text-white/80 transition-all text-center flex items-center justify-center gap-2 group"
            >
              {t.cancelAction}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
