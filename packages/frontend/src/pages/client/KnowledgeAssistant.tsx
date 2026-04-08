import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const t = translations[lang];
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  // Deep Dive Threading
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null); // Message ID
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadQuery, setThreadQuery] = useState('');
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ url: string; description: string; pageNumber: number } | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;
  const messages = activeSession?.messages || [];

  useEffect(() => {
    const saved = localStorage.getItem('khalifa_all_sessions');
    let initialSessions: ChatSession[] = [];
    if (saved) {
      try {
        initialSessions = JSON.parse(saved);
      } catch (e) { console.error('Failed load', e); }
    }

    // Start with a new chat ONLY if there isn't already an empty "New Chat" at the top
    const firstSession = initialSessions[0];
    const isFirstEmpty = firstSession && firstSession.messages.length === 0 && firstSession.title === t.newChat;

    if (isFirstEmpty) {
      setSessions(initialSessions);
      setActiveSessionId(firstSession.id);
    } else {
      const newId = Date.now().toString();
      const newSession: ChatSession = { id: newId, title: t.newChat, messages: [], updatedAt: Date.now() };
      setSessions([newSession, ...initialSessions]);
      setActiveSessionId(newId);
    }
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('khalifa_all_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages, isThreadLoading]);

  const handleNewChat = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = { id: newId, title: t.newChat, messages: [], updatedAt: Date.now() };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);
    setQuery('');
  };

  const deleteSession = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMenuOpenId(null);
    const filtered = sessions.filter(s => s.id !== id);
    setSessions(filtered);
    if (activeSessionId === id || filtered.length === 0) {
      if (filtered.length > 0) setActiveSessionId(filtered[0].id);
      else handleNewChat();
    }
  };

  const startRename = (id: string, currentTitle: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMenuOpenId(null);
    setEditingTitleId(id);
    setEditingTitleValue(currentTitle);
  };

  // ── Thread Handlers ──
  const openThread = (msg: Message) => {
    setActiveThreadId(msg.id);
    
    // If it's the first time opening this message's thread, we can auto-fill the query
    if (!msg.thread) {
      setThreadMessages([msg]);
      
      // If the answer was ungrounded, auto-fill the general question from the preceding user message
      if (msg.isGrounded === false) {
        const session = sessions.find(s => s.id === activeSessionId);
        if (session) {
          const msgIdx = session.messages.findIndex(m => m.id === msg.id);
          const userQuery = msgIdx > 0 ? session.messages[msgIdx - 1].content : '';
          
          let autoFillText = `Could you please provide a general scientific explanation for this question? I am specifically interested in how it relates to the Red Palm Weevil context mentioned in the documents.\n\nQuestion: ${userQuery}`;
          
          // Optionally add context snippets to help the general AI stay on topic
          if (msg.sources && msg.sources.length > 0) {
            autoFillText += "\n\nRelevant Context from PDF for reference:";
            msg.sources.slice(0, 2).forEach((s, idx) => {
              autoFillText += `\n- "${s.excerpt.substring(0, 150)}..."`;
            });
          }
          
          setThreadQuery(autoFillText);
        } else {
          setThreadQuery('');
        }
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
      if (s.id !== activeSessionId) return s;
      return {
        ...s,
        messages: s.messages.map(m =>
          m.id === msgId ? { ...m, thread: fullThread } : m
        )
      };
    }));
  };

  const handleThreadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadQuery.trim() || isThreadLoading || !activeThreadId) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: threadQuery };
    const currentQuery = threadQuery;
    const newThreadBeforeResponse = [...threadMessages, userMessage];
    setThreadMessages(newThreadBeforeResponse);
    setThreadQuery('');
    setIsThreadLoading(true);

    try {
      // Get only the roles/contents for historical context
      const history = threadMessages.map(m => ({ role: m.role, content: m.content }));
      const { data } = await apiClient.post('/knowledge/ask', {
        question: currentQuery,
        history,
        language: lang,
        mode: 'general'
      });
      const resultObj = data.data;
      const assistantMessage: Message = { id: resultObj.answerId, role: 'assistant', content: resultObj.answerText, isGrounded: false };
      const finalizedThread = [...newThreadBeforeResponse, assistantMessage];
      setThreadMessages(finalizedThread);
      persistThread(activeThreadId, finalizedThread);
    } catch (err) {
      console.error(err);
    } finally {
      setIsThreadLoading(true); // Small delay feel
      setTimeout(() => setIsThreadLoading(false), 300);
    }
  };

  const saveRename = (id: string, newTitle: string) => {
    if (newTitle.trim()) {
      setSessions(prev => prev.map(s =>
        s.id === id ? { ...s, title: newTitle.trim() } : s
      ));
    }
    setEditingTitleId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !activeSessionId) return;
    const currentQuery = query;
    setQuery('');
    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: currentQuery };
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        // Only set the title from query if it's the very first message AND the title is still default.
        const title = (s.messages.length === 0 && s.title === t.newChat)
          ? (currentQuery.length > 50 ? currentQuery.substring(0, 50) + '…' : currentQuery)
          : s.title;
        return { ...s, title, messages: [...s.messages, userMessage], updatedAt: Date.now() };
      }
      return s;
    }));
    setLoading(true);
    try {
      const history = messages.slice(-5).map(m => ({ role: m.role, content: m.content }));
      const { data } = await apiClient.post('/knowledge/ask', {
        question: userMessage.content,
        history,
        language: lang
      });
      const { answerId, answerText, isGrounded, sources, images } = data.data;
      const assistantMessage: Message = { id: answerId, role: 'assistant', content: answerText, isGrounded, sources, images };
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) return { ...s, messages: [...s.messages, assistantMessage], updatedAt: Date.now() };
        return s;
      }));
    } catch (err: any) {
      console.error(err);
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) return { ...s, messages: [...s.messages, { id: 'err-' + Date.now(), role: 'assistant' as const, content: t.errorGeneric }] };
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
      // Handle all header levels: ####, ###, ##, #
      const headerMatch = line.match(/^(#{1,4})\s+(.*)$/);
      if (headerMatch) {
        return <h3 key={i} className={isFirst ? "!mt-0" : ""} style={isFirst ? { marginTop: 0 } : {}}>{processInline(headerMatch[2])}</h3>;
      }

      const trimmed = line.trim();

      // If it's just a bold label acting as a header on its own line
      if (/^(\*\*)?[A-Z][^.!?]*:(\*\*)?$/.test(trimmed)) {
        return <h4 key={i} className={`${isFirst ? "!mt-0" : "mt-5"} mb-1 font-semibold`} style={isFirst ? { marginTop: 0, color: '#fff', fontSize: '0.95rem' } : { color: '#fff', fontSize: '0.95rem' }}>{processInline(trimmed.replace(/\*\*/g, ''))}</h4>;
      }

      // Check for bullet points AND numbered lists, absorbing leading/extra spaces
      const listMatch = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
      if (listMatch) {
        const listText = listMatch[1].trim();
        const colonIdx = listText.indexOf(':');

        // If the list item starts with a short label ending in a colon, remove the list styling and treat as labeled text
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
        {/* Branding */}
        <div className="px-5 pt-7 pb-6">
          <div className="flex items-center justify-between group">
            <div className="flex items-center">
              <span className="whitespace-nowrap flex items-center gap-1.5 uppercase app-logo">
                <span className="kiadp-text">KIADP</span> <span className="ai-highlight">AI</span>
              </span>
            </div>

            <button
              onClick={handleNewChat}
              title={t.newChat}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all outline-none"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="sidebar-section-label">{t.recent}</div>
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => { setActiveSessionId(s.id); setMenuOpenId(null); }}
              className={`sidebar-item group relative flex items-center cursor-pointer ${activeSessionId === s.id ? 'active' : ''}`}
            >
              <svg className="w-4 h-4 flex-shrink-0 opacity-30 me-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
              <div className="flex-1 min-w-0">
                {editingTitleId === s.id ? (
                  <div className="flex w-full items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editingTitleValue}
                      onChange={(e) => setEditingTitleValue(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') saveRename(s.id, editingTitleValue);
                        if (e.key === 'Escape') {
                          setEditingTitleValue(s.title);
                          setEditingTitleId(null);
                        }
                      }}
                      className="w-full text-[13px] font-medium bg-transparent border-b outline-none"
                      style={{ color: '#fff', borderColor: '#22c55e' }}
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); saveRename(s.id, editingTitleValue); }}
                      className="p-1 rounded text-green-500 hover:bg-green-500/20 flex-shrink-0 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-[13px] font-medium truncate" style={{ color: activeSessionId === s.id ? '#fff' : 'var(--color-text-secondary)' }}>{s.title}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{timeAgo(s.updatedAt)}</p>
                  </>
                )}
              </div>
              {/* Three-dot menu */}
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === s.id ? null : s.id); }}
                className="absolute end-2 opacity-0 group-hover:opacity-100 p-1 rounded-md transition-opacity"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
              </button>
              {/* Dropdown menu */}
              {menuOpenId === s.id && (
                <div
                  className="absolute end-2 top-10 w-36 rounded-lg py-1 z-50 shadow-xl"
                  style={{ background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-hover)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => startRename(s.id, s.title, e)}
                    className="w-full text-start px-3 py-2 text-[12px] font-medium flex items-center gap-2 transition-colors"
                    style={{ color: 'var(--color-text-secondary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    {t.rename}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                    className="w-full text-start px-3 py-2 text-[12px] font-medium flex items-center gap-2 transition-colors"
                    style={{ color: '#ef4444' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                    {t.delete}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* User profile */}
        <div className="p-4" style={{ borderTop: '1px solid var(--color-border-default)' }}>
          <button
            onClick={() => navigate('/knowledge/settings')}
            className="w-full flex items-center gap-3 p-2 rounded-xl transition-all group"
            style={{ background: 'transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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
              <p className="text-[13px] font-medium truncate group-hover:text-white transition-colors">{user?.fullName}</p>
              <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{user?.email}</p>
            </div>
            <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: 'var(--color-text-muted)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>

          <button
            onClick={logout}
            className="w-full mt-1 flex items-center justify-center gap-2 py-2 text-[10px] font-semibold uppercase tracking-widest transition-all"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
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
        <header className="h-14 flex items-center justify-between px-4 flex-none z-30" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-overlay)', e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent', e.currentTarget.style.color = 'var(--color-text-muted)')}
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {isSidebarOpen
                  ? <><path d="M3 3h7v18H3z" /><path d="M14 6h7M14 12h7M14 18h7" /></>
                  : <><path d="M4 6h16M4 12h16M4 18h16" /></>
                }
              </svg>
            </button>
            {/* Editable title */}
            {editingTitleId === activeSessionId && activeSessionId ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={editingTitleValue}
                  onChange={(e) => setEditingTitleValue(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') saveRename(activeSessionId, editingTitleValue);
                    if (e.key === 'Escape') {
                      setEditingTitleValue(activeSession?.title || '');
                      setEditingTitleId(null);
                    }
                  }}
                  className="text-[13px] font-medium bg-transparent border-b outline-none transition-all"
                  style={{ color: '#fff', borderColor: '#22c55e', width: `${Math.max(250, editingTitleValue.length * 7.5)}px`, maxWidth: '60vw' }}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); saveRename(activeSessionId, editingTitleValue); }}
                  className="p-1.5 rounded-md text-green-400 hover:bg-green-500/20 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
              </div>
            ) : (
              <span
                className="text-[13px] font-medium truncate whitespace-nowrap cursor-pointer transition-colors hover:text-[var(--color-palm-400)]"
                style={{ color: 'var(--color-text-secondary)', maxWidth: '60vw' }}
                onClick={() => activeSession && startRename(activeSession.id, activeSession.title)}
                title="Click to rename"
              >
                {activeSession?.title || t.appName}
              </span>
            )}
          </div>

          {/* Premium Language Dropdown */}
          <div className="relative z-50 flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setIsLanguageMenuOpen(!isLanguageMenuOpen); }}
                className="px-3 py-1.5 rounded-lg flex items-center gap-2 text-[11px] font-semibold border transition-all cursor-pointer"
                style={{
                  background: 'var(--color-surface-raised)',
                  borderColor: isLanguageMenuOpen ? 'var(--color-palm-500)' : 'var(--color-border-default)',
                  color: isLanguageMenuOpen ? '#fff' : 'var(--color-text-muted)'
                }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                {lang.toUpperCase()}
                <svg className={`w-3 h-3 transition-transform ${isLanguageMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
              </button>

              {isLanguageMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsLanguageMenuOpen(false)} />
                  <div className="absolute top-full end-0 mt-2 w-32 rounded-xl overflow-hidden shadow-2xl z-50 animate-fade-in"
                    style={{ background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-hover)' }}>
                    {[
                      { code: 'en', label: 'English' },
                      { code: 'ar', label: 'العربية' },
                    ].map((lng) => (
                      <button
                        key={lng.code}
                        onClick={() => {
                          setLanguage(lng.code as any);
                          setIsLanguageMenuOpen(false);
                        }}
                        className="w-full text-start px-4 py-2.5 text-[12px] font-medium transition-colors border-b last:border-0 border-white/5 cursor-pointer"
                        style={{
                          color: lang === lng.code ? '#22c55e' : 'var(--color-text-secondary)',
                          background: lang === lng.code ? 'rgba(34,197,94,0.05)' : 'transparent'
                        }}
                        onMouseEnter={(e) => { if (lang !== lng.code) e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={(e) => { if (lang !== lng.code) e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                      >
                        {lng.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
          </div>
        </header>

        {/* Messages */}
        <div className={`flex-1 z-10 ${messages.length === 0 ? 'overflow-hidden' : 'overflow-y-auto'}`} style={{ overflowX: 'hidden' }}>
          <div className={`max-w-3xl mx-auto px-6 py-8 space-y-6 ${messages.length === 0 ? 'h-full flex flex-col items-center justify-center pt-0' : ''}`}>

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center animate-fade-in relative w-full">
                {/* ── Background Planet Animation ── */}
                <div className="planet-container">
                  <div className="planet-glow-side" />
                </div>

                {/* ── Orbiting Spheres Animation ── */}
                <div className="orbit-wrapper orbit-hero relative z-10 scale-75 sm:scale-100">
                  <div className="sphere sphere-1" />
                  <div className="sphere sphere-2" />
                  <div className="sphere sphere-3" />
                </div>
                <h2 className="premium-title mb-6 text-center relative z-10">
                  {t.howCanIHelp}
                </h2>
                <p className="text-center mb-10 max-w-md relative z-10" style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, opacity: 0.8 }}>
                  {t.heroSubtitle}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg relative z-10">
                  {[
                    t.prompt1,
                    t.prompt2,
                  ].map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(s)}
                      className="text-start p-4 rounded-xl text-[13px] font-medium transition-all"
                      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(34,197,94,0.3)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className="animate-slide-in">
                {msg.role === 'user' ? (
                  /* ── User message ── */
                  <div className="flex justify-end">
                    <div className="max-w-[80%] px-5 py-3.5 rounded-2xl rounded-tr-md text-[14px]"
                      style={{ background: '#1a3a2a', color: '#d1fae5', lineHeight: 1.65 }}>
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  /* ── Assistant message ── */
                  <div className="flex gap-4">
                    <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-1" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.2)' }}>
                      <svg className="w-3.5 h-3.5" style={{ color: '#22c55e' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="prose prose-invert prose-emerald max-w-none prose-p:leading-relaxed prose-p:my-0" 
                        style={{ color: 'var(--color-text-primary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                        {formatContent(msg.content)}
                      </div>

                      {/* Display Relevant Images from Knowledge Base */}
                      {msg.images && msg.images.length > 0 && (
                        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {msg.images.map((img) => (
                            <div 
                              key={img.id} 
                              onClick={() => setSelectedImage(img)}
                              className="group relative rounded-2xl overflow-hidden border border-white/5 transition-all hover:border-[var(--color-palm-400)] cursor-zoom-in"
                            >
                              <img 
                                src={img.url} 
                                alt={img.description} 
                                className="w-full h-auto object-cover max-h-[300px] bg-black/20"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                                <p className="text-[10px] text-white/90 line-clamp-2 leading-relaxed">{img.description}</p>
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-[8px] font-bold uppercase tracking-tighter text-[var(--color-palm-400)]">PAGE {img.pageNumber}</span>
                                  <span className="text-[8px] text-white/40 uppercase tracking-widest bg-white/10 px-1.5 py-0.5 rounded">Click to enlarge</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.isGrounded !== false && msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {msg.sources.slice(0, 3).map((source) => {
                            const pdfUrl = source.sourceDocument.storedFilename
                              ? uploadUrl(source.sourceDocument.storedFilename)
                              : undefined;
                            const Tag = pdfUrl ? 'a' : 'div';
                            const linkProps = pdfUrl ? { href: pdfUrl, target: '_blank' as const, rel: 'noopener noreferrer' } : {};
                            return (
                              <Tag
                                key={source.id}
                                {...linkProps}
                                className="group relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors no-underline cursor-pointer"
                                border-style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}
                                onMouseEnter={(e: any) => { e.currentTarget.style.borderColor = 'rgba(34,197,94,0.25)'; e.currentTarget.style.color = '#22c55e'; }}
                                onMouseLeave={(e: any) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                              >
                                <svg className="w-3 h-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                                {source.sourceDocument.title} · p.{source.pageNumber}
                                {pdfUrl && (
                                  <svg className="w-3 h-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
                                )}

                                {/* Tooltip */}
                                <div className="absolute bottom-full start-0 mb-2 w-72 p-4 rounded-xl text-[12px] leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none"
                                  style={{ background: 'var(--color-surface-overlay)', border: '1px solid var(--color-border-hover)', color: 'var(--color-text-secondary)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', fontFamily: 'var(--font-body)' }}>
                                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#22c55e' }}>{t.excerpt}</div>
                                  "{source.excerpt}"
                                </div>
                              </Tag>
                            );
                          })}
                        </div>
                      )}

                      {/* Deep Dive Button */}
                      <button
                        onClick={() => openThread(msg)}
                        className="deep-dive-btn"
                        title="Search General Knowledge"
                        style={{ color: msg.thread && msg.thread.length > 1 ? '#22c55e' : '' }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                        {t.deepDive} ✦ {msg.thread && msg.thread.length > 1 ? `(${msg.thread.length - 1})` : ''}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-4 animate-fade-in items-center">
                <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
                  <div className="orbit-wrapper scale-[0.32] origin-center">
                    <div className="sphere sphere-1" />
                    <div className="sphere sphere-2" />
                    <div className="sphere sphere-3" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="text-[13px] font-medium tracking-tight" style={{ color: 'var(--color-text-muted)' }}>
                    {t.thinking}
                  </span>
                  {/* Minimalist animated dots */}
                  <span className="inline-flex gap-0.5">
                    <span className="w-0.5 h-0.5 rounded-full bg-white/30 animate-pulse" />
                    <span className="w-0.5 h-0.5 rounded-full bg-white/30 animate-pulse delay-75" />
                    <span className="w-0.5 h-0.5 rounded-full bg-white/30 animate-pulse delay-150" />
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── Input ── */}
        <div className="flex-none px-6 pb-6 pt-2 z-10">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="glow-prompt-bar mx-auto">
              <div className="glow-border-layer" />
              <div className="glow-border-layer-reverse" />
              <div className="inner-bar">
                <span className="sparkle-icon">✦</span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading}
                  placeholder={t.askQuestion}
                  className="flex-1 text-[15px] text-[#f4f4f5] bg-transparent border-none outline-none"
                  style={{ fontFamily: 'var(--font-body)' }}
                />
                <button
                  type="submit"
                  disabled={!query.trim() || loading}
                  className="ask-ai-btn disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {t.askAi} ✦
                </button>
              </div>
            </form>
            <p className="text-center mt-3 text-[11px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
              {t.footerNote}
            </p>
          </div>
        </div>

        {/* ── Deep Dive Thread Panel ── */}
        <div className={`thread-overlay ${activeThreadId ? 'open' : ''}`} onClick={() => setActiveThreadId(null)} />
        <div className={`thread-panel ${activeThreadId ? 'open' : ''} flex flex-col`}>
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-500/10 text-green-500">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
              </div>
              <h3 className="text-[11px] font-bold text-white tracking-widest uppercase">{t.deepDiveMode}</h3>
            </div>
            <button onClick={() => setActiveThreadId(null)} className="p-2 text-white/40 hover:text-white transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {threadMessages.map((m, i) => (
              <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[95%] px-5 py-2.5 rounded-2xl leading-relaxed ${m.role === 'user' ? 'bg-green-600/10 text-green-100 border border-green-500/10 text-[13px]' : 'bg-white/5 text-gray-200 border border-white/5'}`}>
                  <div className="prose prose-invert prose-emerald max-w-none prose-p:leading-relaxed prose-p:my-0" 
                    style={{ 
                      fontSize: '1rem', 
                      lineHeight: 1.8, 
                      fontFamily: 'var(--font-ai)', 
                      fontWeight: 450 
                    }}>
                    {formatContent(m.content)}
                  </div>
                </div>
              </div>
            ))}
            {isThreadLoading && (
              <div className="flex gap-3 items-center opacity-50">
                <div className="orbit-wrapper scale-[0.2] origin-center">
                  <div className="sphere sphere-1" />
                  <div className="sphere sphere-2" />
                  <div className="sphere sphere-3" />
                </div>
                <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest animate-pulse">{t.searching}</span>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>

          <div className="p-6 border-t border-white/5">
            <form onSubmit={handleThreadSubmit} className="glow-prompt-bar">
              <div className="glow-border-layer" />
              <div className="inner-bar p-2.5">
                <input
                  value={threadQuery}
                  onChange={(e) => setThreadQuery(e.target.value)}
                  placeholder={t.askFollowUp}
                  className="flex-1 bg-transparent border-none outline-none text-[13px] text-white"
                />
                <button type="submit" disabled={!threadQuery.trim() || isThreadLoading} className="ask-ai-btn py-1.5 px-4 text-[11px]">
                  {t.askAi} ✦
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* ════════ IMAGE LIGHTBOX ════════ */}
      {selectedImage && (
        <Portal id="modal-root">
          <div 
            className="fixed inset-0 z-[100] flex flex-col bg-black/95 animate-fade-in backdrop-blur-md overflow-hidden"
            onWheel={(e) => {
              if (e.deltaY < 0) setZoomScale(s => Math.min(s + 0.1, 3));
              else setZoomScale(s => Math.max(s - 0.1, 0.5));
            }}
          >
            {/* Header Controls */}
            <div className="flex-none p-4 flex items-center justify-between z-[110] bg-gradient-to-b from-black/60 to-transparent">
              <div className="flex items-center gap-4">
                <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold tracking-widest text-[#22c55e] uppercase">
                  Page {selectedImage.pageNumber}
                </div>
                <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
                  <button 
                    onClick={() => setZoomScale(s => Math.max(s - 0.2, 0.5))}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-all"
                    title="Zoom Out"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                  <span className="text-[10px] font-mono w-10 text-center text-white/40">{Math.round(zoomScale * 100)}%</span>
                  <button 
                    onClick={() => setZoomScale(s => Math.min(s + 0.2, 3))}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-all"
                    title="Zoom In"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                  <button 
                    onClick={() => setZoomScale(1)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-all border-l border-white/5 ms-1"
                    title="Reset Zoom"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                  </button>
                </div>
              </div>

              <button 
                onClick={() => { setSelectedImage(null); setZoomScale(1); }}
                className="p-2.5 rounded-full bg-white/5 hover:bg-white/20 text-white transition-all hover:rotate-90 border border-white/10"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            
            {/* Image Container (Scrollable) */}
            <div 
              className="flex-1 overflow-auto flex items-center justify-center p-8 custom-scrollbar"
              onClick={() => { setSelectedImage(null); setZoomScale(1); }}
            >
              <div 
                className="relative transition-transform duration-200 ease-out shadow-2xl rounded-lg"
                style={{ transform: `scale(${zoomScale})` }}
                onClick={e => e.stopPropagation()}
              >
                <img 
                  src={selectedImage.url} 
                  alt={selectedImage.description} 
                  className="max-w-[85vw] max-h-[70vh] w-auto h-auto object-contain rounded-lg animate-scale-in"
                />
              </div>
            </div>

            {/* Footer Caption (Fixed at bottom but readable) */}
            {selectedImage.description && (
              <div className="flex-none p-6 pt-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex justify-center">
                <div 
                  className="max-w-3xl w-full px-6 py-4 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/10 text-center animate-slide-up shadow-2xl"
                  onClick={e => e.stopPropagation()}
                >
                  <p className="text-[13px] leading-relaxed text-white/90 font-medium">
                    {selectedImage.description}
                  </p>
                </div>
              </div>
            )}
          </div>
        </Portal>
      )}
    </div>
  );
}
