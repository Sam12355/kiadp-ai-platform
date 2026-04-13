import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  BookOpen, Bold, Italic, List, ListOrdered, Heading2, Minus,
  CheckCircle, Info, Save, RotateCcw,
} from 'lucide-react';
import apiClient from '../../api/client';
import SearchableSelect from '../../components/SearchableSelect';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';

// ─── Toolbar button ───────────────────────────────────────────────────────────
function ToolBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-2 rounded-xl transition-all text-sm ${
        active
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          : 'text-gray-400 hover:text-white hover:bg-white/[0.06] border border-transparent'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InsertKnowledge() {
  const { lang } = useLanguageStore();
  const t = translations[lang];

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    editorProps: {
      attributes: {
        class:
          'min-h-[280px] outline-none text-sm text-white/90 leading-relaxed prose prose-invert max-w-none',
      },
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const htmlContent = editor?.getHTML() ?? '';
    const plainText = editor?.getText() ?? '';

    if (!title.trim()) return setError(t.titleRequired);
    if (plainText.trim().length < 20) return setError(t.contentRequired);

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      await apiClient.post('/admin/insert-knowledge', {
        title: title.trim(),
        category,
        htmlContent,
      });
      setSuccess(true);
      setTitle('');
      setCategory('GENERAL');
      editor?.commands.clearContent();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t.insertFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-5xl mx-auto space-y-8">
      {/* Page header */}
      <div>
        <h1
          className="text-4xl font-black text-white tracking-tight uppercase flex items-center gap-4"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20">
            <BookOpen className="w-5 h-5 text-emerald-400" />
          </div>
          {t.insertKnowledge}
        </h1>
        <p className="text-[var(--color-secondary)] mt-2 font-medium ms-14 text-sm">
          {t.insertKnowledgeSubtitle}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error / Success banners */}
        {error && (
          <div className="p-4 text-xs font-bold rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3 animate-shake">
            <Info className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="p-4 text-xs font-bold rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-3">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {t.insertSuccess}
          </div>
        )}

        <div className="glass rounded-[2rem] p-8 border border-white/5 space-y-8">
          {/* Title + Category row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">
                {t.document}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.titlePlaceholder}
                className="w-full px-6 py-4 bg-white/[0.02] border border-white/5 rounded-2xl focus:border-emerald-500/40 focus:outline-none text-white transition-all text-sm font-medium shadow-inner"
              />
            </div>

            <div className="space-y-3">
              <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">
                {t.category}
              </label>
              <SearchableSelect
                options={CATEGORY_OPTIONS}
                value={category}
                onChange={setCategory}
                placeholder={t.searchLibrary}
              />
            </div>
          </div>

          {/* Rich text editor */}
          <div className="space-y-3">
            <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">
              {t.contentBody}
            </label>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1 pb-3 border-b border-white/10">
              <ToolBtn
                title={t.bold}
                onClick={() => editor?.chain().focus().toggleBold().run()}
                active={editor?.isActive('bold')}
              >
                <Bold className="w-3.5 h-3.5" />
              </ToolBtn>
              <ToolBtn
                title={t.italic}
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                active={editor?.isActive('italic')}
              >
                <Italic className="w-3.5 h-3.5" />
              </ToolBtn>
              <ToolBtn
                title={t.heading}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                active={editor?.isActive('heading', { level: 2 })}
              >
                <Heading2 className="w-3.5 h-3.5" />
              </ToolBtn>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <ToolBtn
                title={t.bulletList}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                active={editor?.isActive('bulletList')}
              >
                <List className="w-3.5 h-3.5" />
              </ToolBtn>
              <ToolBtn
                title={t.orderedList}
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                active={editor?.isActive('orderedList')}
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </ToolBtn>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <ToolBtn
                title={t.clearFormat}
                onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </ToolBtn>
            </div>

            {/* Editor area */}
            <div
              className="min-h-[280px] px-5 py-4 bg-white/[0.02] border border-white/5 rounded-2xl shadow-inner focus-within:border-emerald-500/40 transition-all cursor-text"
              onClick={() => editor?.commands.focus()}
            >
              <EditorContent editor={editor} />
            </div>

            {/* Character count */}
            <div className="text-right text-[10px] font-bold text-[var(--color-secondary)] uppercase tracking-widest">
              {editor?.storage.characterCount?.characters?.() ?? editor?.getText().length ?? 0} chars
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => {
              setTitle('');
              setCategory('GENERAL');
              setError('');
              setSuccess(false);
              editor?.commands.clearContent();
            }}
            className="px-8 py-4 rounded-2xl text-sm font-bold text-gray-500 hover:text-white transition-all uppercase tracking-widest border border-white/5 hover:border-white/10"
          >
            <Minus className="w-4 h-4 inline me-2" />
            {t.discard}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-12 py-4 rounded-2xl text-sm font-black text-white transition-all shadow-2xl hover:shadow-emerald-500/30 disabled:opacity-50 flex items-center gap-3 uppercase tracking-widest"
            style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {loading ? t.insertingContent : t.insertKnowledge}
          </button>
        </div>
      </form>
    </div>
  );
}
