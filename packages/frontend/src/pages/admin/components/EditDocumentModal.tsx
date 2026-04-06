import { useState } from 'react';
import apiClient from '../../../api/client';
import type { DocumentSummary } from '@khalifa/shared';
import { X, Save, FileEdit, Info, FileUp, CheckCircle, AlertCircle } from 'lucide-react';
import Portal from '../../../components/Portal';
import SearchableSelect from '../../../components/SearchableSelect';
import { useLanguageStore } from '../../../store/languageStore';
import { translations } from '../../../i18n/translations';

interface EditModalProps {
  document: DocumentSummary;
  onClose: () => void;
  onSuccess: (updatedDoc: DocumentSummary) => void;
}
export default function EditDocumentModal({ document, onClose, onSuccess }: EditModalProps) {
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

  const [title, setTitle] = useState(document.title);
  const [category, setCategory] = useState(document.categories[0] || 'GENERAL');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return setError(t.titleRequired);

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('title', title);
    formData.append('category', category);
    if (file) {
      formData.append('file', file);
    }

    try {
      const { data } = await apiClient.patch(`/documents/${document.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
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
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-700"
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
          className="w-full max-w-xl rounded-[3rem] p-12 shadow-[0_32px_128px_rgba(0,0,0,0.2)] border border-white/10 relative z-10 animate-fade-in overflow-visible" 
          style={{ background: 'rgba(255, 255, 255, 0.001)', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10 }}
        >
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-emerald-500/[0.03] blur-[120px] pointer-events-none rounded-full" />
          
          <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-6 relative z-20">
            <div className="flex items-center gap-4 text-emerald-400">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-inner">
                <FileEdit className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter" style={{ fontFamily: 'var(--font-heading)' }}>{t.updateMeta}</h2>
            </div>
            <button onClick={onClose} className="p-3 rounded-2xl hover:bg-white/10 transition-all text-gray-500 group">
              <X className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8 relative z-20">
            {error && (
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3 animate-shake">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">{t.displayTitle}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-6 py-4 bg-white/[0.02] border border-white/5 rounded-2xl focus:border-emerald-500/40 focus:outline-none text-white transition-all text-sm font-medium shadow-inner"
                  placeholder={t.enterName}
                />
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">{t.librarySegment}</label>
                <SearchableSelect
                  options={CATEGORY_OPTIONS}
                  value={category}
                  onChange={(val) => setCategory(val)}
                  placeholder={t.searchLibrary}
                />
              </div>
            </div>

            {/* Replacement Section */}
            <div className="space-y-3">
              <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">{t.swapPdf}</label>
              <label className={`block border-2 border-dashed rounded-[2.5rem] p-10 transition-all group flex flex-col items-center justify-center gap-3 cursor-pointer bg-white/[0.01] ${file ? 'border-emerald-500/40' : 'border-white/10 hover:border-emerald-500/30'}`}>
                <input type="file" className="sr-only" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                {file ? (
                  <>
                    <CheckCircle className="w-10 h-10 text-emerald-400" />
                    <p className="text-sm font-black text-white">{file.name}</p>
                  </>
                ) : (
                  <>
                    <FileUp className="w-8 h-8 text-gray-500 group-hover:text-emerald-400" />
                    <p className="text-xs font-bold text-gray-400">{t.replacementSource}</p>
                  </>
                )}
              </label>
            </div>

            <div className="pt-6 flex justify-end gap-3 items-center border-t border-white/10">
              <button type="button" onClick={onClose} className="px-8 py-4 rounded-2xl text-sm font-bold text-gray-500 hover:text-white transition-all uppercase tracking-widest">
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-4 rounded-2xl text-sm font-black text-white transition-all shadow-2xl hover:shadow-emerald-500/30 disabled:opacity-50 flex items-center gap-3 uppercase tracking-widest group active:scale-95"
                style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />
                )}
                {loading ? t.synchronizing : t.updateKnowledge}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
