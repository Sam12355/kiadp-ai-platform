import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { uploadUrl } from '../../api/urls';
import DocumentUploadModal from './components/DocumentUploadModal';
import EditDocumentModal from './components/EditDocumentModal';
import ConfirmModal from './components/ConfirmModal';
import type { DocumentSummary } from '@khalifa/shared';
import { FileText, Download, Edit3, Trash2, Plus, Search, Filter, ChevronDown, Sparkles } from 'lucide-react';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';

export default function DocumentsPage() {
  const { lang } = useLanguageStore();
  const t = translations[lang];
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSummaryId, setExpandedSummaryId] = useState<string | null>(null);

  const fetchDocuments = async () => {
    try {
      const { data } = await apiClient.get('/documents');
      setDocuments(data.data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'UPLOADED' || d.status === 'PROCESSING');
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchDocuments();
    }, 3000);

    return () => clearInterval(interval);
  }, [documents]);

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await apiClient.delete(`/documents/${deletingId}`);
      setDocuments(docs => docs.filter(d => d.id !== deletingId));
      setDeletingId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdate = async (id: string, data: any) => {
    setDocuments(docs => docs.map(d => d.id === id ? { ...d, ...data } : d));
    setEditingDoc(null);
  };

  const filteredDocs = documents.filter(doc => 
    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.categories.some(c => (t[c as keyof typeof t] || c).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="animate-fade-in max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>{t.knowledgeLibrary}</h1>
          <p className="text-[var(--color-secondary)] mt-2 font-medium">{t.manageGroundedDocs}</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64 group">
            <Search className="absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-secondary)]" />
            <input 
              type="text" 
              placeholder={t.searchLibrary} 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 ltr:pl-10 rtl:pr-10 ltr:pr-4 rtl:pl-4 text-sm text-white focus:border-emerald-500/50 transition-all focus:outline-none"
            />
          </div>
          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold rounded-xl shadow-lg hover:shadow-emerald-500/20 transition-all whitespace-nowrap active:scale-95"
          >
            <Plus className="w-5 h-5" />
            {t.uploadNew}
          </button>
        </div>
      </div>

      <div className="glass rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left rtl:text-right text-sm">
            <thead className="text-[10px] uppercase font-black tracking-widest text-[var(--color-secondary)] bg-white/5 border-b border-white/5">
              <tr>
                <th className="px-8 py-5 ">{t.document}</th>
                <th className="px-8 py-5 ">{t.category}</th>
                <th className="px-8 py-5 ">{t.status}</th>
                <th className="px-8 py-5 ">{t.dateAdded}</th>
                <th className="px-8 py-5 text-right rtl:text-left">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={5} className="px-8 py-12 text-center text-[var(--color-secondary)] italic">{t.thinking}</td></tr>
              ) : filteredDocs.length === 0 ? (
                <tr><td colSpan={5} className="px-8 py-12 text-center text-[var(--color-secondary)] italic font-black uppercase tracking-widest text-[10px]">{t.noDocumentsFound}</td></tr>
              ) : filteredDocs.map((doc) => {
                const meta = doc.metadata as any;
                return (
                  <React.Fragment key={doc.id}>
                    <tr className="group hover:bg-white/[0.02] transition-colors">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-red-400/10 flex items-center justify-center text-red-400 border border-red-400/20 shadow-lg">
                            <FileText className="w-6 h-6" />
                          </div>
                          <div className="max-w-[240px]">
                            <p className="font-bold text-white truncate" title={doc.title}>{doc.title}</p>
                            <p className="text-[10px] font-bold text-[var(--color-secondary)] mt-1 uppercase tracking-tight truncate">{doc.originalFilename}</p>
                            {meta?.summary && (
                              <button
                                onClick={() => setExpandedSummaryId(expandedSummaryId === doc.id ? null : doc.id)}
                                className="mt-2 flex items-center gap-1 text-[10px] font-black text-emerald-400 hover:text-emerald-300 uppercase tracking-widest transition-colors"
                              >
                                <Sparkles className="w-3 h-3" />
                                {t.aiSummary}
                                <ChevronDown className={`w-3 h-3 transition-transform ${expandedSummaryId === doc.id ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <Filter className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-xs font-bold text-[var(--color-secondary)] uppercase tracking-tight">
                            {doc.categories.map(c => t[c as keyof typeof t] || c).join(', ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col gap-2">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black border w-fit tracking-widest uppercase ${
                            doc.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            doc.status === 'PROCESSING' || doc.status === 'UPLOADED' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                            doc.status === 'FAILED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                            'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                          }`}>
                            {t[doc.status.toLowerCase() as keyof typeof t] || doc.status}
                          </span>
                          {(doc.status === 'PROCESSING' || doc.status === 'UPLOADED') && (
                            <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 transition-all duration-500 shadow-[0_0_8px_var(--color-palm-500)]"
                                style={{ width: `${doc.progress || 0}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6 text-[10px] font-bold text-[var(--color-secondary)] uppercase tracking-widest">
                        {new Date(doc.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                      </td>
                      <td className="px-8 py-6 text-right rtl:text-left flex items-center justify-end gap-1">
                        <a
                          href={uploadUrl(doc.storedFilename)}
                          download={doc.originalFilename}
                          className="p-2.5 text-[var(--color-secondary)] hover:text-emerald-400 hover:bg-emerald-400/10 rounded-xl transition-all"
                          title={t.downloadPdf}
                        >
                          <Download className="w-5 h-5" />
                        </a>
                        <button
                          onClick={() => setEditingDoc(doc)}
                          className="p-2.5 text-[var(--color-secondary)] hover:text-amber-400 hover:bg-amber-400/10 rounded-xl transition-all"
                          title={t.editMetadata}
                        >
                          <Edit3 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => setDeletingId(doc.id)}
                          className="p-2.5 text-[var(--color-secondary)] hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                          title={t.deleteDoc}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>

                    {/* Expanded AI Summary Row */}
                    {expandedSummaryId === doc.id && meta?.summary && (
                      <tr className="animate-fade-in">
                        <td colSpan={5} className="px-8 pb-6 pt-0">
                          <div className="rounded-2xl p-5 border" style={{ background: 'rgba(34,197,94,0.04)', borderColor: 'rgba(34,197,94,0.12)' }}>
                            <div className="flex items-center gap-2 mb-3">
                              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{t.aiSummary}</span>
                            </div>
                            <p className="text-sm text-white/80 leading-relaxed mb-4">{meta.summary}</p>
                            {meta.keyPoints?.length > 0 && (
                              <div>
                                <p className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-2">{t.keyPoints}</p>
                                <ul className="space-y-1.5">
                                  {(meta.keyPoints as string[]).map((point: string, i: number) => (
                                    <li key={i} className="flex items-start gap-2 text-[13px] text-white/70">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                                      {point}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {meta.topics?.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-4">
                                {(meta.topics as string[]).map((topic: string, i: number) => (
                                  <span key={i} className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider" style={{ background: 'rgba(34,197,94,0.10)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>
                                    {topic}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isUploadOpen && (
        <DocumentUploadModal
          onClose={() => setIsUploadOpen(false)}
          onSuccess={(newDoc) => {
            setDocuments([newDoc, ...documents]);
            setIsUploadOpen(false);
          }}
        />
      )}

      {editingDoc && (
        <EditDocumentModal
          document={editingDoc}
          onClose={() => setEditingDoc(null)}
          onSuccess={(updated) => handleUpdate(editingDoc.id, updated)}
        />
      )}

      {deletingId && (
        <ConfirmModal
          title={t.deleteDoc}
          message={t.confirmIrreversible}
          confirmText={t.deleteDoc}
          onClose={() => setDeletingId(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
