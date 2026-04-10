import React, { useState, useEffect, useRef, useImperativeHandle } from 'react';
import { Modality, GoogleGenAI, Type } from '@google/genai';
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
  onImages?: (images: { id: string; url: string; description: string; pageNumber: number }[]) => void;
  chatMessages?: { role: 'user' | 'assistant'; content: string; sources?: { excerpt: string; sourceDocument: { title: string }; pageNumber: number }[] }[];
  isMuted?: boolean;
  pendingClientText?: string | null;
  onClientTextSent?: () => void;
}

export const VoiceMode = React.forwardRef<VoiceModeHandle, VoiceModeProps>(
  ({ isOpen, onClose, apiKey, language, onStatusChange, onTranscript, onImages, chatMessages, isMuted, pendingClientText, onClientTextSent }, ref) => {
  const [status, setStatus] = useState<'connecting'|'ready'|'listening'|'speaking'|'thinking'>('connecting');
  const [error, setError] = useState<string|null>(null);

  const thinkingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setStatusAndNotify = (s: 'connecting'|'ready'|'listening'|'speaking'|'thinking') => {
    setStatus(s);
    onStatusChange?.(s);
    if (s === 'thinking') {
      // Generate pulsing thinking tone via Web Audio API (no file dependency)
      const playPing = () => {
        const ctx = audioContextRef.current;
        if (!ctx || ctx.state === 'closed') return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 520;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.45);
      };
      if (thinkingIntervalRef.current) clearInterval(thinkingIntervalRef.current);
      playPing();
      thinkingIntervalRef.current = setInterval(playPing, 700);
    } else {
      if (thinkingIntervalRef.current) {
        clearInterval(thinkingIntervalRef.current);
        thinkingIntervalRef.current = null;
      }
    }
  };

  const isMutedRef = useRef(false);
  useEffect(() => { isMutedRef.current = isMuted ?? false; }, [isMuted]);

  useEffect(() => {
    if (!pendingClientText || !sessionRef.current || !sessionAliveRef.current) return;
    try {
      sessionRef.current.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: pendingClientText }] }],
        turnComplete: true,
      });
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

      // Create AudioContext at 16kHz for mic input (same as working Examx project)
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      if (isStale()) { audioContext.close(); return; }
      audioContextRef.current = audioContext;

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
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
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

You have access to the knowledge base via the "search_knowledge" tool. You MUST use this tool to look up information when the user asks ANY question — no exceptions. The tool returns a ready-made answer from our AI system — read it naturally to the user.

Instructions:
1. CRITICAL: Before calling search_knowledge, ALWAYS first speak a brief acknowledgment phrase in the session language. Use natural voice phrases:
   English: "Let me check that for you." or "One moment please." or "Let me look that up." (vary them, never repeat same phrase twice in a row)
   Arabic: "دعني أتحقق من ذلك." or "لحظة من فضلك." or "سأبحث عن ذلك الآن."
2. ALWAYS call search_knowledge for ANY question the user asks — whether it's about food, culture, history, agriculture, date palms, places, people, statistics, or anything else. Even if the question seems vague or incomplete, ALWAYS search. Never try to answer without searching first.
3. The tool returns a pre-written answer. Read it to the user naturally and conversationally — DO NOT add information that is not in the answer.
4. IMAGES: When the tool response mentions "VISUAL IMAGES", those images are automatically shown to the user. Tell the user you are showing them the image and briefly describe it.
5. Keep your delivery SHORT and conversational — you are in a live voice session. Paraphrase the answer concisely (2-4 sentences max) unless the user asks for more detail.
6. DO NOT output thinking text or internal reasoning. Speak directly.
7. Respond immediately — no delays.
8. NEVER say "technical difficulties", "I'm having trouble", or similar error phrases. If the answer says no information was found, tell the user and ask them to rephrase.${knowledgeContext}`,          tools: [
            {
              functionDeclarations: [
                {
                  name: "search_knowledge",
                  description: "Search the knowledge base and get an expert answer. Returns a ready-made answer with images. Use this for ANY factual question.",
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
                    session.sendClientContent({
                      turns: [{ role: 'user', parts: [{ text: '[START_SESSION]' }] }],
                      turnComplete: true,
                    });
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

            // Handle interruption
            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(src => {
                try { src.stop(); } catch (e) {}
              });
              activeSourcesRef.current = [];
              // Discard partial AI transcript since AI was interrupted
              aiTranscriptRef.current = '';
              aiTurnCompleteRef.current = false;
              if (audioContextRef.current) {
                nextPlayTimeRef.current = audioContextRef.current.currentTime;
              }
            }

            // Accumulate input transcription (user speech → text) and fire immediately for live chat
            if (message.serverContent?.inputTranscription?.text) {
              userTranscriptRef.current += message.serverContent.inputTranscription.text;
              onTranscriptRef.current?.('user', userTranscriptRef.current.trim());
            }
            // On finished / turnComplete: clear buffer (already sent incrementally above)
            if (message.serverContent?.inputTranscription?.finished && userTranscriptRef.current.trim()) {
              userTranscriptRef.current = '';
            }
            if (message.serverContent?.turnComplete && userTranscriptRef.current.trim()) {
              userTranscriptRef.current = '';
            }
            // Accumulate output transcription (AI speech → text) and stream live into one bubble
            if (message.serverContent?.outputTranscription?.text) {
              // When tool answer was emitted, skip Gemini's speech transcript —
              // the structured answer is already displayed in the chat bubble
              if (!toolAnswerEmittedRef.current) {
                aiTranscriptRef.current += message.serverContent.outputTranscription.text;
                // Stream partial transcript live — KnowledgeAssistant updates the same bubble in-place
                onTranscriptRef.current?.('assistant', aiTranscriptRef.current);
              }
            }

            // AI turn complete: apply filler filter and do final update of the bubble
            if (message.serverContent?.turnComplete) {
              toolAnswerEmittedRef.current = false;
              if (aiTranscriptRef.current.trim()) {
                let aiText = aiTranscriptRef.current.trim()
                  .replace(/^(let me (check|look|search|find) (that|it)? ?(for you|up)?[.!,]?\s*)+/gi, '')
                  .replace(/^(one moment[.!,]?\s*)+/gi, '')
                  .replace(/^(sure[,!]?\s*(let me|i['\u2019]ll)\s*(check|look|search)[^.!]*[.!,]\s*)+/gi, '')
                  .trim();
                if (aiText) onTranscriptRef.current?.('assistant', aiText);
                aiTranscriptRef.current = '';
              }
              aiTurnCompleteRef.current = false;
            }

            // Handle tool calls (search_knowledge)
            // Uses the SAME /knowledge/ask endpoint as normal text chat so answers,
            // sources, and images are identical. Gemini just reads the answer aloud.
            if (message.toolCall) {
              setStatusAndNotify('thinking');
              const session = sessionRef.current;
              if (session && sessionAliveRef.current) {
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
                          });
                          const data = res.data?.data || {};
                          const answerText: string = data.answerText || '';
                          const images: { id: string; url: string; description: string; pageNumber: number }[] = data.images || [];
                          console.log('[VoiceMode] voice-ask returned answer length:', answerText.length, 'images:', images.length);

                          // Emit images to chat UI so they appear under the current AI bubble
                          if (images.length > 0) onImagesRef.current?.(images);

                          // Emit the structured answer directly as the assistant chat bubble
                          // (identical to text chat) instead of letting Gemini paraphrase it
                          if (answerText) {
                            toolAnswerEmittedRef.current = true;
                            aiTranscriptRef.current = '';
                            onTranscriptRef.current?.('assistant', answerText);
                          }

                          const imageNote = images.length > 0
                            ? `\nVISUAL IMAGES: ${images.map((img: any) => `Figure on page ${img.pageNumber}: ${img.description?.slice(0, 120)}`).join('; ')}. These images are NOW shown to the user. Mention you are showing them.`
                            : '';

                          // Feed the synthesized answer to Gemini so it reads it verbatim
                          const toolOutput = answerText
                            ? `ANSWER (read this to the user naturally, keep it concise for voice):${imageNote}\n\n${answerText}`
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
                  if (sessionRef.current && sessionAliveRef.current) {
                    session.sendToolResponse({ functionResponses: responses });
                  }
                } catch (toolErr) {
                  console.error("Tool execution error:", toolErr);
                  if (sessionRef.current && sessionAliveRef.current) {
                    session.sendToolResponse({
                      functionResponses: message.toolCall.functionCalls.map((c: any) => ({
                        id: c.id,
                        response: { error: "Internal tool error" }
                      }))
                    });
                  }
                }
              }
            }

            // Handle audio response
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                const base64Audio = part.inlineData?.data;
                if (base64Audio && audioContextRef.current) {
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
                  source.connect(audioContextRef.current.destination);

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
    if (thinkingIntervalRef.current) {
      clearInterval(thinkingIntervalRef.current);
      thinkingIntervalRef.current = null;
    }
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
      sessionRef.current.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: '[END_SESSION]' }] }],
        turnComplete: true,
      });
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
