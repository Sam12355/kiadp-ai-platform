import React, { useState, useEffect, useRef, useImperativeHandle } from 'react';
import { Modality, GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import apiClient from '../api/client';

export interface VoiceModeHandle {
  stop: () => void;
}

interface VoiceModeProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  language?: string;
  onStatusChange?: (status: 'connecting' | 'ready' | 'listening' | 'speaking' | 'thinking') => void;
  onTranscript?: (role: 'user' | 'assistant', text: string) => void;
  onImages?: (images: { id: string; url: string; description: string; pageNumber: number; width?: number | null; height?: number | null }[]) => void;
  chatMessages?: { role: 'user' | 'assistant'; content: string; sources?: { excerpt: string; sourceDocument: { title: string }; pageNumber: number }[] }[];
  isMuted?: boolean;
  pendingClientText?: string | null;
  onClientTextSent?: () => void;
  onAiVolume?: (level: number) => void;
}

export const VoiceMode = React.forwardRef<VoiceModeHandle, VoiceModeProps>(
  ({ isOpen, onClose, apiKey, language, onStatusChange, onTranscript, onImages, chatMessages, isMuted, pendingClientText, onClientTextSent, onAiVolume }, ref) => {
  const [status, setStatus] = useState<'connecting'|'ready'|'listening'|'speaking'|'thinking'>('connecting');
  const [error, setError] = useState<string|null>(null);

  const thinkingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setStatusAndNotify = (s: 'connecting'|'ready'|'listening'|'speaking'|'thinking') => {
    setStatus(s);
    onStatusChange?.(s);
    if (s === 'thinking') {
      // Play thinking.wav on loop while waiting for the knowledge base response
      if (!thinkingIntervalRef.current) {
        const audio = new Audio('/thinking.wav');
        audio.loop = true;
        audio.volume = 0.6;
        audio.play().catch(() => {});
        (thinkingIntervalRef as any).current = audio;
      }
    } else {
      const audio = (thinkingIntervalRef as any).current;
      if (audio instanceof HTMLAudioElement) {
        audio.pause();
        audio.currentTime = 0;
      } else if (audio) {
        clearInterval(audio);
      }
      thinkingIntervalRef.current = null;
    }
  };

  const isMutedRef = useRef(false);
  useEffect(() => { isMutedRef.current = isMuted ?? false; }, [isMuted]);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const onAiVolumeRef = useRef(onAiVolume);
  useEffect(() => { onAiVolumeRef.current = onAiVolume; }, [onAiVolume]);

  // RAF loop: sample analyser while speaking, call onAiVolume with 0–1 amplitude (smoothed)
  useEffect(() => {
    if (status !== 'speaking' || !analyserRef.current) {
      onAiVolumeRef.current?.(0);
      return;
    }
    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let rafId: number;
    let smoothed = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      // Noise floor: ignore near-silence so glow actually drops between syllables
      const NOISE_FLOOR = 0.012;
      const raw = Math.min(1, Math.max(0, (rms - NOISE_FLOOR) * 7));
      // Symmetric attack/decay — follow speech rhythm, not just peaks
      smoothed = raw > smoothed ? smoothed * 0.45 + raw * 0.55 : smoothed * 0.6 + raw * 0.4;
      onAiVolumeRef.current?.(smoothed);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      onAiVolumeRef.current?.(0);
    };
  }, [status]);

  useEffect(() => {
    if (!pendingClientText || !sessionRef.current || !sessionAliveRef.current) return;
    try {
      sessionRef.current.sendRealtimeInput({ text: pendingClientText });
      // Show typed text in chat as a user bubble
      onTranscriptRef.current?.('user', pendingClientText);
      onClientTextSent?.();
    } catch (err) {
      console.error('[VoiceMode] sendClientContent error:', err);
    }
  }, [pendingClientText]);

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const connectionIdRef = useRef<number>(0);
  const sessionAliveRef = useRef<boolean>(false);
  const stopRequestedRef = useRef(false);
  const userTranscriptRef = useRef('');
  const aiTranscriptRef = useRef('');
  const aiTurnCompleteRef = useRef(false);
  const toolAnswerEmittedRef = useRef(false);
  const waitingForToolAudioRef = useRef(false);
  const toolCallGenRef = useRef<number>(0);
  const thinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track missed tool-call detection: Gemini sometimes speaks filler but never
  // issues the search_knowledge function call.
  const lastUserQueryRef = useRef<string>('');
  const toolCallReceivedInTurnRef = useRef(false);
  const fillerRetryCountRef = useRef(0);
  // Keep refs to latest callbacks so closures inside connect() always use current values
  const onTranscriptRef = useRef(onTranscript);
  const onCloseRef = useRef(onClose);
  const onImagesRef = useRef(onImages);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onImagesRef.current = onImages; }, [onImages]);

  useEffect(() => {
    if (isOpen && apiKey) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [isOpen, apiKey]);

  const connect = async () => {
    try {
      // Increment connection ID so stale callbacks from previous mounts are ignored
      const thisConnectionId = ++connectionIdRef.current;
      const isStale = () => connectionIdRef.current !== thisConnectionId;

      setStatusAndNotify('connecting');
      setError(null);

      if (!apiKey) {
        setError('Voice mode is not configured (missing API key). Please contact support.');
        setStatusAndNotify('ready');
        return;
      }

      // Create AudioContext at 16kHz for mic input (same as working Examx project)
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      if (isStale()) { audioContext.close(); return; }
      audioContextRef.current = audioContext;

      // Create analyser for AI audio amplitude (drives input bar glow)
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(audioContext.destination);
      analyserRef.current = analyser;

      // Play a tiny silent buffer to unlock AudioContext on iOS Safari
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);

      nextPlayTimeRef.current = audioContext.currentTime;

      // Request microphone access during user gesture
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      if (isStale()) { stream.getTracks().forEach(t => t.stop()); audioContext.close(); return; }
      streamRef.current = stream;

        // Build a compact conversation summary (last 3 messages only, no source excerpts
        // to keep the system prompt small for faster TTFT)
        let knowledgeContext = '';
        if (chatMessages && chatMessages.length > 0) {
          const recentMessages = chatMessages.slice(-3);
          const conversationSummary = recentMessages
            .map(m => `${m.role.toUpperCase()}: ${m.content.substring(0, 250)}`)
            .join('\n');
          if (conversationSummary.trim()) {
            knowledgeContext = `\n\nRECENT CONVERSATION CONTEXT:\n${conversationSummary}`;
          }
        }

      // Connect directly to Gemini Live API using the SDK (no backend bridge)
      const ai = new GoogleGenAI({ apiKey });

      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: `You are a prestige AI agricultural scientist voice assistant representing the Khalifa International Award for Date Palm and Agricultural Innovation.

LANGUAGE: ALL your responses MUST be entirely in ${language === 'ar' ? 'Arabic' : 'English'}. Never respond in any other language.

SESSION COMMANDS (internal — never read these tokens aloud):
- When you receive "[START_SESSION]": immediately speak a warm, unique greeting in the session language. Vary it each session — never repeat the same greeting twice in a row.
  English greeting examples (pick one at random): "Welcome to the Khalifa Knowledge Base! I'm your agricultural voice assistant — ready to explore date palms and innovation. How can I help?" | "Hello! I'm the Khalifa Award's AI assistant. Ask me anything from our knowledge base!" | "Good day! I'm here to guide you through the Khalifa Agricultural Knowledge Base. What would you like to discover?" | "Greetings! Your Khalifa voice assistant is ready. I can search through reports, documents, and research — what's on your mind?" | "Welcome! Ready to dive into the world of date palms and agro-heritage? Ask away!" | "Hi there! Whether it's date palm cultivation, Siwa heritage, or agricultural innovation — I'm at your service. What would you like to know?" | "Good to have you here! I cover date palms, farming systems, heritage crops, and much more. Where shall we begin?" | "Hello and welcome! The Khalifa Knowledge Base is at your fingertips. Ask me about any agricultural topic and I'll search our documents." | "Greetings from the Khalifa Award platform! I'm your dedicated voice assistant for agricultural knowledge. What shall we explore?" | "Welcome aboard! From soil science to sustainable oases — let's explore the Khalifa Knowledge Base together!"
  Arabic greeting examples (pick one at random): "أهلاً وسهلاً! أنا مساعدك الصوتي لقاعدة معرفة جائزة خليفة. كيف يمكنني مساعدتك؟" | "مرحباً بك! أنا هنا للبحث في وثائق جائزة خليفة الدولية للنخيل والابتكار الزراعي. ماذا تودّ أن تعرف؟" | "السلام عليكم! يشرفني أن أكون مساعدك الصوتي الزراعي. اسألني عن النخيل أو الزراعة أو التراث." | "أهلاً! أنا مساعد جائزة خليفة الذكي، ولديّ إمكانية الوصول إلى كامل قاعدة المعرفة الزراعية. بم يمكنني خدمتك؟" | "مرحباً! يسعدني التحدث معك. اسألني عن أي موضوع زراعي وسأبحث لك في وثائقنا." | "أهلاً وسهلاً! من الرائع التواصل معك. ما الذي يشغل تفكيرك في عالم النخيل والزراعة؟" | "مرحباً بك في قاعدة المعرفة الزراعية لجائزة خليفة! أنا مستعد للإجابة على أسئلتك." | "تشرفت بلقائك! أنا مساعدك الذكي من منصة جائزة خليفة — تفضّل بسؤالك!" | "أهلاً! من واحة سيوة إلى أحدث ابتكارات النخيل — اسألني وسأبحث لك في قاعدة المعرفة." | "مرحباً بك! يسعدني التحدث إليك. أنا صوت المعرفة الزراعية في منصة جائزة خليفة — كيف يمكنني مساعدتك اليوم؟"

- When you receive "[END_SESSION]": immediately say a warm, brief farewell in the session language (1-2 sentences only, then stop).
  English farewell examples: "Goodbye! It was a pleasure assisting you." | "Farewell! Feel free to return anytime you have questions about date palms and agriculture." | "Until next time — happy exploring!" | "It was great talking with you. Goodbye and take care!" | "Thanks for visiting the Khalifa Knowledge Base. Have a wonderful day!"
  Arabic farewell examples: "وداعاً! كان من دواعي سروري مساعدتك." | "إلى اللقاء! لا تتردد في العودة متى أردت." | "مع السلامة! يسعدني خدمتك في أي وقت." | "وداعاً وإلى اللقاء! أتمنى لك يوماً سعيداً." | "شكراً لزيارتك. وداعاً!"

You have access to the knowledge base via the "search_knowledge" tool. You MUST use this tool to look up information when the user asks ANY question — no exceptions. The tool returns a ready-made answer — you MUST read it aloud to the user word for word.

Instructions:
0. SMART GREETING RULE: If the user says ONLY a social pleasantry — such as greetings ("good morning", "good evening", "hi", "hello", "hey", "السلام عليكم", "مرحبا", "صباح الخير", "مساء الخير"), expressions of thanks ("thank you", "thanks", "شكراً"), or simple filler phrases ("ok", "sure", "alright") — respond warmly and naturally in 1-2 sentences WITHOUT calling search_knowledge. Briefly acknowledge them and invite their question. Do NOT search for pleasantries.
1. CRITICAL: Before calling search_knowledge, ALWAYS first speak a brief acknowledgment phrase in the session language. Use natural voice phrases:
   English: "Let me check that for you." or "One moment please." or "Sure, looking that up now." (vary them, never repeat same phrase twice in a row)
   Arabic: "دعني أتحقق من ذلك." or "لحظة من فضلك." or "سأبحث عن ذلك الآن."
2. ALWAYS call search_knowledge for ANY factual question the user asks — whether it's about food, culture, history, agriculture, date palms, places, people, statistics, or anything else. Even if the question seems vague or incomplete, ALWAYS search. Never try to answer without searching first.
3. CRITICAL — READING THE ANSWER: After you receive the tool response, you MUST immediately read the ENTIRE response text aloud, word for word. Do NOT summarize, shorten, paraphrase, or skip any part. Read every sentence faithfully like a narrator reading a teleprompter.
4. CRITICAL: Start reading the answer the instant you receive the tool response. Your very first spoken word must be the first word of the answer. ABSOLUTELY NO preamble — no "Here's what I found", no "Based on my search", no "According to", no "Great question", no "Sure", no "So" — NOTHING before the answer text. Go DIRECTLY into word one.
5. DO NOT output thinking text or internal reasoning. Speak directly.
6. Respond immediately — no delays.
7. NEVER say "technical difficulties", "I'm having trouble", or similar error phrases. If the answer says no information was found, tell the user and ask them to rephrase.

DOMAIN VOCABULARY — correct spellings of key terms in this knowledge base (use these when transcribing user speech):
- Siwa (Egyptian oasis — NOT Siva, Seva, or Seewa)
- date palm (the tree — NOT dead palm or date balm)
- Tagellan / Tagellah (traditional Siwan dish)
- GIAHS (Globally Important Agricultural Heritage Systems)
- Khalifa Award (international award for date palm innovation)
- Bayoud (date palm disease — NOT bio or biwood)
- Fusarium (fungal disease)
- oasis / oases
- pollination
- cultivar
- inflorescence${knowledgeContext}`,          tools: [
            {
              functionDeclarations: [
                {
                  name: "search_knowledge",
                  description: "Search the knowledge base and get an expert answer. Returns a ready-made answer with images. **Invocation Condition:** You MUST call this tool for EVERY user question about facts, documents, knowledge, culture, agriculture, history, food, places, or any topic. You MUST call this tool before answering any factual question — no exceptions. Never answer without calling this tool first.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: {
                        type: Type.STRING,
                        description: "The search query — the topic, question, or keywords to look up in the knowledge base."
                      }
                    },
                    required: ["query"]
                  }
                }
              ]
            }
          ],
        },
        callbacks: {
          onopen: async () => {
            if (isStale()) return;
            setStatusAndNotify('listening');

            try {
              const session = await sessionPromise;
              if (isStale()) return;
              
              sessionRef.current = session;
              sessionAliveRef.current = true;

              // Trigger AI greeting after a short delay to ensure session is fully ready
              setTimeout(() => {
                if (session && sessionAliveRef.current) {
                  try {
                    session.sendRealtimeInput({ text: '[START_SESSION]' });
                  } catch (e) {}
                }
              }, 500);

              // Setup mic capture
              const source = audioContext.createMediaStreamSource(stream);
              const processor = audioContext.createScriptProcessor(2048, 1, 1);
              processorRef.current = processor;

              processor.onaudioprocess = (e) => {
                if (isStale() || !sessionAliveRef.current) return;
                try {
                  const inputData = e.inputBuffer.getChannelData(0);
                  const pcm16 = new Int16Array(inputData.length);
                  for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                  }
                  const buffer = new Uint8Array(pcm16.buffer);
                  let binary = '';
                  for (let i = 0; i < buffer.byteLength; i++) {
                    binary += String.fromCharCode(buffer[i]);
                  }
                  const base64 = btoa(binary);

                  if (isMutedRef.current) return;
                  session.sendRealtimeInput({ audio: { mimeType: "audio/pcm;rate=16000", data: base64 } });
                } catch (err) {
                  // Session closed, ignore
                }
              };

              source.connect(processor);
              processor.connect(audioContext.destination);
            } catch (err) {
              console.error("Mic setup error", err);
              if (!isStale()) setError("Microphone setup failed");
            }
          },
          onmessage: async (message: any) => {
            if (isStale()) return;

            // Diagnostic: log every message type received from Gemini
            const msgTypes: string[] = [];
            if (message.toolCall) msgTypes.push(`toolCall(${message.toolCall.functionCalls?.map((c: any) => c.name).join(',')})`);
            if (message.serverContent?.interrupted) msgTypes.push('interrupted');
            if (message.serverContent?.turnComplete) msgTypes.push('turnComplete');
            if (message.serverContent?.inputTranscription?.text) msgTypes.push(`inputTranscript("${message.serverContent.inputTranscription.text.slice(0,40)}")`);
            if (message.serverContent?.outputTranscription?.text) msgTypes.push(`outputTranscript("${message.serverContent.outputTranscription.text.slice(0,60)}")`);
            if (message.serverContent?.modelTurn?.parts?.some((p: any) => p.inlineData?.data)) msgTypes.push('audio');
            if (msgTypes.length > 0) console.log('[VoiceMode] MSG:', msgTypes.join(' | '));

            // Handle interruption
            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(src => {
                try { src.stop(); } catch (e) {}
              });
              activeSourcesRef.current = [];
              // Discard partial AI transcript since AI was interrupted
              aiTranscriptRef.current = '';
              aiTurnCompleteRef.current = false;
              // Reset tool-answer flag so transcripts aren't suppressed in the next turn
              toolAnswerEmittedRef.current = false;
              // Clear tool-wait flag so we don't get stuck in "thinking" after interruption
              waitingForToolAudioRef.current = false;
              if (audioContextRef.current) {
                nextPlayTimeRef.current = audioContextRef.current.currentTime;
              }
            }

            // Accumulate input transcription (user speech → text) and fire immediately for live chat
            if (message.serverContent?.inputTranscription?.text) {
              // New user input → reset tool-call tracking for this turn
              toolCallReceivedInTurnRef.current = false;
              fillerRetryCountRef.current = 0;
              // Keep ONLY Latin letters (including accented), digits, and common punctuation.
              // Gemini sometimes transcribes English speech in random scripts (Gujarati, Bengali, Devanagari, etc.)
              // When language is Arabic, also keep Arabic script.
              const stripPattern = language === 'ar'
                ? /[^\u0000-\u007F\u00C0-\u024F\u1E00-\u1EFF\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/g
                : /[^\u0000-\u007F\u00C0-\u024F\u1E00-\u1EFF]+/g;
              const cleanInput = message.serverContent.inputTranscription.text
                .replace(stripPattern, '')
                .replace(/\s+/g, ' ');
              if (cleanInput.trim()) {
                userTranscriptRef.current += cleanInput;
                onTranscriptRef.current?.('user', userTranscriptRef.current.trim());
              }
            }
            // Don't clear on finished — it fires at every pause mid-sentence.
            // Wait for turnComplete which signals the AI is actually responding.

            if (message.serverContent?.turnComplete && userTranscriptRef.current.trim()) {
              // Emit the raw transcript as-is — no post-processing correction.
              // Post-processing used generateContent with the SAME free-tier API key,
              // burning quota that the Live session needs for audio generation.
              // This caused 429s that silenced the assistant after tool calls.
              const rawTranscript = userTranscriptRef.current.trim();
              userTranscriptRef.current = '';
              lastUserQueryRef.current = rawTranscript;
              onTranscriptRef.current?.('user', rawTranscript);
            } else if (message.serverContent?.turnComplete) {
              userTranscriptRef.current = '';
            }
            // If the assistant starts outputting before the user's turnComplete arrives,
            // commit the pending user transcript now so it updates in-place rather than
            // creating a duplicate user bubble when turnComplete eventually fires.
            if (message.serverContent?.outputTranscription?.text && userTranscriptRef.current.trim()) {
              const pendingText = userTranscriptRef.current.trim();
              userTranscriptRef.current = '';
              onTranscriptRef.current?.('user', pendingText);
            }

            // Accumulate output transcription (AI speech → text) and stream live into one bubble
            if (message.serverContent?.outputTranscription?.text) {
              // When tool answer was emitted, skip Gemini's speech transcript —
              // the structured answer is already displayed in the chat bubble
              if (!toolAnswerEmittedRef.current) {
                // Keep only Latin + digits + punctuation (+ Arabic when in Arabic mode)
                const outStripPattern = language === 'ar'
                  ? /[^\u0000-\u007F\u00C0-\u024F\u1E00-\u1EFF\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/g
                  : /[^\u0000-\u007F\u00C0-\u024F\u1E00-\u1EFF]+/g;
                const cleanOutput = message.serverContent.outputTranscription.text
                  .replace(outStripPattern, '')
                  .replace(/\s+/g, ' ');
                if (cleanOutput.trim() || cleanOutput === ' ') {
                  aiTranscriptRef.current += cleanOutput;
                  // Stream partial transcript live — KnowledgeAssistant updates the same bubble in-place
                  onTranscriptRef.current?.('assistant', aiTranscriptRef.current);
                }
              }
            }

            // AI turn complete: apply filler filter and do final update of the bubble
            if (message.serverContent?.turnComplete) {
              toolAnswerEmittedRef.current = false;
              let wasFillerOnly = false;
              if (aiTranscriptRef.current.trim()) {
                let aiText = aiTranscriptRef.current.trim()
                  .replace(/^(let me (check|look|search|find) (that|it)? ?(for you|up)?[.!,]?\s*)+/gi, '')
                  .replace(/^(one moment[.!,]?\s*)+/gi, '')
                  .replace(/^(sure[,!]?\s*(let me|i['\u2019]ll)\s*(check|look|search)[^.!]*[.!,]\s*)+/gi, '')
                  .replace(/^(looking (that|it) up[.!,]?\s*)+/gi, '')
                  .replace(/^([\u0644\u062F\u0639\u0646\u064A].{0,30}[\u0630\u0644\u0643]\.?\s*)+/u, '') // Arabic filler: "دعني أتحقق من ذلك"
                  .replace(/^([\u0644\u062D\u0638\u0629].{0,15}[\u0636\u0644\u0643]\.?\s*)+/u, '') // Arabic filler: "لحظة من فضلك"
                  .trim();
                wasFillerOnly = !aiText;
                if (aiText) onTranscriptRef.current?.('assistant', aiText);
                aiTranscriptRef.current = '';
              }
              aiTurnCompleteRef.current = false;

              // Missed tool-call detection: Gemini spoke filler ("One moment please")
              // but never issued search_knowledge. Nudge it to call the tool.
              if (wasFillerOnly && !toolCallReceivedInTurnRef.current && lastUserQueryRef.current) {
                fillerRetryCountRef.current++;
                const session = sessionRef.current;
                if (session && sessionAliveRef.current && fillerRetryCountRef.current <= 2) {
                  console.warn('[VoiceMode] Missed tool call detected — nudging Gemini (retry', fillerRetryCountRef.current, ')');
                  try {
                    session.sendRealtimeInput({ text: `[TOOL_REMINDER] You acknowledged the question but did not call search_knowledge. You MUST call it now. The user asked: "${lastUserQueryRef.current}"` });
                  } catch (e) {
                    console.error('[VoiceMode] nudge sendClientContent failed:', e);
                  }
                } else if (fillerRetryCountRef.current > 2) {
                  console.warn('[VoiceMode] Missed tool call — max retries, auto-calling backend');
                  // Fallback: call the backend directly ourselves
                  (async () => {
                    try {
                      setStatusAndNotify('thinking');
                      const res = await apiClient.post('/knowledge/voice-ask', {
                        query: lastUserQueryRef.current,
                        language: language || 'en',
                      }, { timeout: 20000 });
                      const data = res.data?.data || {};
                      const answerText: string = data.answerText || '';
                      const images: { id: string; url: string; description: string; pageNumber: number; width?: number | null; height?: number | null }[] = data.images || [];
                      const isGrounded: boolean = data.isGrounded !== false;
                      if (answerText) {
                        toolAnswerEmittedRef.current = true;
                        onTranscriptRef.current?.('user', '');
                        onTranscriptRef.current?.('assistant', answerText);
                      }
                      if (isGrounded && images.length > 0) onImagesRef.current?.(images);
                    } catch (err) {
                      console.error('[VoiceMode] fallback voice-ask failed:', err);
                    } finally {
                      setStatusAndNotify('listening');
                    }
                  })();
                }
              }
            }

            // Handle tool calls (search_knowledge)
            // Uses the SAME /knowledge/ask endpoint as normal text chat so answers,
            // sources, and images are identical. Gemini just reads the answer aloud.
            if (message.toolCall) {
              toolCallReceivedInTurnRef.current = true;
              const thisToolGen = ++toolCallGenRef.current;
              waitingForToolAudioRef.current = true;
              setStatusAndNotify('thinking');

              // Safety timeout: if we're still in "thinking" after 25s, force recovery
              if (thinkingTimeoutRef.current) clearTimeout(thinkingTimeoutRef.current);
              thinkingTimeoutRef.current = setTimeout(() => {
                if (toolCallGenRef.current === thisToolGen && waitingForToolAudioRef.current) {
                  console.warn('[VoiceMode] thinking safety timeout — recovering');
                  waitingForToolAudioRef.current = false;
                  setStatusAndNotify('listening');
                }
              }, 25000);

              const session = sessionRef.current;
              if (session) {
                try {
                  const responses = await Promise.all(
                    message.toolCall.functionCalls.map(async (call: any) => {
                      if (call.name === 'search_knowledge') {
                        const query = (call.args?.query || '').trim();
                        console.log('[VoiceMode] search_knowledge called with query:', query);
                        if (!query || query.length < 2) {
                          return {
                            id: call.id,
                            name: call.name,
                            response: { output: "Query too short. Please be more specific." }
                          };
                        }
                        try {
                          // Call voice-optimised endpoint: fast search + quick GPT-mini answer (~6-8s)
                          // Same images as normal chat, with a synthesized answer for Gemini to read aloud
                          const res = await apiClient.post('/knowledge/voice-ask', {
                            query,
                            language: language || 'en',
                          }, { timeout: 20000 });
                          const data = res.data?.data || {};
                          const answerText: string = data.answerText || '';
                          const images: { id: string; url: string; description: string; pageNumber: number; width?: number | null; height?: number | null }[] = data.images || [];
                          const isGrounded: boolean = data.isGrounded !== false;
                          console.log('[VoiceMode] voice-ask returned answer length:', answerText.length, 'images:', images.length, 'isGrounded:', isGrounded);

                          // Only emit if this is still the active tool call (not superseded)
                          if (toolCallGenRef.current === thisToolGen) {
                            // Emit the structured answer FIRST so the assistant message exists
                            // (onImages attaches to lastVoiceAssistantMsgId which is set by onTranscript)
                            if (answerText) {
                              toolAnswerEmittedRef.current = true;
                              aiTranscriptRef.current = '';
                              // Force a fresh assistant bubble: the empty-user call nulls
                              // lastVoiceAssistantMsgIdRef so the answer creates a new message
                              // instead of trying to update the filler ("let me check") bubble
                              // in-place, which can silently fail due to React state batching.
                              onTranscriptRef.current?.('user', '');
                              onTranscriptRef.current?.('assistant', answerText);
                            }

                            // Only attach images when the answer is grounded in the knowledge base
                            if (isGrounded && images.length > 0) onImagesRef.current?.(images);
                          }

                          // Strip markdown formatting so Gemini reads clean speech-ready text
                          const stripMarkdown = (text: string) =>
                            text
                              .replace(/^#{1,6}\s+/gm, '')      // headings
                              .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
                              .replace(/\*(.+?)\*/g, '$1')       // italic
                              .replace(/__(.+?)__/g, '$1')       // bold alt
                              .replace(/_(.+?)_/g, '$1')         // italic alt
                              .replace(/~~(.+?)~~/g, '$1')       // strikethrough
                              .replace(/`(.+?)`/g, '$1')         // inline code
                              .replace(/^\s*[-*+]\s+/gm, '')     // bullet points
                              .replace(/^\s*\d+\.\s+/gm, '')    // numbered lists
                              .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
                              .replace(/\n{3,}/g, '\n\n')        // excess newlines
                              .trim();

                          // Feed the clean answer to Gemini as its spoken script
                          const speechText = answerText ? stripMarkdown(answerText) : '';
                          const toolOutput = speechText
                            ? speechText
                            : "No relevant information found in the knowledge base for this query.";

                          return {
                            id: call.id,
                            name: call.name,
                            response: { output: toolOutput.slice(0, 6000) }
                          };
                        } catch (apiErr: any) {
                          console.error("Knowledge voice-ask API error:", apiErr?.response?.status, apiErr?.response?.data, apiErr?.message);
                          return {
                            id: call.id,
                            name: call.name,
                            response: { output: `Search error: ${apiErr?.response?.data?.message || apiErr?.message || 'temporarily unavailable'}` }
                          };
                        }
                      }
                      return { id: call.id, name: call.name, response: { error: "Unknown function" } };
                    })
                  );
                  // Always attempt to send — session may have had a brief close event
                  // during the async API call but is still functionally alive
                  try {
                    session.sendToolResponse({ functionResponses: responses });
                    // Tool call succeeded — clear the last query so filler detection
                    // doesn't false-trigger on the reading turn's turnComplete
                    lastUserQueryRef.current = '';
                  } catch (sendErr) {
                    console.error('[VoiceMode] sendToolResponse failed:', sendErr);
                    // Send failed — Gemini won't produce audio, so unstick immediately
                    waitingForToolAudioRef.current = false;
                    if (thinkingTimeoutRef.current) { clearTimeout(thinkingTimeoutRef.current); thinkingTimeoutRef.current = null; }
                    setStatusAndNotify('listening');
                    return;
                  }
                  // Answer audio will arrive soon; clear the flag so source.onended
                  // transitions to 'listening' (not back to 'thinking') when done.
                  waitingForToolAudioRef.current = false;
                  if (thinkingTimeoutRef.current) { clearTimeout(thinkingTimeoutRef.current); thinkingTimeoutRef.current = null; }
                } catch (toolErr) {
                  console.error("Tool execution error:", toolErr);
                  waitingForToolAudioRef.current = false;
                  if (thinkingTimeoutRef.current) { clearTimeout(thinkingTimeoutRef.current); thinkingTimeoutRef.current = null; }
                  setStatusAndNotify('listening');
                  try {
                    session.sendToolResponse({
                      functionResponses: message.toolCall.functionCalls.map((c: any) => ({
                        id: c.id,
                        response: { error: "Internal tool error" }
                      }))
                    });
                  } catch (sendErr) {
                    console.error('[VoiceMode] sendToolResponse (error fallback) failed:', sendErr);
                  }
                }
              } else {
                // Session gone — unstick from thinking
                console.error('[VoiceMode] toolCall received but session is null');
                waitingForToolAudioRef.current = false;
                if (thinkingTimeoutRef.current) { clearTimeout(thinkingTimeoutRef.current); thinkingTimeoutRef.current = null; }
                setStatusAndNotify('listening');
              }
            }

            // Handle audio response
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                const base64Audio = part.inlineData?.data;
                if (base64Audio && audioContextRef.current) {
                  // Don't touch waitingForToolAudioRef here — it's managed by
                  // the toolCall handler so ack-phrase audio doesn't clear it.
                  setStatusAndNotify('speaking');

                  const binary = atob(base64Audio);
                  const bytes = new Uint8Array(binary.length);
                  for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                  }
                  const pcm16 = new Int16Array(bytes.buffer);
                  const audioBuffer = audioContextRef.current.createBuffer(1, pcm16.length, 24000);
                  const channelData = audioBuffer.getChannelData(0);
                  for (let i = 0; i < pcm16.length; i++) {
                    channelData[i] = pcm16[i] / 32768;
                  }

                  const source = audioContextRef.current.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(analyserRef.current ?? audioContextRef.current.destination);

                  const startTime = Math.max(audioContextRef.current.currentTime, nextPlayTimeRef.current);
                  source.start(startTime);
                  nextPlayTimeRef.current = startTime + audioBuffer.duration;

                  activeSourcesRef.current.push(source);
                  source.onended = () => {
                    activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
                    if (activeSourcesRef.current.length === 0) {
                      if (stopRequestedRef.current) {
                        // Goodbye audio finished — now disconnect and close
                        stopRequestedRef.current = false;
                        disconnect();
                        onCloseRef.current();
                      } else if (waitingForToolAudioRef.current) {
                        // Tool call in progress — keep showing thinking, don't flip to listening
                        setStatusAndNotify('thinking');
                      } else {
                        setStatusAndNotify('listening');
                      }
                    }
                  };
                }
              }
            }
          },
          onerror: (err: any) => {
            sessionAliveRef.current = false;
            if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
            if (isStale()) return;
            console.error("Gemini Live API error:", err?.message || err);
            setError("Voice connection error. Please try again.");
            setStatusAndNotify('connecting');
          },
          onclose: () => {
            sessionAliveRef.current = false;
            if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
            console.log("Gemini Live session closed");
          }
        }
      });

      if (isStale()) {
        const s = await sessionPromise;
        try { s.close(); } catch(e) {}
        return;
      }

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error("Failed to start voice session:", err);
      setError(err.message || "Failed to connect");
      setStatusAndNotify('connecting');
    }
  };

  const disconnect = () => {
    connectionIdRef.current++;
    sessionAliveRef.current = false;
    waitingForToolAudioRef.current = false;
    if (thinkingTimeoutRef.current) { clearTimeout(thinkingTimeoutRef.current); thinkingTimeoutRef.current = null; }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) {}
      sessionRef.current = null;
    }
    activeSourcesRef.current.forEach(src => {
      try { src.stop(); } catch (e) {}
    });
    activeSourcesRef.current = [];
    const thinkingAudio = (thinkingIntervalRef as any).current;
    if (thinkingAudio instanceof HTMLAudioElement) {
      thinkingAudio.pause();
      thinkingAudio.currentTime = 0;
    } else if (thinkingAudio) {
      clearInterval(thinkingAudio);
    }
    thinkingIntervalRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setStatusAndNotify('connecting');
  };

  const stop = () => {
    if (!sessionRef.current || !sessionAliveRef.current) {
      onCloseRef.current();
      return;
    }
    stopRequestedRef.current = true;
    // Stop mic immediately so AI doesn't hear more input
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    // Ask the AI to say goodbye
    try {
      sessionRef.current.sendRealtimeInput({ text: '[END_SESSION]' });
    } catch (e) {}
    // Force-close after 8 seconds in case audio never finishes
    setTimeout(() => {
      if (stopRequestedRef.current) {
        stopRequestedRef.current = false;
        disconnect();
        onCloseRef.current();
      }
    }, 8000);
  };

  useImperativeHandle(ref, () => ({ stop }));

  // Renders nothing — voice UI is shown inline in the input bar by the parent
  return null;
});
