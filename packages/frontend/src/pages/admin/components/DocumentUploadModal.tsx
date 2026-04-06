import { useState } from 'react';
import apiClient from '../../../api/client';
import type { DocumentSummary } from '@khalifa/shared';
import { X, UploadCloud, FileText, CheckCircle, Info } from 'lucide-react';
import Portal from '../../../components/Portal';
import SearchableSelect from '../../../components/SearchableSelect';
import { useLanguageStore } from '../../../store/languageStore';
import { translations } from '../../../i18n/translations';

interface UploadModalProps {
  onClose: () => void;
  onSuccess: (newDoc: DocumentSummary) => void;
}

export default function DocumentUploadModal({ onClose, onSuccess }: UploadModalProps) {
  const { lang } = useLanguageStore();
  const t = translations[lang];

  const CATEGORY_OPTIONS = [
    { value: 'GENERAL', label: t.GENERAL },
    { value: 'DATE_PALM', label: t.DATE_PALM },
    { value: 'MAINTENANCE', label: t.MAINTENANCE },
    { value: 'PEST_CONTROL', label: t.PEST_CONTROL },
    { value: 'RESEARCH_PAPER', label: t.RESEARCH_PAPER },
    { value: 'MARKETING', label: t.MARKETING },
    { value: 'VALORISATION', label: t.VALORISATION },
    { value: 'PRODUCTION', label: t.PRODUCTION },
  ];

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setError(t.selectPdf);

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('title', title || file.name.replace('.pdf', ''));
    formData.append('category', category);
    formData.append('file', file);

    try {
      const { data } = await apiClient.post<{ success: boolean; data: DocumentSummary }>(
        '/documents/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      onSuccess(data.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t.uploadFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
      <div 
        className="fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-700"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {/* Backdrop - 20px BLUR GLASS OVERLAY */}
        <div 
          className="absolute inset-0 bg-transparent backdrop-blur-[20px] cursor-pointer transition-all duration-1000" 
          onClick={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        
        {/* Modal Content - GLASS PANEL */}
        <div 
          className="w-full max-w-lg rounded-[3rem] p-12 shadow-[0_32px_128px_rgba(0,0,0,0.3)] border border-white/20 relative z-10 animate-fade-in overflow-visible" 
          style={{ background: 'rgba(255, 255, 255, 0.01)', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10 }}
        >
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-emerald-500/[0.03] blur-[120px] pointer-events-none rounded-full" />
          
          <div className="flex justify-between items-center mb-10 border-b border-white/10 pb-8 relative z-20">
            <div className="flex items-center gap-4 text-emerald-400">
              <div className="w-12 h-12 rounded-[1.25rem] bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-inner">
                <UploadCloud className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter" style={{ fontFamily: 'var(--font-heading)' }}>{t.uploadNew}</h2>
            </div>
            <button onClick={onClose} className="p-3 rounded-2xl hover:bg-white/10 transition-all text-gray-500 group">
              <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8 relative z-20">
            {error && (
              <div className="p-4 text-xs font-bold rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3 animate-shake">
                <Info className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-8">
              <div className="space-y-3">
                <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">{t.document}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t.titlePlaceholder}
                  className="w-full px-6 py-4 bg-white/[0.02] border border-white/5 rounded-2xl focus:border-emerald-500/40 focus:outline-none text-white transition-all text-sm font-medium shadow-inner"
                />
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">{t.category}</label>
                <SearchableSelect
                  options={CATEGORY_OPTIONS}
                  value={category}
                  onChange={(val) => setCategory(val)}
                  placeholder={t.searchLibrary}
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">{t.document}</label>
              <label className={`block border-2 border-dashed rounded-[2.5rem] p-12 transition-all group flex flex-col items-center justify-center gap-4 cursor-pointer overflow-hidden bg-white/[0.01] ${file ? 'border-emerald-500/40' : 'border-white/10 hover:border-emerald-500/30'}`}>
                <input type="file" className="sr-only" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                {file ? (
                  <>
                    <FileText className="w-12 h-12 text-emerald-400 animate-bounce-slow" />
                    <div className="text-center">
                      <p className="text-sm font-black text-white">{file.name}</p>
                      <p className="text-[10px] text-emerald-400/60 uppercase tracking-widest mt-1">{t.completed}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-10 h-10 text-gray-600 group-hover:text-emerald-500 transition-all group-hover:scale-110" />
                    <p className="text-sm font-bold text-gray-400">{t.uploadNew}</p>
                  </>
                )}
              </label>
            </div>

            <div className="pt-6 flex justify-end gap-4 border-t border-white/10">
              <button type="button" onClick={onClose} className="px-8 py-4 rounded-2xl text-sm font-bold text-gray-500 hover:text-white transition-all uppercase tracking-widest">
                {t.discard}
              </button>
              <button
                type="submit"
                disabled={loading || !file}
                className="px-12 py-4 rounded-2xl text-sm font-black text-white transition-all shadow-2xl hover:shadow-emerald-500/30 disabled:opacity-50 flex items-center gap-3 uppercase tracking-widest"
                style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
                {loading ? t.processing : t.saveChanges}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
