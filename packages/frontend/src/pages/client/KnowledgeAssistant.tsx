import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { uploadUrl } from '../../api/urls';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';
import Portal from '../../components/Portal';

interface Source {
  id: string;
  documentId: string;
  pageNumber: number;
  excerpt: string;
  relevanceScore: number;
  sourceDocument: { title: string; originalFilename: string; storedFilename: string };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  images?: {
    id: string;
    url: string;
    description: string;
    pageNumber: number;
  }[];
  isGrounded?: boolean;
  thread?: Message[];
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

export default function KnowledgeAssistant() {
  const { lang, setLanguage } = useLanguageStore();
  const { sessionId: urlSessionId } = useParams();
  const t = translations[lang];
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadQuery, setThreadQuery] = useState('');
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ url: string; description: string; pageNumber: number } | null>(null);
  const [zoomScale, setZoomScale] = useState(1);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mainInputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  // Active session logic — if no urlSessionId, it's a "New" draft
  const activeSession = urlSessionId 
    ? (sessions.find(s => s.id === urlSessionId) || null)
    : { id: 'new', title: t.newChat, messages: [], updatedAt: Date.now() };
  
  const messages = activeSession?.messages || [];

  // 1. Initial Load
  useEffect(() => {
    const saved = localStorage.getItem('khalifa_all_sessions');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setSessions(parsed);
      } catch (e) { console.error(e); }
    }
  }, []);

  // 2. Persistence
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('khalifa_all_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  // 3. Auto-scroll and focus
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (!activeThreadId) {
      mainInputRef.current?.focus();
    }
  }, [messages, loading, urlSessionId, activeThreadId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages, isThreadLoading]);

  // ── Handlers ──
  const handleNewChat = () => {
    navigate('/knowledge');
    setQuery('');
  };

  const deleteSession = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMenuOpenId(null);
    const filtered = sessions.filter(s => s.id !== id);
    setSessions(filtered);
    if (urlSessionId === id) {
      handleNewChat();
    }
  };

  const startRename = (id: string, currentTitle: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMenuOpenId(null);
    setEditingTitleId(id);
    setEditingTitleValue(currentTitle);
  };

  const saveRename = (id: string, newTitle: string) => {
    if (newTitle.trim()) {
      setSessions(prev => prev.map(s =>
        s.id === id ? { ...s, title: newTitle.trim() } : s
      ));
    }
    setEditingTitleId(null);
  };

  const openThread = (msg: Message) => {
    setActiveThreadId(msg.id);
    if (!msg.thread) {
      setThreadMessages([msg]);
      if (msg.isGrounded === false) {
        const userQuery = messages.find((_, i, arr) => arr[i+1]?.id === msg.id)?.content || '';
        setThreadQuery(`Please provide a general scientific explanation for: ${userQuery}`);
      } else {
        setThreadQuery('');
      }
    } else {
      setThreadMessages(msg.thread);
      setThreadQuery('');
    }
  };

  const persistThread = (msgId: string, fullThread: Message[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== urlSessionId) return s;
      return {
        ...s,
        messages: s.messages.map(m => m.id === msgId ? { ...m, thread: fullThread } : m)
      };
    }));
  };

  const handleThreadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadQuery.trim() || isThreadLoading || !activeThreadId) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: threadQuery };
    const currentQ = threadQuery;
    const newThread = [...threadMessages, userMsg];
    setThreadMessages(newThread);
    setThreadQuery('');
    setIsThreadLoading(true);

    try {
      const history = threadMessages.map(m => ({ role: m.role, content: m.content }));
      const { data } = await apiClient.post('/knowledge/ask', {
        question: currentQ,
        history,
        language: lang,
        mode: 'general'
      });
      const assistantMsg: Message = { id: data.data.answerId, role: 'assistant', content: data.data.answerText, isGrounded: false };
      const finalized = [...newThread, assistantMsg];
      setThreadMessages(finalized);
      persistThread(activeThreadId, finalized);
    } catch (err) {
      console.error(err);
    } finally {
      setIsThreadLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const currentQ = query;
    setQuery('');
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: currentQ };
    
    let targetId = urlSessionId;

    if (!targetId) {
      // Create new session from draft
      const newId = Date.now().toString();
      const newSession: ChatSession = { 
        id: newId, 
        title: currentQ.length > 40 ? currentQ.substring(0, 40) + '…' : currentQ, 
        messages: [userMsg], 
        updatedAt: Date.now() 
      };
      setSessions(prev => [newSession, ...prev]);
      navigate(`/knowledge/chat/${newId}`, { replace: true });
      targetId = newId;
    } else {
      setSessions(prev => prev.map(s => {
        if (s.id === targetId) return { ...s, messages: [...s.messages, userMsg], updatedAt: Date.now() };
        return s;
      }));
    }

    setLoading(true);
    try {
      const history = messages.slice(-5).map(m => ({ role: m.role, content: m.content }));
      const { data } = await apiClient.post('/knowledge/ask', {
        question: currentQ,
        history,
        language: lang
      });
      const { answerId, answerText, isGrounded, sources, images } = data.data;
      const assistantMsg: Message = { id: answerId, role: 'assistant', content: answerText, isGrounded, sources, images };
      setSessions(prev => prev.map(s => {
        if (s.id === targetId) return { ...s, messages: [...s.messages, assistantMsg], updatedAt: Date.now() };
        return s;
      }));
    } catch (err) {
      console.error(err);
      setSessions(prev => prev.map(s => {
        if (s.id === targetId) return { ...s, messages: [...s.messages, { id: 'err-' + Date.now(), role: 'assistant', content: t.errorGeneric }] };
        return s;
      }));
    } finally {
      setLoading(false);
    }
  };

  /* ── Markdown rendering ── */
  const formatContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      const isFirst = i === 0;
      const headerMatch = line.match(/^(#{1,4})\s+(.*)$/);
      if (headerMatch) {
         return <h3 key={i} className={isFirst ? "!mt-0" : ""} style={isFirst ? { marginTop: 0 } : {}}>{processInline(headerMatch[2])}</h3>;
      }
      const trimmed = line.trim();
      if (/^(\*\*)?[A-Z][^.!?]*:(\*\*)?$/.test(trimmed)) {
        return <h4 key={i} className={`${isFirst ? "!mt-0" : "mt-5"} mb-1 font-semibold`} style={isFirst ? { marginTop: 0, color: '#fff', fontSize: '0.95rem' } : { color: '#fff', fontSize: '0.95rem' }}>{processInline(trimmed.replace(/\*\*/g, ''))}</h4>;
      }
      const listMatch = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
      if (listMatch) {
        const listText = listMatch[1].trim();
        const colonIdx = listText.indexOf(':');
        if (colonIdx !== -1 && colonIdx < 65) {
          const isBoldLabel = listText.startsWith('**');
          const isPlainLabel = /^[A-Z][^.!?]*:/.test(listText);
          if (isBoldLabel || isPlainLabel) {
            return <div key={i} className={`${isFirst ? "!mt-0" : "mt-4"} mb-2`} style={isFirst ? { marginTop: 0 } : {}}>{processInline(listText)}</div>;
          }
        }
        const isNumbered = /^\s*\d+\.\s/.test(line);
        if (isNumbered) {
          return (
            <div key={i} className="flex gap-2 mb-2 ms-1">
              <span className="font-semibold text-[0.9rem]" style={{ color: 'var(--color-palm-400)' }}>{line.match(/^\s*(\d+\.)/)?.[1]}</span>
              <div className="flex-1 text-[0.9rem]" style={{ color: 'var(--color-text-primary)' }}>{processInline(listText)}</div>
            </div>
          );
        }
        return <li key={i}>{processInline(listText)}</li>;
      }
      if (trimmed === '') return <div key={i} className="h-3" />;
      return <p key={i}>{processInline(line)}</p>;
    });
  };

  const processInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      return <span key={i}>{part}</span>;
    });
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

  return (
    <div className="flex h-screen text-white overflow-hidden" style={{ fontFamily: 'var(--font-body)', background: 'transparent' }}>
      
      {/* ════════ SIDEBAR ════════ */}
      <aside 
        className="sidebar-container h-full flex-none flex flex-col z-20 overflow-hidden" 
        style={{ width: isSidebarOpen ? 280 : 0, minWidth: isSidebarOpen ? 280 : 0 }}
      >
        <div className="px-5 pt-7 pb-6">
          <div className="flex items-center justify-between group">
            <span className="whitespace-nowrap flex items-center gap-1.5 uppercase app-logo">
              <span className="kiadp-text">KIADP</span> <span className="ai-highlight">AI</span>
            </span>
            <button 
              onClick={handleNewChat} 
              title={t.newChat} 
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all outline-none"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="sidebar-section-label">{t.recent}</div>
          {sessions.map((s) => (
            <div 
              key={s.id} 
              onClick={() => { navigate(`/knowledge/chat/${s.id}`); setMenuOpenId(null); }} 
              className={`sidebar-item group relative flex items-center cursor-pointer ${urlSessionId === s.id ? 'active' : ''}`}
            >
              <svg className="w-4 h-4 flex-shrink-0 opacity-30 me-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
              <div className="flex-1 min-w-0">
                {editingTitleId === s.id ? (
                  <input 
                    autoFocus 
                    value={editingTitleValue} 
                    onChange={(e) => setEditingTitleValue(e.target.value)} 
                    onKeyDown={(e) => { if (e.key === 'Enter') saveRename(s.id, editingTitleValue); }} 
                    className="w-full text-[13px] font-medium bg-transparent border-b border-white/20 outline-none" 
                  />
                ) : (
                  <>
                    <p className="text-[13px] font-medium truncate" style={{ color: urlSessionId === s.id ? '#fff' : 'var(--color-text-secondary)' }}>{s.title}</p>
                    <p className="text-[11px] mt-0.5 opacity-40">{timeAgo(s.updatedAt)}</p>
                  </>
                )}
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} 
                className="absolute end-2 opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-500/10 rounded transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/5">
           <button
            onClick={() => navigate('/knowledge/settings')}
            className="w-full flex items-center gap-3 p-2 rounded-xl transition-all group hover:bg-white/5"
            title={t.profileSettings}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 overflow-hidden" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff' }}>
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.fullName} className="w-full h-full object-cover" />
              ) : (
                user?.fullName?.charAt(0) || t.user.charAt(0)
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-medium truncate text-white/80 group-hover:text-white transition-colors">{user?.fullName}</p>
              <p className="text-[11px] truncate opacity-40">{user?.email}</p>
            </div>
          </button>
          
          <button 
            onClick={logout} 
            className="w-full mt-2 flex items-center justify-center gap-2 py-2 text-[10px] font-semibold uppercase tracking-widest text-white/40 hover:text-red-500 transition-all"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            {t.signOut}
          </button>
        </div>

        {/* Global Sidebar Background Leaf */}
        <img 
          src="/leaf.png" 
          alt={t.sidebarBg} 
          className="absolute -bottom-16 -right-16 w-72 h-72 object-contain opacity-[0.03] pointer-events-none" 
          style={{ transform: 'rotate(180deg)', zIndex: 0 }}
        />
      </aside>

      {/* ════════ MAIN AREA ════════ */}
      <main className="flex-1 flex flex-col relative overflow-hidden" style={{ background: 'transparent' }}>
        
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-4 z-30 border-b border-white/5">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-white/40 hover:text-white transition-colors">
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {isSidebarOpen
                  ? <><path d="M3 3h7v18H3z" /><path d="M14 6h7M14 12h7M14 18h7" /></>
                  : <><path d="M4 6h16M4 12h16M4 18h16" /></>
                }
              </svg>
            </button>
            <span 
              className="text-[13px] font-medium truncate cursor-pointer transition-colors hover:text-white" 
              style={{ color: 'var(--color-text-secondary)', maxWidth: '60vw' }}
              onClick={() => urlSessionId && startRename(urlSessionId, activeSession?.title || '')}
            >
              {activeSession?.title || t.appName}
            </span>
          </div>

          <div className="relative">
            <button onClick={() => setIsLanguageMenuOpen(!isLanguageMenuOpen)} className="px-3 py-1.5 rounded-lg flex items-center gap-2 text-[11px] font-semibold border border-white/10 bg-white/5 text-white/60">
              {lang.toUpperCase()}
              <svg className={`w-3 h-3 transition-transform ${isLanguageMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {isLanguageMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsLanguageMenuOpen(false)} />
                <div className="absolute top-full end-0 mt-2 w-32 bg-[#0f110c] border border-white/10 rounded-xl overflow-hidden z-50 shadow-2xl animate-fade-in">
                  {['en', 'ar'].map(l => (
                    <button key={l} onClick={() => { setLanguage(l as any); setIsLanguageMenuOpen(false); }} className="w-full text-left px-4 py-2.5 text-[12px] font-medium hover:bg-white/5 transition-colors border-b last:border-0 border-white/5">
                      {l === 'en' ? 'English' : 'العربية'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </header>

        {/* ── Chat Messages ── */}
        <div className={`flex-1 overflow-y-auto ${messages.length === 0 ? 'relative flex overflow-x-hidden' : ''}`}>
          <div className={`max-w-3xl mx-auto px-6 py-8 space-y-6 w-full ${messages.length === 0 ? 'h-full flex flex-col items-center justify-center relative' : ''}`}>
            
            {messages.length === 0 && (
               <>
                 {/* ── Background Planet Animation ── */}
                 <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="planet-container">
                      <div className="planet-glow-side" />
                    </div>
                 </div>

                 <div className="flex flex-col items-center justify-center animate-fade-in text-center relative z-10 w-full">
                   <div className="orbit-wrapper orbit-hero">
                     <div className="sphere sphere-1" />
                     <div className="sphere sphere-2" />
                     <div className="sphere sphere-3" />
                   </div>
                   <h2 className="premium-title mb-4">{t.howCanIHelp}</h2>
                   <p className="text-white/40 text-[14px] max-w-sm mb-8">{t.heroSubtitle}</p>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                     {[t.prompt1, t.prompt2].map((p, i) => (
                       <button 
                         key={i} 
                         onClick={() => setQuery(p)} 
                         className="text-start p-4 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/30 hover:text-white text-white/60 text-[13px] transition-all"
                       >
                         {p}
                       </button>
                     ))}
                   </div>
                 </div>
               </>
            )}

            {messages.map((m) => (
              <div key={m.id} className="animate-slide-in">
                {m.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] px-5 py-3.5 rounded-2xl rounded-tr-md text-[14px]" style={{ background: '#1a3a2a', color: '#d1fae5', lineHeight: 1.65 }}>
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-4">
                    <div className="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center mt-1 flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="prose prose-invert prose-emerald max-w-none prose-p:leading-relaxed prose-p:my-0 text-[0.95rem]" style={{ color: 'var(--color-text-primary)' }}>
                        {formatContent(m.content)}
                      </div>
                      {m.images && m.images.length > 0 && (
                        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {m.images.map(img => (
                            <div key={img.id} onClick={() => setSelectedImage(img)} className="group relative rounded-2xl overflow-hidden border border-white/5 cursor-zoom-in transition-all hover:border-green-500/30">
                              <img src={img.url} className="w-full h-auto max-h-[300px] object-cover bg-black/20" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                                <p className="text-[10px] text-white/90 line-clamp-2 leading-relaxed">{img.description}</p>
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-[8px] font-bold uppercase tracking-tighter text-green-400">PAGE {img.pageNumber}</span>
                                  <span className="text-[8px] text-white/40 uppercase tracking-widest bg-white/10 px-1.5 py-0.5 rounded">Click to enlarge</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {m.sources && m.sources.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                           {m.sources.slice(0, 3).map(s => (
                             <div key={s.id} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-[11px] text-white/40 font-mono transition-colors hover:border-green-500/20 hover:text-green-400">
                               {s.sourceDocument.title} · p.{s.pageNumber}
                             </div>
                           ))}
                        </div>
                      )}
                      <button onClick={() => openThread(m)} className="deep-dive-btn" style={{ color: m.thread && m.thread.length > 1 ? '#22c55e' : '' }}>
                         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                         {t.deepDive} ✦ {m.thread && m.thread.length > 1 ? `(${m.thread.length-1})` : ''}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-3 ms-11 opacity-40">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[12px] font-medium tracking-wide uppercase">{t.thinking}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── Input Bar ── */}
        <div className="p-6">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="glow-prompt-bar">
              <div className="glow-border-layer" />
              <div className="glow-border-layer-reverse" />
              <div className="inner-bar px-4 py-2">
                <span className="sparkle-icon">✦</span>
                <input 
                  ref={mainInputRef} 
                  value={query} 
                  onChange={(e) => setQuery(e.target.value)} 
                  placeholder={t.askQuestion} 
                  disabled={loading} 
                  className="flex-1 bg-transparent border-none outline-none text-[15px] p-3 text-white placeholder-white/30" 
                />
                <button 
                  disabled={!query.trim() || loading} 
                  className="ask-ai-btn disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                >
                  {t.askAi} ✦
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Image Lightbox ── */}
        {selectedImage && (
          <Portal>
            <div 
              className="fixed inset-0 z-[999] bg-[#000000ef] flex items-center justify-center p-8 backdrop-blur-sm animate-fade-in" 
              onClick={() => setSelectedImage(null)}
            >
              <div className="relative max-w-[95vw] max-h-[95vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                <img 
                  src={selectedImage.url} 
                  className="w-full h-full object-contain rounded-lg shadow-2xl" 
                  style={{ transform: `scale(${zoomScale})`, transition: 'transform 0.2s ease' }}
                />
                <div className="absolute top-4 right-4 flex gap-2">
                   <button onClick={() => setZoomScale(prev => Math.min(prev + 0.2, 3))} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-md">
                     <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                   </button>
                   <button onClick={() => setZoomScale(prev => Math.max(prev - 0.2, 0.5))} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-md">
                     <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg>
                   </button>
                   <button onClick={() => setSelectedImage(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-md">
                     <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                   </button>
                </div>
                <div className="mt-6 text-center max-w-2xl px-4 animate-fade-in">
                  <p className="text-white text-lg font-medium leading-relaxed">{selectedImage.description}</p>
                  <p className="text-white/40 text-xs mt-2 uppercase tracking-widest font-bold">Document Source · Page {selectedImage.pageNumber}</p>
                </div>
              </div>
            </div>
          </Portal>
        )}
      </main>

      {/* ── Deep Dive Panel ── */}
      <div className={`thread-overlay ${activeThreadId ? 'open' : ''}`} onClick={() => setActiveThreadId(null)} />
      <div className={`thread-panel ${activeThreadId ? 'open' : ''}`}>
          <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-500/10 text-green-500">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-white">General Knowledge</h3>
            </div>
            <button onClick={() => setActiveThreadId(null)} className="text-white/20 hover:text-white transition-colors p-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {threadMessages.map(m => (
              <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-slide-in`}>
                <div className={`max-w-[90%] p-4 rounded-2xl text-[0.95rem] leading-relaxed ${m.role === 'user' ? 'bg-[#1a3a2a] text-[#d1fae5]' : 'bg-white/5 border border-white/5 text-gray-200'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {isThreadLoading && (
              <div className="flex items-center gap-2 text-white/20 text-xs ms-2 animate-pulse">
                <div className="w-1 h-1 rounded-full bg-white/40" />
                Searching Web...
              </div>
            )}
            <div ref={threadEndRef} />
          </div>
          <div className="p-6 border-t border-white/5 bg-black/20">
            <form onSubmit={handleThreadSubmit} className="relative">
              <input 
                value={threadQuery} 
                onChange={e => setThreadQuery(e.target.value)} 
                className="w-full bg-white/5 rounded-xl px-4 py-3 outline-none border border-white/10 text-white placeholder-white/20 pr-12 focus:border-green-500/30 transition-all" 
                placeholder="Ask follow up..." 
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </form>
          </div>
      </div>
    </div>
  );
}
