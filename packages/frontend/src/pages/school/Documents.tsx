import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import DocumentUploadModal from '../admin/components/DocumentUploadModal';
import ConfirmModal from '../admin/components/ConfirmModal';
import type { DocumentSummary } from '@khalifa/shared';
import { FileText, Trash2, Plus, Search, RefreshCw, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  READY: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  PROCESSING: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  UPLOADED: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  FAILED: 'text-red-400 bg-red-400/10 border-red-400/20',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  READY: <CheckCircle2 className="w-3 h-3" />,
  PROCESSING: <RefreshCw className="w-3 h-3 animate-spin" />,
  UPLOADED: <Clock className="w-3 h-3" />,
  FAILED: <AlertCircle className="w-3 h-3" />,
};

export default function SchoolDocuments() {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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

  useEffect(() => { fetchDocuments(); }, []);

  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'UPLOADED' || d.status === 'PROCESSING');
    if (!hasProcessing) return;
    const interval = setInterval(fetchDocuments, 5000);
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

  const filtered = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-fade-in max-w-5xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>
            Documents
          </h1>
          <p className="text-white/40 mt-2 text-sm font-medium">
            Knowledge documents uploaded for your institution
          </p>
        </div>
        <button
          onClick={() => setIsUploadOpen(true)}
          className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      <div className="relative">
        <Search className="absolute ltr:left-4 rtl:right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search documents..."
          className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/20 text-sm font-medium focus:outline-none focus:border-blue-500/50 transition-colors"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-[1.5rem] p-12 text-center space-y-4">
          <FileText className="w-12 h-12 text-white/20 mx-auto" />
          <p className="text-white/40 font-medium">
            {searchTerm ? 'No documents match your search.' : 'No documents uploaded yet. Upload your first PDF.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((doc) => (
            <div key={doc.id} className="glass rounded-[1.5rem] p-6 flex items-center gap-4 group hover:border-white/10 transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{doc.title}</p>
                <p className="text-xs text-white/30 mt-0.5">
                  {doc.originalFilename}
                  {doc.pageCount ? ` · ${doc.pageCount} pages` : ''}
                  {doc.fileSizeBytes ? ` · ${(doc.fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}
                </p>
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_COLORS[doc.status] || 'text-white/30 bg-white/5 border-white/10'}`}>
                {STATUS_ICONS[doc.status]}
                {doc.status}
              </div>
              <button
                onClick={() => setDeletingId(doc.id)}
                className="p-2 text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {isUploadOpen && (
        <DocumentUploadModal
          onClose={() => setIsUploadOpen(false)}
          onSuccess={() => { setIsUploadOpen(false); fetchDocuments(); }}
        />
      )}

      {deletingId && (
        <ConfirmModal
          title="Delete Document"
          message="Are you certain? This action is IRREVERSIBLE."
          onConfirm={handleDelete}
          onClose={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
