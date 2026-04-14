import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TiptapUnderline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import TiptapImage from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import {
  BookOpen, Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Heading1, Heading2, Heading3,
  AlignLeft, AlignCenter, AlignRight, ImagePlus, Save, RotateCcw,
  Minus, Info, CheckCircle, X, Palette, Plus, Trash2, Edit3, Filter, Search,
} from 'lucide-react';
import apiClient from '../../api/client';
import SearchableSelect from '../../components/SearchableSelect';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';
import ConfirmModal from './components/ConfirmModal';
import Portal from '../../components/Portal';

// ─── FontSize global attribute extension ─────────────────────────────────────
const FontSizeExt = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs['fontSize'] ? { style: `font-size: ${attrs['fontSize']}` } : {},
        },
      },
    }];
  },
});

// ─── Constants ────────────────────────────────────────────────────────────────
const FONT_FAMILIES = [
  { label: 'Default',          value: '' },
  { label: 'Inter',            value: 'Inter, sans-serif' },
  { label: 'Outfit',           value: 'Outfit, sans-serif' },
  { label: 'Georgia',          value: 'Georgia, serif' },
  { label: 'Courier New',      value: 'Courier New, monospace' },
  { label: 'Neo Sans Arabic',  value: "'Neo Sans Arabic', sans-serif" },
  { label: 'Noto Sans Arabic', value: "'Noto Sans Arabic', sans-serif" },
];
const FONT_SIZES = ['10px','11px','12px','13px','14px','16px','18px','20px','24px','28px','32px','36px','48px'];

// ─── Sub-components ───────────────────────────────────────────────────────────
function TBtn({ onClick, active, title, children }: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`p-1.5 rounded-lg transition-all flex-shrink-0 ${
        active
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          : 'text-gray-400 hover:text-white hover:bg-white/[0.06] border border-transparent'
      }`}
    >
      {children}
    </button>
  );
}
const Sep = () => <div className="w-px h-5 bg-white/10 mx-0.5 flex-shrink-0" />;

// ─── Add New Text Entry Modal ─────────────────────────────────────────────────
function TextEntryAddModal({
  categoryOptions,
  onClose,
  onSaved,
}: {
  categoryOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang } = useLanguageStore();
  const t = translations[lang];

  const [title, setTitle]               = useState('');
  const [category, setCategory]         = useState('GENERAL');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState(false);
  const [charCount, setCharCount]       = useState(0);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [imageUrl, setImageUrl]         = useState('');
  const [currentColor, setCurrentColor] = useState('#ffffff');
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapUnderline,
      TextStyle,
      Color,
      FontFamily,
      TiptapImage.configure({ allowBase64: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      FontSizeExt,
    ],
    onUpdate({ editor }) { setCharCount(editor.getText().length); },
    editorProps: {
      attributes: {
        class: 'min-h-[240px] outline-none text-sm text-white/90 leading-relaxed prose prose-invert max-w-none focus:outline-none',
      },
    },
  });

  const curFontFamily = editor?.getAttributes('textStyle')?.fontFamily ?? '';
  const curFontSize   = editor?.getAttributes('textStyle')?.fontSize   ?? '';

  const insertImageFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = () => editor.chain().focus().setImage({ src: reader.result as string }).run();
    reader.readAsDataURL(file);
    e.target.value = '';
    setShowImageMenu(false);
  };

  const insertImageFromUrl = () => {
    const url = imageUrl.trim();
    if (!url || !editor) return;
    editor.chain().focus().setImage({ src: url }).run();
    setImageUrl('');
    setShowImageMenu(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const htmlContent = editor?.getHTML() ?? '';
    const plainText   = editor?.getText() ?? '';
    if (!title.trim()) return setError(t.titleRequired);
    if (plainText.trim().length < 20) return setError(t.contentRequired);
    setLoading(true); setError(''); setSuccess(false);
    try {
      await apiClient.post('/admin/insert-knowledge', { title: title.trim(), category, htmlContent });
      setSuccess(true);
      onSaved();
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t.insertFailed);
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
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-transparent backdrop-blur-[20px] cursor-pointer transition-all duration-1000"
          onClick={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        {/* Panel */}
        <div
          className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-[3rem] p-10 shadow-[0_32px_128px_rgba(0,0,0,0.35)] border border-white/20 relative z-10 animate-fade-in mx-4"
          style={{ background: 'rgba(255,255,255,0.01)', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10 }}
        >
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-emerald-500/[0.03] blur-[120px] pointer-events-none rounded-full" />

          {/* Header */}
          <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-6 relative z-20">
            <div className="flex items-center gap-4 text-emerald-400">
              <div className="w-12 h-12 rounded-[1.25rem] bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-inner">
                <BookOpen className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter" style={{ fontFamily: 'var(--font-heading)' }}>
                {t.textualKnowledge}
              </h2>
            </div>
            <button onClick={onClose} className="p-3 rounded-2xl hover:bg-white/10 transition-all text-gray-500 group">
              <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8 relative z-20">
            {error && (
              <div className="p-4 text-xs font-bold rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3 animate-shake">
                <Info className="w-4 h-4 flex-shrink-0" />{error}
              </div>
            )}
            {success && (
              <div className="p-4 text-xs font-bold rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-3">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />{t.insertSuccess}
              </div>
            )}

            {/* Title + Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">{t.document}</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder={t.titlePlaceholder}
                  className="w-full px-6 py-4 bg-white/[0.02] border border-white/5 rounded-2xl focus:border-emerald-500/40 focus:outline-none text-white transition-all text-sm font-medium shadow-inner" />
              </div>
              <div className="space-y-3">
                <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">{t.category}</label>
                <SearchableSelect options={categoryOptions} value={category} onChange={setCategory} placeholder={t.searchLibrary} />
              </div>
            </div>

            {/* Editor */}
            <div className="space-y-3">
              <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">{t.contentBody}</label>
              <div className="border border-white/10 rounded-2xl bg-black/20 overflow-hidden">
                {/* Toolbar Row 1 */}
                <div className="flex items-center gap-0.5 p-2 border-b border-white/[0.06] flex-wrap">
                  <TBtn title={t.bold}          onClick={() => editor?.chain().focus().toggleBold().run()}          active={editor?.isActive('bold')}>          <Bold          className="w-3.5 h-3.5" /></TBtn>
                  <TBtn title={t.italic}        onClick={() => editor?.chain().focus().toggleItalic().run()}        active={editor?.isActive('italic')}>        <Italic        className="w-3.5 h-3.5" /></TBtn>
                  <TBtn title={t.underline}     onClick={() => editor?.chain().focus().toggleUnderline().run()}     active={editor?.isActive('underline')}>     <UnderlineIcon className="w-3.5 h-3.5" /></TBtn>
                  <TBtn title={t.strikethrough} onClick={() => editor?.chain().focus().toggleStrike().run()}        active={editor?.isActive('strike')}>        <Strikethrough className="w-3.5 h-3.5" /></TBtn>
                  <Sep />
                  <TBtn title="H1" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} active={editor?.isActive('heading', { level: 1 })}><Heading1 className="w-3.5 h-3.5" /></TBtn>
                  <TBtn title="H2" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive('heading', { level: 2 })}><Heading2 className="w-3.5 h-3.5" /></TBtn>
                  <TBtn title="H3" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} active={editor?.isActive('heading', { level: 3 })}><Heading3 className="w-3.5 h-3.5" /></TBtn>
                  <Sep />
                  <TBtn title={t.bulletList}  onClick={() => editor?.chain().focus().toggleBulletList().run()}  active={editor?.isActive('bulletList')}>  <List         className="w-3.5 h-3.5" /></TBtn>
                  <TBtn title={t.orderedList} onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive('orderedList')}><ListOrdered  className="w-3.5 h-3.5" /></TBtn>
                  <Sep />
                  <TBtn title="Align Left"   onClick={() => editor?.chain().focus().setTextAlign('left').run()}   active={editor?.isActive({ textAlign: 'left' })}>  <AlignLeft   className="w-3.5 h-3.5" /></TBtn>
                  <TBtn title="Align Center" onClick={() => editor?.chain().focus().setTextAlign('center').run()} active={editor?.isActive({ textAlign: 'center' })}><AlignCenter className="w-3.5 h-3.5" /></TBtn>
                  <TBtn title="Align Right"  onClick={() => editor?.chain().focus().setTextAlign('right').run()}  active={editor?.isActive({ textAlign: 'right' })}>  <AlignRight  className="w-3.5 h-3.5" /></TBtn>
                </div>
                {/* Toolbar Row 2 */}
                <div className="flex items-center gap-2 p-2 border-b border-white/[0.06] flex-wrap">
                  <select value={curFontFamily}
                    onChange={(e) => { const v = e.target.value; if (v) editor?.chain().focus().setFontFamily(v).run(); else editor?.chain().focus().unsetFontFamily().run(); }}
                    className="bg-black/50 border border-white/10 rounded-lg text-[11px] text-gray-300 px-2 py-1.5 focus:outline-none focus:border-emerald-500/40 cursor-pointer max-w-[130px]">
                    {FONT_FAMILIES.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value || undefined }}>{f.label}</option>)}
                  </select>
                  <select value={curFontSize}
                    onChange={(e) => { editor?.chain().focus().setMark('textStyle', { fontSize: e.target.value || null }).run(); }}
                    className="bg-black/50 border border-white/10 rounded-lg text-[11px] text-gray-300 px-2 py-1.5 focus:outline-none focus:border-emerald-500/40 cursor-pointer w-[72px]">
                    <option value="">Size</option>
                    {FONT_SIZES.map(s => <option key={s} value={s}>{s.replace('px', '')}</option>)}
                  </select>
                  <button type="button" title={t.textColor} onClick={() => colorInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-all">
                    <Palette className="w-3.5 h-3.5 text-gray-400" />
                    <div className="w-4 h-3.5 rounded-[3px] border border-white/20" style={{ backgroundColor: currentColor }} />
                  </button>
                  <input ref={colorInputRef} type="color" className="sr-only" value={currentColor}
                    onChange={(e) => { setCurrentColor(e.target.value); editor?.chain().focus().setColor(e.target.value).run(); }} />
                  <Sep />
                  <div className="relative">
                    <TBtn title={t.insertImage} onClick={() => setShowImageMenu(v => !v)} active={showImageMenu}>
                      <ImagePlus className="w-3.5 h-3.5" />
                    </TBtn>
                    {showImageMenu && (
                      <div className="absolute top-full start-0 mt-1 z-50 bg-[#0d1117] border border-white/15 rounded-xl p-3 shadow-2xl w-72">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-secondary)]">{t.insertImage}</p>
                          <button type="button" onClick={() => setShowImageMenu(false)}><X className="w-3.5 h-3.5 text-gray-500 hover:text-white" /></button>
                        </div>
                        <div className="flex gap-2">
                          <input type="text" placeholder="https://..." value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && insertImageFromUrl()}
                            className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/40" />
                          <button type="button" onClick={insertImageFromUrl}
                            className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded-lg font-bold transition-colors shrink-0">URL</button>
                        </div>
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                          className="w-full mt-2 py-2 text-[10px] font-bold text-gray-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-all">
                          📁 {t.uploadFile}
                        </button>
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" className="sr-only" accept="image/*" onChange={insertImageFromFile} />
                  <Sep />
                  <TBtn title={t.clearFormat} onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}>
                    <RotateCcw className="w-3.5 h-3.5" />
                  </TBtn>
                </div>
                {/* Editor area */}
                <div className="px-5 py-4 cursor-text" onClick={() => editor?.commands.focus()}>
                  <EditorContent editor={editor} />
                </div>
              </div>
              <div className="text-right text-[10px] font-bold text-[var(--color-secondary)] uppercase tracking-widest">
                {charCount} {t.charsLabel}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-6 flex justify-end gap-4 border-t border-white/10">
              <button type="button" onClick={onClose}
                className="px-8 py-4 rounded-2xl text-sm font-bold text-gray-500 hover:text-white transition-all uppercase tracking-widest">
                {t.discard}
              </button>
              <button type="submit" disabled={loading}
                className="px-12 py-4 rounded-2xl text-sm font-black text-white transition-all shadow-2xl hover:shadow-emerald-500/30 disabled:opacity-50 flex items-center gap-3 uppercase tracking-widest"
                style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}>
                {loading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
                {loading ? t.insertingContent : t.insertKnowledge}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}

// ─── Edit Text Entry Modal ────────────────────────────────────────────────────
function TextEntryEditModal({
  entry,
  categoryOptions,
  onClose,
  onSaved,
}: {
  entry: any;
  categoryOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: (id: string, data: any) => void;
}) {
  const { lang } = useLanguageStore();
  const t = translations[lang];
  const [title, setTitle] = useState<string>(entry.title);
  const [category, setCategory] = useState<string>(entry.categories?.[0] || 'GENERAL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!title.trim()) return setError(t.titleRequired);
    setLoading(true); setError('');
    try {
      const { data } = await apiClient.patch(`/admin/textual-knowledge/${entry.id}`, { title: title.trim(), categories: [category] });
      onSaved(entry.id, data.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || t.insertFailed);
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
        <div
          className="absolute inset-0 bg-transparent backdrop-blur-[20px] cursor-pointer transition-all duration-1000"
          onClick={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <div
          className="w-full max-w-lg rounded-[3rem] p-12 shadow-[0_32px_128px_rgba(0,0,0,0.3)] border border-white/20 relative z-10 animate-fade-in overflow-visible mx-4"
          style={{ background: 'rgba(255,255,255,0.01)', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 10 }}
        >
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-amber-500/[0.03] blur-[120px] pointer-events-none rounded-full" />

          {/* Header */}
          <div className="flex justify-between items-center mb-10 border-b border-white/10 pb-8 relative z-20">
            <div className="flex items-center gap-4 text-amber-400">
              <div className="w-12 h-12 rounded-[1.25rem] bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-inner">
                <Edit3 className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter" style={{ fontFamily: 'var(--font-heading)' }}>
                {t.editMetadata}
              </h2>
            </div>
            <button onClick={onClose} className="p-3 rounded-2xl hover:bg-white/10 transition-all text-gray-500 group">
              <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
            </button>
          </div>

          <div className="space-y-8 relative z-20">
            {error && (
              <div className="p-4 text-xs font-bold rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
                <Info className="w-4 h-4 flex-shrink-0" />{error}
              </div>
            )}
            <div className="space-y-8">
              <div className="space-y-3">
                <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">{t.document}</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-6 py-4 bg-white/[0.02] border border-white/5 rounded-2xl focus:border-emerald-500/40 focus:outline-none text-white transition-all text-sm font-medium shadow-inner" />
              </div>
              <div className="space-y-3">
                <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-secondary)] ml-1">{t.category}</label>
                <SearchableSelect options={categoryOptions} value={category} onChange={setCategory} placeholder={t.searchLibrary} />
              </div>
            </div>
            <div className="pt-6 flex justify-end gap-4 border-t border-white/10">
              <button type="button" onClick={onClose} disabled={loading}
                className="px-8 py-4 rounded-2xl text-sm font-bold text-gray-500 hover:text-white transition-all uppercase tracking-widest">
                {t.discard}
              </button>
              <button onClick={handleSave} disabled={loading}
                className="px-12 py-4 rounded-2xl text-sm font-black text-white transition-all shadow-2xl hover:shadow-amber-500/30 disabled:opacity-50 flex items-center gap-3 uppercase tracking-widest"
                style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)' }}>
                {loading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
                {t.saveChanges}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InsertKnowledge() {
  const { lang } = useLanguageStore();
  const t = translations[lang];

  // ── Table state ─────────────────────────────────────────────────────────────
  const [showForm, setShowForm]         = useState(false);
  const [entries, setEntries]           = useState<any[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [searchTerm, setSearchTerm]     = useState('');
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [editingDoc, setEditingDoc]     = useState<any | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/admin/textual-knowledge');
      setEntries(data.data.items || []);
    } catch { /* silent */ } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleDeleteEntry = async () => {
    if (!deletingId) return;
    try {
      await apiClient.delete(`/admin/textual-knowledge/${deletingId}`);
      setEntries(prev => prev.filter(e => e.id !== deletingId));
    } catch { /* silent */ } finally {
      setDeletingId(null);
    }
  };

  const handleUpdateEntry = async (id: string, data: any) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
    setEditingDoc(null);
  };

  const filteredEntries = entries.filter(e =>
    e.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const CATEGORY_OPTIONS = [
    { value: 'GENERAL',        label: t.GENERAL },
    { value: 'DATE_PALM',      label: t.DATE_PALM },
    { value: 'MAINTENANCE',    label: t.MAINTENANCE },
    { value: 'PEST_CONTROL',   label: t.PEST_CONTROL },
    { value: 'RESEARCH_PAPER', label: t.RESEARCH_PAPER },
    { value: 'MARKETING',      label: t.MARKETING },
    { value: 'VALORISATION',   label: t.VALORISATION },
    { value: 'PRODUCTION',     label: t.PRODUCTION },
  ];

  return (
    <div className="animate-fade-in max-w-7xl mx-auto space-y-8">

      {/* Page header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight uppercase flex items-center gap-4"
            style={{ fontFamily: 'var(--font-heading)' }}>
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20">
              <BookOpen className="w-5 h-5 text-emerald-400" />
            </div>
            {t.textualKnowledge}
          </h1>
          <p className="text-[var(--color-secondary)] mt-2 font-medium ms-14 text-sm">
            {t.insertKnowledgeSubtitle}
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-secondary)]" />
            <input type="text" placeholder={t.searchLibrary} value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 ltr:pl-10 rtl:pr-10 ltr:pr-4 rtl:pl-4 text-sm text-white focus:border-emerald-500/50 transition-all focus:outline-none" />
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold rounded-xl shadow-lg hover:shadow-emerald-500/20 transition-all whitespace-nowrap active:scale-95">
            <Plus className="w-5 h-5" />
            {t.addNew}
          </button>
        </div>
      </div>

      {/* ── Entries table ──────────────────────────────────────────────────── */}
      <div className="glass rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left rtl:text-right text-sm">
            <thead className="text-[10px] uppercase font-black tracking-widest text-[var(--color-secondary)] bg-white/5 border-b border-white/5">
              <tr>
                <th className="px-8 py-5">{t.document}</th>
                <th className="px-8 py-5">{t.category}</th>
                <th className="px-8 py-5">{t.status}</th>
                <th className="px-8 py-5">{t.dateAdded}</th>
                <th className="px-8 py-5 text-right rtl:text-left">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tableLoading ? (
                <tr><td colSpan={5} className="px-8 py-12 text-center text-[var(--color-secondary)] italic">{t.thinking}</td></tr>
              ) : filteredEntries.length === 0 ? (
                <tr><td colSpan={5} className="px-8 py-12 text-center text-[var(--color-secondary)] italic font-black uppercase tracking-widest text-[10px]">{t.noTextEntries}</td></tr>
              ) : filteredEntries.map(entry => (
                <tr key={entry.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-400/10 flex items-center justify-center text-emerald-400 border border-emerald-400/20 shadow-lg">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <div className="max-w-[240px]">
                        <p className="font-bold text-white truncate" title={entry.title}>{entry.title}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <Filter className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-bold text-[var(--color-secondary)] uppercase tracking-tight">
                        {entry.categories.map((c: string) => (t as any)[c] || c).join(', ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black border w-fit tracking-widest uppercase ${
                      entry.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      entry.status === 'PROCESSING' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      entry.status === 'FAILED'     ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {(t as any)[entry.status.toLowerCase()] || entry.status}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-[10px] font-bold text-[var(--color-secondary)] uppercase tracking-widest">
                    {new Date(entry.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                  </td>
                  <td className="px-8 py-6 text-right rtl:text-left">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditingDoc(entry)}
                        className="p-2.5 text-[var(--color-secondary)] hover:text-amber-400 hover:bg-amber-400/10 rounded-xl transition-all"
                        title={t.editMetadata}>
                        <Edit3 className="w-5 h-5" />
                      </button>
                      <button onClick={() => setDeletingId(entry.id)}
                        className="p-2.5 text-[var(--color-secondary)] hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                        title={t.delete}>
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showForm && (
        <TextEntryAddModal
          categoryOptions={CATEGORY_OPTIONS}
          onClose={() => setShowForm(false)}
          onSaved={() => { fetchEntries(); }}
        />
      )}
      {deletingId && (
        <ConfirmModal
          title={t.deleteDoc}
          message={t.confirmIrreversible}
          confirmText={t.deleteDoc}
          onConfirm={handleDeleteEntry}
          onClose={() => setDeletingId(null)}
        />
      )}
      {editingDoc && (
        <TextEntryEditModal
          entry={editingDoc}
          categoryOptions={CATEGORY_OPTIONS}
          onClose={() => setEditingDoc(null)}
          onSaved={handleUpdateEntry}
        />
      )}
    </div>
  );
}
