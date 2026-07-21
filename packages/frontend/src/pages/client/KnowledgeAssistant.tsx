import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { uploadUrl, imageProxyUrl } from '../../api/urls';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useLanguageStore, LANGUAGE_LABELS } from '../../store/languageStore';
import { translations } from '../../i18n/translations';
import Portal from '../../components/Portal';
import ThemeToggle from '../../components/ThemeToggle';
import { VoiceMode, VoiceModeHandle } from '../../components/VoiceMode';
import SettingsPanel from './SettingsPanel';

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
    width?: number | null;
    height?: number | null;
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

/**
 * True when an answer concedes the documents don't cover the question — "the documents
 * list it as a topic but do not explain what it means".
 *
 * Mirrors isCorpusDisclaimer in the backend's qa.service.ts, deliberately. The suggestion
 * to try Deep Dive is interface chrome, not part of the answer: appending it to the answer
 * text server-side made voice mode read "press the button below" out loud, and left it off
 * voice answers entirely once that was suppressed. Rendering it here covers both routes
 * and keeps it out of anything that gets spoken.
 *
 * A corpus noun near a negation. False positives cost one extra suggestion line; a false
 * negative leaves a student stuck at an answer that told them it had nothing for them.
 */
const admitsMissingSource = (text: string): boolean =>
  /(document|source|material|text|context|file|pdf|slide|content|مستند|وثائق|مصادر|النص|ලේඛන|ලිපි|මූලාශ්‍ර|ஆவண|ஆதார|மூல)/i.test(text)
  && /(\bnot\b|n't\b|\bno\b|\bnever\b|\bwithout\b|\black\b|\bunable\b|\bfail(s|ed)? to\b|لا|ليس|لم|غير|නොමැත|නැත|නොවේ|නොකර|இல்லை|இல்ல)/i.test(text);

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
  const [isHeaderRenaming, setIsHeaderRenaming] = useState(false);
  const [sidebarVisibleCount, setSidebarVisibleCount] = useState(10);
  
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadQuery, setThreadQuery] = useState('');
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ id: string; url: string; description: string; pageNumber: number; width?: number | null; height?: number | null } | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'connecting'|'ready'|'listening'|'speaking'|'thinking'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [pendingVoiceText, setPendingVoiceText] = useState<string | null>(null);
  const [promptSuggestions, setPromptSuggestions] = useState<string[]>([]);
  const voiceFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!isVoiceModeOpen) { setIsMuted(false); setPendingVoiceText(null); }
  }, [isVoiceModeOpen]);

  useEffect(() => {
    apiClient.get('/documents/suggestions')
      .then((res: { data: { data: string[] } }) => {
        const all = res.data.data;
        if (all.length === 0) { setPromptSuggestions([]); return; }
        // Pick 2 random distinct suggestions on each page load
        const shuffled = [...all].sort(() => Math.random() - 0.5);
        setPromptSuggestions(shuffled.slice(0, 2));
      })
      .catch(() => setPromptSuggestions([]));
  }, []);

  const voiceModeRef = useRef<VoiceModeHandle>(null);
  // Tracks the session created by voice (so transcripts go somewhere even without URL session)
  const voiceSessionIdRef = useRef<string | null>(null);
  const lastVoiceUserMsgIdRef = useRef<string | null>(null);
  const lastVoiceAssistantMsgIdRef = useRef<string | null>(null);
  // Tracks the first user message ID in this voice session (for auto-titling)
  const firstVoiceUserMsgIdRef = useRef<string | null>(null);
  const suppressVoiceCloseNavigateRef = useRef(false);
  useEffect(() => {
    if (!isVoiceModeOpen && voiceSessionIdRef.current) {
      // Voice mode just closed — navigate to the voice session so the chat stays visible
      const vsid = voiceSessionIdRef.current;
      const hadUserMessage = !!firstVoiceUserMsgIdRef.current; // capture before clearing
      voiceSessionIdRef.current = null;
      lastVoiceUserMsgIdRef.current = null;
      lastVoiceAssistantMsgIdRef.current = null;
      firstVoiceUserMsgIdRef.current = null;
      // If the user never spoke, discard the session entirely (don't pollute history)
      if (!hadUserMessage) {
        setSessions(prev => prev.filter(s => s.id !== vsid));
        suppressVoiceCloseNavigateRef.current = false;
        return;
      }
      if (suppressVoiceCloseNavigateRef.current) {
        suppressVoiceCloseNavigateRef.current = false;
        return;
      }
      if (!urlSessionId) navigate(`/knowledge/chat/${vsid}`, { replace: true });
    } else if (!isVoiceModeOpen) {
      suppressVoiceCloseNavigateRef.current = false;
      voiceSessionIdRef.current = null;
      lastVoiceUserMsgIdRef.current = null;
      lastVoiceAssistantMsgIdRef.current = null;
      firstVoiceUserMsgIdRef.current = null;
    }
  }, [isVoiceModeOpen]);

  const handleTranscript = (role: 'user' | 'assistant', text: string) => {
    // Commit refs BEFORE the empty-text guard so a no-op call like ('user','') can
    // still reset lastVoiceAssistantMsgIdRef (used by VoiceMode to force a fresh bubble
    // for tool answers instead of relying on in-place update of the filler bubble).
    if (role === 'user') lastVoiceAssistantMsgIdRef.current = null;
    if (role === 'assistant') lastVoiceUserMsgIdRef.current = null;
    if (!text.trim()) return;
    const targetId = urlSessionId || voiceSessionIdRef.current;
    if (!targetId) {
      // No active session — create one for this voice conversation
      const newId = `voice-${Date.now()}`;
      voiceSessionIdRef.current = newId;
      const msgId = `vm-${Date.now()}`;
      if (role === 'user') { lastVoiceUserMsgIdRef.current = msgId; firstVoiceUserMsgIdRef.current = msgId; }
      if (role === 'assistant') lastVoiceAssistantMsgIdRef.current = msgId;
      const firstMsg: Message = { id: msgId, role, content: text };
      // Do NOT navigate here — navigating triggers a separate React render batch
      // where urlSessionId updates before setSessions commits, blanking the chat.
      // voiceSessionIdRef is used for rendering instead; we navigate on voice close.
      setSessions(prev => [{ id: newId, title: role === 'user' ? text.substring(0, 100) : 'Voice session', messages: [firstMsg], updatedAt: Date.now() }, ...prev]);
      return;
    }
    // User: update existing live message in-place (so speech appears live), or append if new turn
    if (role === 'user' && lastVoiceUserMsgIdRef.current) {
      const liveId = lastVoiceUserMsgIdRef.current;
      const isFirstVoiceMsg = liveId === firstVoiceUserMsgIdRef.current;
      setSessions(prev => prev.map(s => {
        if (s.id !== targetId) return s;
        const exists = s.messages.some(m => m.id === liveId);
        if (!exists) return s;
        return { ...s, ...(isFirstVoiceMsg && { title: text.substring(0, 100) }), messages: s.messages.map(m => m.id === liveId ? { ...m, content: text } : m), updatedAt: Date.now() };
      }));
      return;
    }
    // Assistant: update existing live bubble in-place (streaming transcript)
    if (role === 'assistant' && lastVoiceAssistantMsgIdRef.current) {
      const liveId = lastVoiceAssistantMsgIdRef.current;
      setSessions(prev => prev.map(s => {
        if (s.id !== targetId) return s;
        const exists = s.messages.some(m => m.id === liveId);
        if (!exists) return s;
        return { ...s, messages: s.messages.map(m => m.id === liveId ? { ...m, content: text } : m), updatedAt: Date.now() };
      }));
      return;
    }
    const msgId = `vm-${Date.now()}`;
    if (role === 'user') lastVoiceUserMsgIdRef.current = msgId;
    if (role === 'assistant') lastVoiceAssistantMsgIdRef.current = msgId;
    const isFirstVoiceUser = role === 'user' && !firstVoiceUserMsgIdRef.current;
    if (isFirstVoiceUser) firstVoiceUserMsgIdRef.current = msgId;
    // When appending a new assistant bubble, strip any leftover filler messages
    // (e.g. "let me check that for you") so they don't clutter the chat.
    const fillerRx = /^\s*(let me (check|look|search|find)|one moment|sure[,!]?\s*(let me|i['\u2019]ll)\s*(check|look|search))/i;
    setSessions(prev => prev.map(s => {
      if (s.id !== targetId) return s;
      const msgs = role === 'assistant'
        ? s.messages.filter(m => !(m.role === 'assistant' && fillerRx.test(m.content?.trim() ?? '')))
        : s.messages;
      return { ...s, ...(isFirstVoiceUser && { title: text.substring(0, 100) }), messages: [...msgs, { id: msgId, role, content: text }], updatedAt: Date.now() };
    }));
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mainInputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const institutionName = user?.tenantName || '';

  // Keep local chat history isolated per logged-in user account.
  const storageScope = user ? `${user.role.toLowerCase()}_${user.id}` : 'guest';
  const sessionsIndexKey = `eduai_sessions_index_${storageScope}`;
  const sessionMessagesKey = (sessionId: string) => `eduai_session_${storageScope}_${sessionId}`;

  // Active session logic — during voice mode, use voiceSessionIdRef (no URL navigation while voice is active)
  const effectiveSessionId = urlSessionId || (isVoiceModeOpen ? voiceSessionIdRef.current : null);
  const activeSession = effectiveSessionId 
    ? (sessions.find(s => s.id === effectiveSessionId) || null)
    : { id: 'new', title: t.newChat, messages: [], updatedAt: Date.now() };
  
  const messages = activeSession?.messages || [];
  // 1. Initial Load — metadata only (lazy: messages loaded on demand)
  useEffect(() => {
    setSessions([]);
    const savedIndex = localStorage.getItem(sessionsIndexKey);
    if (savedIndex) {
      try {
        const metas: { id: string; title: string; updatedAt: number }[] = JSON.parse(savedIndex);
        setSessions(metas.map(m => ({ ...m, messages: [] })));
      } catch (e) { console.error(e); }
    }
  }, [sessionsIndexKey]);

  // 2a. Persist session index (metadata only — fast, tiny payload)
  useEffect(() => {
    if (sessions.length === 0) return;
    localStorage.setItem(sessionsIndexKey, JSON.stringify(
      sessions.map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
    ));
  }, [sessions, sessionsIndexKey]);

  // 2b. Persist active session messages (writes only the one active session)
  useEffect(() => {
    const sid = urlSessionId || (isVoiceModeOpen ? voiceSessionIdRef.current : null);
    if (!sid) return;
    const active = sessions.find(s => s.id === sid);
    if (!active || active.messages.length === 0) return;
    localStorage.setItem(sessionMessagesKey(sid), JSON.stringify(active.messages));
  }, [sessions, urlSessionId, isVoiceModeOpen, storageScope]);

  // 2c. Lazy-load session messages on navigate (only when messages not yet in memory)
  useEffect(() => {
    if (!urlSessionId) return;
    const session = sessions.find(s => s.id === urlSessionId);
    if (!session || session.messages.length > 0) return; // not in index or already loaded
    const saved = localStorage.getItem(sessionMessagesKey(urlSessionId));
    if (!saved) return;
    try {
      const msgs: Message[] = JSON.parse(saved);
      setSessions(prev => prev.map(s => s.id === urlSessionId ? { ...s, messages: msgs } : s));
    } catch (e) { console.error(e); }
  }, [urlSessionId, sessions, storageScope]);

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
    if (isVoiceModeOpen) {
      suppressVoiceCloseNavigateRef.current = true;
      voiceModeRef.current?.stop();
      setIsVoiceModeOpen(false);
    }
    navigate('/knowledge');
    setQuery('');
  };

  const deleteSession = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMenuOpenId(null);
    const filtered = sessions.filter(s => s.id !== id);
    setSessions(filtered);
    localStorage.removeItem(sessionMessagesKey(id));
    if (urlSessionId === id) {
      handleNewChat();
    }
  };

  const startRename = (id: string, currentTitle: string, source: 'sidebar' | 'header' = 'sidebar', e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMenuOpenId(null);
    setEditingTitleId(id);
    setEditingTitleValue(currentTitle);
    setIsHeaderRenaming(source === 'header');
  };

  const saveRename = (id: string, newTitle: string) => {
    if (newTitle.trim()) {
      setSessions(prev => prev.map(s =>
        s.id === id ? { ...s, title: newTitle.trim() } : s
      ));
    }
    setEditingTitleId(null);
    setIsHeaderRenaming(false);
  };

  const openThread = (msg: Message) => {
    setActiveThreadId(msg.id);
    setThreadQuery('');

    // Reopening a thread that already ran: show what it found, don't ask again.
    if (msg.thread) {
      setThreadMessages(msg.thread);
      return;
    }

    setThreadMessages([msg]);
    // Deep Dive is opened to get a broader answer to the question already asked, so ask it.
    // Previously the question was only pre-filled into the follow-up box, and only when the
    // answer came back ungrounded — so in the commoner case, where the documents mention
    // the topic without explaining it, the panel opened empty and the question had to be
    // typed out a second time to get the thing the button exists to provide.
    //
    // Search backwards for the last thing the USER said, rather than taking whatever sits
    // directly above the answer. In a voice session the assistant interjects filler —
    // "Sure, looking that up now." — between the question and the answer, and taking the
    // previous message blindly sent that filler to Deep Dive, which duly replied
    // "You're welcome!".
    const idx = messages.findIndex(m => m.id === msg.id);
    const question = idx > 0
      ? messages.slice(0, idx).reverse().find(m => m.role === 'user')?.content?.trim()
      : undefined;
    if (question) runThreadQuery(question, [msg], msg.id);
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

  // Takes the thread it should build on as an argument rather than reading state, so that
  // openThread can run a query in the same tick it seeds the panel — state set moments
  // earlier is not visible here yet.
  const runThreadQuery = async (question: string, baseThread: Message[], threadId: string) => {
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: question };
    const newThread = [...baseThread, userMsg];
    setThreadMessages(newThread);
    setIsThreadLoading(true);

    try {
      const history = baseThread.map(m => ({ role: m.role, content: m.content }));
      const { data } = await apiClient.post('/knowledge/ask', {
        question,
        history,
        language: lang,
        mode: 'general'
      });
      const assistantMsg: Message = { id: data.data.answerId, role: 'assistant', content: data.data.answerText, isGrounded: false };
      const finalized = [...newThread, assistantMsg];
      setThreadMessages(finalized);
      persistThread(threadId, finalized);
    } catch (err) {
      console.error(err);
    } finally {
      setIsThreadLoading(false);
    }
  };

  const handleThreadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadQuery.trim() || isThreadLoading || !activeThreadId) return;
    const currentQ = threadQuery;
    setThreadQuery('');
    runThreadQuery(currentQ, threadMessages, activeThreadId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    // When voice session is active, send text to the voice AI instead of the REST endpoint
    if (isVoiceModeOpen) {
      setPendingVoiceText(query);
      setQuery('');
      return;
    }

    const currentQ = query;
    setQuery('');
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: currentQ };
    
    let targetId = urlSessionId;

    if (!targetId) {
      const newId = Date.now().toString();
      const newSession: ChatSession = { id: newId, title: currentQ.substring(0, 200), messages: [userMsg], updatedAt: Date.now() };
      setSessions(prev => [newSession, ...prev]);
      // Persist synchronously before navigate — route change unmounts this component,
      // so the useEffect persists would never run for this new session otherwise.
      const existingIndex: { id: string; title: string; updatedAt: number }[] =
        JSON.parse(localStorage.getItem(sessionsIndexKey) || '[]');
      localStorage.setItem(sessionsIndexKey, JSON.stringify(
        [{ id: newId, title: newSession.title, updatedAt: newSession.updatedAt }, ...existingIndex]
      ));
      localStorage.setItem(sessionMessagesKey(newId), JSON.stringify([userMsg]));
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
        return <h4 key={i} className={`${isFirst ? "!mt-0" : "mt-5"} mb-1 font-semibold`} style={isFirst ? { marginTop: 0, color: 'var(--t-ink)', fontSize: '0.95rem' } : { color: 'var(--t-ink)', fontSize: '0.95rem' }}>{processInline(trimmed.replace(/\*\*/g, ''))}</h4>;
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
              <span className="font-semibold text-[0.9rem]" style={{ color: 'var(--t-accent)' }}>{line.match(/^\s*(\d+\.)/)?.[1]}</span>
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
    <div className="flex h-screen text-ink overflow-hidden" style={{ fontFamily: 'var(--font-body)', background: 'transparent' }}>
      <aside className="sidebar-container h-full flex-none flex flex-col z-20 overflow-hidden" style={{ width: isSidebarOpen ? 280 : 0 }}>
        <div className="px-5 pt-7 pb-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="whitespace-nowrap flex items-center gap-1.5 uppercase app-logo">
                {/* .kiadp-text paints a white→grey gradient into the glyphs, which is invisible
                    on a light sidebar; re-point it at the ink tokens so it follows the theme. */}
                <span className="kiadp-text" style={{ backgroundImage: 'linear-gradient(to bottom, var(--t-ink), var(--t-ink-soft))' }}>Edu</span><span className="ai-highlight">AI</span>
              </span>
              {(user?.tenantLogoUrl || institutionName) && (
                <div className="flex items-center gap-2 mt-2">
                  {user?.tenantLogoUrl && (
                    <img src={user.tenantLogoUrl} alt={institutionName} className="h-6 w-auto object-contain rounded" />
                  )}
                  {institutionName && (
                    <span className="text-[10px] font-bold text-ink-soft tracking-wide truncate max-w-[140px]">{institutionName}</span>
                  )}
                </div>
              )}
            </div>
            <button onClick={handleNewChat} title={t.newChat} className="p-1.5 rounded-lg text-ink-mute hover:text-ink hover:bg-overlay transition-all">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto px-3 pb-4"
          onScroll={(e) => {
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
            if (scrollHeight - scrollTop - clientHeight < 80) {
              setSidebarVisibleCount(prev => Math.min(prev + 10, sessions.length));
            }
          }}
        >
          <div className="sidebar-section-label">{t.recent}</div>
          {[...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, sidebarVisibleCount).map((s) => (
            <div key={s.id} onClick={() => navigate(`/knowledge/chat/${s.id}`)} className={`sidebar-item group relative flex items-center cursor-pointer ${urlSessionId === s.id ? 'active' : ''}`}>
              <svg className="w-4 h-4 flex-shrink-0 opacity-30 me-3" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
              <div className="flex-1 min-w-0">
                {editingTitleId === s.id && !isHeaderRenaming ? (
                  <input autoFocus value={editingTitleValue} onChange={(e) => setEditingTitleValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveRename(s.id, editingTitleValue); }} className="w-full text-[13px] bg-transparent border-b outline-none text-ink" />
                ) : (
                  <>
                    <p className="text-[13px] font-medium truncate" style={{ color: urlSessionId === s.id ? 'var(--t-ink)' : 'var(--color-text-secondary)' }}>{s.title}</p>
                    <p className="text-[11px] mt-0.5 opacity-40">{timeAgo(s.updatedAt)}</p>
                  </>
                )}
              </div>
              <div className="relative">
                <button 
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === s.id ? null : s.id); }} 
                  className="opacity-0 group-hover:opacity-100 p-1 text-ink-mute hover:text-ink rounded transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                </button>
                {menuOpenId === s.id && (
                  <div className="absolute end-0 top-full mt-1 w-32 bg-raised border border-line rounded-xl overflow-hidden z-50 shadow-lg animate-fade-in">
                    <button onClick={(e) => { e.stopPropagation(); startRename(s.id, s.title, 'sidebar'); }} className="w-full text-left px-4 py-2.5 text-[12px] font-medium text-ink hover:bg-overlay transition-colors border-b border-line-soft">
                      {t.rename || 'Rename'}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="w-full text-left px-4 py-2.5 text-[12px] font-medium hover:bg-red-500/10 text-red-600 transition-colors">
                      {t.delete || 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {sidebarVisibleCount < sessions.length && (
            <p className="text-center text-[11px] text-ink-faint py-2">Scroll for more</p>
          )}
        </div>

        <div className="p-4 border-t border-line-soft space-y-2">
          {/* User card → navigates to settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-overlay border border-transparent hover:border-line transition-all group text-left"
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
              {user?.avatarUrl
                ? <img src={user.avatarUrl} alt={user?.fullName} className="w-full h-full object-cover" />
                : user?.fullName?.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-ink truncate leading-none">{user?.fullName}</p>
              <p className="text-[10px] text-ink-faint truncate mt-0.5">{user?.email}</p>
            </div>
            <svg className="w-3.5 h-3.5 text-ink-faint group-hover:text-ink-mute transition-colors flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
          </button>

          <button onClick={logout} className="w-full flex items-center justify-center gap-2 py-2 text-[10px] font-semibold uppercase tracking-widest text-ink-faint hover:text-red-500 transition-all">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            {t.signOut}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden h-full">
        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
        {messages.length === 0 && (
           <div className="absolute inset-x-0 bottom-0 h-full overflow-hidden pointer-events-none z-0">
              {/* ── Background Planet Animation ── */}
              {/* .planet-container fills the disc with a literal #0a0b0d, which is a huge black
                  circle on a light page. Repaint it from the surface token so it stays a glow. */}
              <div className="planet-container" style={{ bottom: '30%', background: 'radial-gradient(circle at 50% 10%, rgba(34, 197, 94, 0.06) 0%, transparent 40%), var(--t-surface)' }}>
                <div className="planet-glow-side" />
              </div>
           </div>
        )}
        <header className="h-14 flex items-center justify-between px-4 z-30 border-b border-line bg-transparent">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-ink-mute hover:text-ink">
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            {editingTitleId === urlSessionId && isHeaderRenaming ? (
              <div className="flex items-center gap-2 w-1/2">
                <input 
                  autoFocus 
                  value={editingTitleValue} 
                  onChange={(e) => setEditingTitleValue(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter') saveRename(urlSessionId, editingTitleValue); }} 
                  className="text-[14px] font-medium bg-transparent border-b border-line-strong outline-none text-ink w-full py-0.5" 
                />
                <button
                  onClick={() => saveRename(urlSessionId, editingTitleValue)}
                  className="p-1 rounded bg-green-500/10 text-accent hover:bg-green-500/20 transition-all flex-none"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                </button>
              </div>
            ) : (
              <span 
                className="text-[13px] font-medium cursor-pointer hover:text-ink transition-colors truncate max-w-[250px]" 
                onClick={() => urlSessionId && startRename(urlSessionId, activeSession?.title || '', 'header')}
              >
                {activeSession?.title}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
          <div className="relative">
            <button onClick={() => setIsLanguageMenuOpen(!isLanguageMenuOpen)} className="px-3 py-1.5 rounded-lg flex items-center gap-2 text-[11px] font-semibold border border-line bg-raised text-ink-soft">
              {lang.toUpperCase()}
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {isLanguageMenuOpen && (
              <div className="absolute top-full end-0 mt-2 w-36 bg-raised border border-line rounded-xl overflow-hidden z-50 shadow-lg">
                {(['en', 'ar', 'si', 'ta'] as const).map(l => (
                  <button key={l} onClick={() => { setLanguage(l); setIsLanguageMenuOpen(false); }} className="w-full text-left px-4 py-2 text-[12px] text-ink hover:bg-overlay transition-colors">
                    {LANGUAGE_LABELS[l]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ThemeToggle />
          </div>
        </header>

        <div className={`flex-1 overflow-y-auto ${messages.length === 0 ? 'relative flex flex-col items-center justify-center overflow-x-hidden' : ''}`}>
          
          <div className={`max-w-3xl mx-auto px-6 py-8 space-y-6 w-full ${messages.length === 0 ? 'relative z-10' : ''}`}>
            {messages.length === 0 && (
                 <div className="flex flex-col items-center justify-center animate-fade-in text-center w-full">
                   <div className="orbit-wrapper orbit-hero">
                     <div className="sphere sphere-1" />
                     <div className="sphere sphere-2" />
                     <div className="sphere sphere-3" />
                   </div>
                   {/* .premium-title clips a white→slate→green gradient into the glyphs; the first
                       two stops vanish on a light page, so drive the ramp from the ink tokens. */}
                   <h2 className="premium-title mb-4" style={{ backgroundImage: 'linear-gradient(135deg, var(--t-ink) 0%, var(--t-ink-soft) 40%, var(--t-accent) 100%)' }}>{t.howCanIHelp}</h2>
                   <p className="text-ink-mute text-[14px] max-w-sm mb-8">{t.heroSubtitle}</p>
                   {promptSuggestions.length > 0 && (
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                       {promptSuggestions.map((p, i) => (
                         <button key={i} onClick={() => setQuery(p)} className="text-start p-4 rounded-xl bg-raised border border-line hover:border-green-500/30 hover:text-ink text-ink-soft text-[13px] transition-all">{p}</button>
                       ))}
                     </div>
                   )}
                 </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'gap-4'}`}>
                {m.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center mt-1">
                    <svg className="w-3.5 h-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  </div>
                )}
                {/* User bubble: a translucent brand tint rather than a fixed dark green, so it
                    reads as pale mint on the light page and as a soft wash on the dark one. */}
                <div className={`max-w-[85%] ${m.role === 'user' ? 'bg-emerald-500/10 border border-emerald-500/20 text-ink px-5 py-3.5 rounded-2xl rounded-tr-md' : 'flex-1'}`}>
                  <div className="prose prose-invert prose-emerald text-[0.9rem] leading-relaxed">
                    {formatContent(m.content)}
                  </div>
                  {m.isGrounded !== false && m.images && m.images.length > 0 && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {m.images.map(img => (
                        <div key={img.id} onClick={() => { setSelectedImage(img); setZoomScale(1); }} className="group relative rounded-xl overflow-hidden border border-line-soft cursor-zoom-in">
                          <img src={imageProxyUrl(img.id)}
                               className="w-full h-auto object-contain"
                               style={img.width && img.height ? { aspectRatio: `${img.width} / ${img.height}` } : undefined} />
                          <div className="absolute inset-0 bg-scrim opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                            {/* Sits on the scrim, which is dark in both themes — hence white, not ink. */}
                            <p className="text-[10px] text-white line-clamp-1">{img.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                       {m.sources.slice(0, 3).map(s => (
                         <div key={s.id} className="px-3 py-1 rounded-lg bg-raised border border-line-soft text-[10px] text-ink-mute">
                           {s.sourceDocument.title} · p.{s.pageNumber}
                         </div>
                       ))}
                    </div>
                  )}
                  {m.role === 'assistant' && !/^\s*(let me (check|look|search|find)|one moment|sure[,!]?\s*(let me|i['\u2019]ll)\s*(check|look|search))/i.test(m.content?.trim() ?? '') && (
                    <>
                      {admitsMissingSource(m.content ?? '') && !m.thread && (
                        <div className="mt-4 text-[12px] leading-relaxed text-ink-mute">
                          💡 {t.deepDiveHint}
                        </div>
                      )}
                      <button onClick={() => openThread(m)} className="mt-4 deep-dive-btn">
                        {t.deepDive} ✦ {m.thread && m.thread.length > 1 ? `(${m.thread.length-1})` : ''}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-3 ms-2 animate-fade-in py-2">
                <div className="orbit-wrapper !w-6 !h-6 !mt-0 opacity-60">
                  <div className="sphere sphere-1 !w-5 !h-5 !shadow-[0_0_10px_rgba(34,197,94,0.3)]" />
                  <div className="sphere sphere-2 !w-5 !h-5 !shadow-[0_0_10px_rgba(240,185,41,0.3)]" />
                  <div className="sphere sphere-3 !w-5 !h-5 !shadow-none opacity-50" />
                </div>
                <div className="text-ink-mute text-[12px] font-medium tracking-wide animate-pulse">{t.thinking}...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="p-6">
          <div className="max-w-3xl mx-auto">
            <form ref={voiceFormRef} onSubmit={handleSubmit} className="glow-prompt-bar">
              <div className="glow-border-layer" />
              {/* .inner-bar is filled with a literal near-black; drive it from the tokens instead
                  so the prompt bar is a white card in light and unchanged in dark. */}
              <div className="inner-bar px-4" style={{ background: 'var(--t-raised)', borderColor: 'var(--t-line)' }}>
                {isVoiceModeOpen ? (
                  /* ── Voice active: status strip + live textarea ── */
                  <div className="flex flex-col flex-1 gap-1.5 py-2">
                    {/* Status strip */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {voiceStatus === 'thinking' ? (
                          // Thinking = 3 amber dots pulsing like ellipsis
                          [0,1,2].map(i => (
                            <div
                              key={i}
                              className="w-1.5 h-1.5 rounded-full bg-amber-500"
                              style={{ animation: `pulse 0.6s ease-in-out ${i * 0.2}s infinite alternate` }}
                            />
                          ))
                        ) : (
                          [0, 1, 2, 3].map(i => (
                            <div
                              key={i}
                              className={`rounded-full transition-all duration-300 ${
                                isMuted
                                  ? 'w-1.5 bg-amber-500/60'
                                  : voiceStatus === 'speaking'
                                  ? 'w-1.5 bg-accent'
                                  : voiceStatus === 'connecting'
                                  ? 'w-1.5 bg-line-strong'
                                  : 'w-1.5 bg-accent/70'
                              }`}
                              style={{
                                height: voiceStatus === 'speaking' ? `${8 + Math.sin(i * 1.2) * 6}px` : '6px',
                                animation: !isMuted && (voiceStatus === 'listening' || voiceStatus === 'speaking')
                                  ? `pulse 0.8s ease-in-out ${i * 0.15}s infinite alternate`
                                  : 'none',
                              }}
                            />
                          ))
                        )}
                      </div>

                      <span className="flex-1 text-xs font-medium text-ink-mute">
                        {isMuted ? 'Muted — mic off'
                          : voiceStatus === 'thinking' ? 'Checking knowledge base…'
                          : voiceStatus === 'connecting' ? 'Connecting…'
                          : voiceStatus === 'listening' ? 'Listening…'
                          : voiceStatus === 'speaking' ? 'Speaking…'
                          : 'Voice ready'}
                      </span>

                      {/* Mute / Unmute toggle */}
                      <button
                        type="button"
                        onClick={() => setIsMuted(m => !m)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                          isMuted
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 hover:bg-amber-500/20'
                            : 'bg-raised border-line text-ink-mute hover:text-ink-soft hover:bg-overlay'
                        }`}
                        title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                      >
                        {isMuted ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <line x1="2" y1="2" x2="22" y2="22" />
                            <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 4.93M15 9.34V5a3 3 0 0 0-5.68-1.33M9 9v3a3 3 0 0 0 5.12 2.12" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                          </svg>
                        )}
                        {isMuted ? 'Unmute' : 'Mute'}
                      </button>

                      {/* End voice session */}
                      <button
                        type="button"
                        onClick={() => voiceModeRef.current?.stop()}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 hover:bg-red-500/20 transition-all text-xs font-semibold"
                        title="End voice session"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        End
                      </button>
                    </div>

                    {/* Typing area — sends typed text to the voice AI as context */}
                    <div className="flex items-end gap-2">
                      <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e as any);
                          }
                        }}
                        placeholder="Type to add context or ask a follow-up…"
                        rows={1}
                        className="flex-1 bg-transparent border-none outline-none text-[15px] py-1 resize-none max-h-24 text-ink placeholder:text-ink-faint"
                      />
                      {/* .ask-ai-btn colours its label with the ink token, which is dark navy in
                          light — but the button itself is always the green gradient. */}
                      <button disabled={!query.trim()} className="ask-ai-btn" style={{ color: '#fff' }}>Send</button>
                    </div>
                  </div>
                ) : (
                  /* ── Normal text input ── */
                  <>
                    <span className="text-accent/50 text-sm">✦</span>
                    <textarea
                      ref={mainInputRef as any}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit(e as any);
                        }
                      }}
                      placeholder={t.askQuestion}
                      disabled={loading}
                      rows={query.split('\n').length > 5 ? 5 : Math.max(1, query.split('\n').length)}
                      className="flex-1 bg-transparent border-none outline-none text-[15px] p-3 resize-none max-h-48 text-ink placeholder:text-ink-faint"
                    />
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsVoiceModeOpen(true)}
                        className="p-2.5 rounded-xl text-accent/70 hover:text-accent hover:bg-green-500/10 transition-all"
                        title="Live Voice Mode"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 18.5V23M8 23h8"/>
                        </svg>
                      </button>
                      <button disabled={!query.trim() || loading} className="ask-ai-btn" style={{ color: '#fff' }}>{t.askAi}</button>
                    </div>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>

        <VoiceMode
          ref={voiceModeRef}
          isOpen={isVoiceModeOpen}
          onClose={() => setIsVoiceModeOpen(false)}
          onStatusChange={setVoiceStatus}
          apiKey={import.meta.env.VITE_GEMINI_API_KEY || ""}
          language={lang}
          institutionName={institutionName || ''}
          chatMessages={messages}
          isMuted={isMuted}
          pendingClientText={pendingVoiceText}
          onClientTextSent={() => setPendingVoiceText(null)}
          onTranscript={handleTranscript}
          onAiVolume={(v) => {
            const el = voiceFormRef.current;
            if (!el) return;
            if (v < 0.02) {
              el.style.boxShadow = '';
              return;
            }
            // Gradient glow: white-mint hot core → bright #4ade80 → mid #22c55e → soft ambient bloom
            // All layers must be lighter than background so the gradient is visible
            el.style.boxShadow = [
              `0 0 ${3 + v * 5}px 1px rgba(200,255,220,${0.6 + v * 0.4})`,              // white-mint hot core
              `0 0 ${6 + v * 9}px ${1 + v * 2}px rgba(74,222,128,${0.5 + v * 0.4})`,   // #4ade80 bright green
              `0 0 ${11 + v * 12}px ${1 + v * 2}px rgba(34,197,94,${0.25 + v * 0.25})`, // #22c55e mid
              `0 0 ${16 + v * 16}px rgba(74,222,128,${0.05 + v * 0.1})`,                // soft ambient bloom
            ].join(',');
          }}
          onImages={(imgs) => {
            // Attach images to the current live assistant voice bubble
            const targetId = urlSessionId || voiceSessionIdRef.current;
            const liveId = lastVoiceAssistantMsgIdRef.current;
            if (!targetId || !liveId) return;
            setSessions(prev => prev.map(s => {
              if (s.id !== targetId) return s;
              return { ...s, messages: s.messages.map(m =>
                m.id === liveId ? { ...m, images: imgs } : m
              ), updatedAt: Date.now() };
            }));
          }}
        />

        {/* Lightbox / Tooltips etc omitted for brevity or re-implementing if needed */}
        {selectedImage && (
          <Portal>
            {/* The lightbox stays dark in both themes — a page image is judged against black,
                not against the app surface — so its chrome is deliberately white, not ink. */}
            <div className="fixed inset-0 z-[999] bg-black/95 flex items-center justify-center backdrop-blur-sm animate-fade-in"
                 onClick={() => { setSelectedImage(null); setZoomScale(1); }}
                 onWheel={e => { e.preventDefault(); setZoomScale(s => Math.min(5, Math.max(0.5, s + (e.deltaY > 0 ? -0.15 : 0.15)))); }}>
              <div className="relative max-w-[92vw] max-h-[92vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                {/* Zoom controls */}
                <div className="absolute top-3 right-3 z-10 flex gap-2">
                  <button onClick={() => setZoomScale(s => Math.min(5, s + 0.25))}
                          className="w-8 h-8 rounded-full bg-white/10 border border-white/25 text-white flex items-center justify-center hover:bg-white/20 text-lg font-bold">+</button>
                  <button onClick={() => setZoomScale(s => Math.max(0.5, s - 0.25))}
                          className="w-8 h-8 rounded-full bg-white/10 border border-white/25 text-white flex items-center justify-center hover:bg-white/20 text-lg font-bold">&minus;</button>
                  <button onClick={() => setZoomScale(1)}
                          className="px-2 h-8 rounded-full bg-white/10 border border-white/25 text-white/80 flex items-center justify-center hover:bg-white/20 text-xs">Reset</button>
                  <button onClick={() => { setSelectedImage(null); setZoomScale(1); }}
                          className="w-8 h-8 rounded-full bg-white/10 border border-white/25 text-white flex items-center justify-center hover:bg-white/20 text-lg">&times;</button>
                </div>
                <div className="overflow-auto max-w-[90vw] max-h-[80vh] flex items-center justify-center"
                     onWheel={e => { e.stopPropagation(); setZoomScale(s => Math.min(5, Math.max(0.5, s + (e.deltaY > 0 ? -0.15 : 0.15)))); }}>
                  <img src={imageProxyUrl(selectedImage.id)}
                       className="rounded-lg shadow-2xl transition-transform duration-150"
                       style={{ transform: `scale(${zoomScale})`, transformOrigin: 'center center',
                                maxWidth: zoomScale <= 1 ? '90vw' : 'none', maxHeight: zoomScale <= 1 ? '75vh' : 'none' }}
                       draggable={false} />
                </div>
                <div className="mt-3 text-center">
                  <p className="text-white font-medium text-sm">{selectedImage.description}</p>
                  <p className="text-white/60 text-xs mt-1 uppercase tracking-widest">Page {selectedImage.pageNumber}{zoomScale !== 1 ? ` · ${Math.round(zoomScale * 100)}%` : ''}</p>
                </div>
              </div>
            </div>
          </Portal>
        )}
      </main>

      {/* Deep Dive Panel */}
      <div className={`thread-overlay ${activeThreadId ? 'open' : ''}`} onClick={() => setActiveThreadId(null)} />
      {/* .thread-panel is painted near-black with a white hairline and a heavy black shadow;
          all three come from the tokens here so the panel is a white sheet under light. */}
      <div className={`thread-panel ${activeThreadId ? 'open' : ''}`}
           style={{ background: 'var(--t-raised)', borderLeftColor: 'var(--t-line)', boxShadow: '-20px 0 60px rgba(15, 23, 42, 0.12)' }}>
          <div className="p-6 border-b border-line-soft flex justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-accent">{t.deepDive} Mode</h3>
            <button onClick={() => setActiveThreadId(null)} className="text-ink-faint hover:text-ink">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {threadMessages.map(m => (
              <div key={m.id} className={`${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                <div className={`inline-block max-w-[95%] p-4 rounded-2xl ${m.role === 'user' ? 'bg-emerald-500/10 text-ink border border-emerald-500/20' : 'bg-overlay border border-line'}`}>
                  <div className="prose prose-invert prose-emerald text-[0.85rem] leading-relaxed">
                    {formatContent(m.content)}
                  </div>
                </div>
              </div>
            ))}
            {isThreadLoading && <div className="text-ink-faint text-xs animate-pulse">Looking for knowledge from the internet...</div>}
            <div ref={threadEndRef} />
          </div>
          <form onSubmit={handleThreadSubmit} className="p-6 border-t border-line-soft bg-surface">
            <div className="flex gap-2">
              <input 
                value={threadQuery} 
                onChange={e => setThreadQuery(e.target.value)} 
                className="flex-1 bg-raised rounded-xl px-4 py-3 outline-none border border-line text-sm text-ink placeholder:text-ink-faint focus:border-green-500/50 transition-all"
                placeholder="Ask follow up..." 
              />
              <button 
                type="submit" 
                disabled={!threadQuery.trim() || isThreadLoading}
                className="p-3 rounded-xl bg-green-600 text-white hover:bg-green-500 disabled:opacity-30 transition-all shadow-lg shadow-green-900/20"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              </button>
            </div>
          </form>
      </div>
    </div>
  );
}
