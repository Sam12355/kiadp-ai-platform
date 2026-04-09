import React, { useState, useEffect, useRef } from 'react';
import { Modality, GoogleGenAI, Type } from '@google/genai';
import apiClient from '../api/client';

interface VoiceModeProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  chatMessages?: { role: 'user' | 'assistant'; content: string; sources?: { excerpt: string; sourceDocument: { title: string }; pageNumber: number }[] }[];
}

export const VoiceMode: React.FC<VoiceModeProps> = ({ isOpen, onClose, apiKey, chatMessages }) => {
  const [status, setStatus] = useState<'connecting'|'ready'|'listening'|'speaking'>('connecting');
  const [error, setError] = useState<string|null>(null);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const connectionIdRef = useRef<number>(0);
  const sessionAliveRef = useRef<boolean>(false);

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

      setStatus('connecting');
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

      // Build knowledge context from chat history and retrieved sources
      let knowledgeContext = '';
      if (chatMessages && chatMessages.length > 0) {
        // Collect unique source excerpts from assistant messages
        const sourceChunks: string[] = [];
        const seenExcerpts = new Set<string>();
        for (const msg of chatMessages) {
          if (msg.sources) {
            for (const src of msg.sources) {
              const key = src.excerpt.substring(0, 100);
              if (!seenExcerpts.has(key)) {
                seenExcerpts.add(key);
                sourceChunks.push(`[${src.sourceDocument.title} - Page ${src.pageNumber}]\n${src.excerpt}`);
              }
            }
          }
        }

        // Build conversation summary
        const recentMessages = chatMessages.slice(-6);
        const conversationSummary = recentMessages
          .map(m => `${m.role.toUpperCase()}: ${m.content.substring(0, 500)}`)
          .join('\n');

        if (sourceChunks.length > 0) {
          // Limit context to ~4000 chars to stay within limits
          let contextText = '';
          for (const chunk of sourceChunks) {
            if (contextText.length + chunk.length > 4000) break;
            contextText += chunk + '\n\n';
          }
          knowledgeContext = `\n\nKNOWLEDGE BASE CONTEXT (from retrieved documents):\n${contextText}`;
        }

        if (conversationSummary) {
          knowledgeContext += `\n\nRECENT CONVERSATION:\n${conversationSummary}`;
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

You have access to files and documents uploaded by the user via the "search_knowledge" tool. You MUST use this tool to look up information when the user asks any factual question.

Instructions:
1. CRITICAL: When the user asks ANY question about facts, data, statistics, documents, reports, agriculture, date palms, locations, populations, food, culture, or any specific topic — you MUST call the "search_knowledge" tool FIRST. Do NOT try to answer from memory.
2. If the first search doesn't find a good answer, try searching again with DIFFERENT keywords. For example, if "dish in Siwa" returns nothing useful, try "Siwan food" or "cuisine Siwa" or "traditional dish". You can call search_knowledge multiple times.
3. Once you get search results, answer based ONLY on the retrieved document context. Mention the document name and page.
4. If multiple searches return no results, tell the user honestly that you couldn't find it in their documents.
5. Keep responses concise and natural — you are in a live voice conversation.
6. DO NOT output any "thinking" text, "plan" text, or "internal reasoning". ONLY speak the direct response.
7. RESPOND IMMEDIATELY when you hear a question. Do not wait.
8. If the user asks about something that sounds like it could be in their documents (e.g. "what is the population of...", "tell me about...", "what do they eat..."), ALWAYS search first.${knowledgeContext}`,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "search_knowledge",
                  description: "Search the uploaded knowledge base documents for relevant information. Use this for ANY factual question. You can call this tool multiple times with different keywords to find better results. Try synonyms and rephrased queries if first search is not sufficient.",
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
            setStatus('listening');

            try {
              const session = await sessionPromise;
              if (isStale()) return;
              
              sessionRef.current = session;
              sessionAliveRef.current = true;

              // Setup mic capture
              const source = audioContext.createMediaStreamSource(stream);
              const processor = audioContext.createScriptProcessor(4096, 1, 1);
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

            // Debug: log all message types to diagnose tool call issues
            const msgKeys = Object.keys(message).filter(k => message[k] != null);
            console.log('[VoiceMode] message keys:', msgKeys);
            if (message.toolCall) {
              console.log('[VoiceMode] TOOL CALL received:', JSON.stringify(message.toolCall));
            }
            if (message.serverContent?.modelTurn?.parts) {
              const partTypes = message.serverContent.modelTurn.parts.map((p: any) =>
                p.inlineData ? `audio(${p.inlineData.data?.length || 0})` : p.text ? `text(${p.text.substring(0,100)})` : 'other'
              );
              console.log('[VoiceMode] model parts:', partTypes);
            }

            // Handle interruption
            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(src => {
                try { src.stop(); } catch (e) {}
              });
              activeSourcesRef.current = [];
              if (audioContextRef.current) {
                nextPlayTimeRef.current = audioContextRef.current.currentTime;
              }
            }

            // Handle tool calls (search_knowledge)
            if (message.toolCall) {
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
                          const res = await apiClient.post('/knowledge/search', { query });
                          const results = res.data?.data?.results || res.data?.results || [];
                          console.log('[VoiceMode] search returned', results.length, 'results, raw keys:', Object.keys(res.data || {}));
                          const resultText = results.length > 0
                            ? results.map((r: any) =>
                                `From "${r.title}" (page ${r.pageNumber}):\n${r.text}`
                              ).join('\n\n')
                            : "No relevant information found in the knowledge base for this query.";
                          return {
                            id: call.id,
                            name: call.name,
                            response: { output: resultText.slice(0, 4000) }
                          };
                        } catch (apiErr: any) {
                          console.error("Knowledge search API error:", apiErr?.response?.status, apiErr?.response?.data, apiErr?.message);
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
                  setStatus('speaking');

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
                      setStatus('listening');
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
            setStatus('connecting');
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
      setStatus('connecting');
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
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setStatus('connecting');
  };

  if (!isOpen) return null;

  return (
    <div className="voice-overlay">
      <div className="voice-circle">
        <div className="voice-pulse" />
        <div className="voice-pulse" />
        <div className="voice-pulse" />
        <button className="mic-active-btn" onClick={onClose}>
          <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        </button>
      </div>
      
      <div className="text-center">
        <h2 className="voice-indicator-text">
          {status === 'connecting' ? 'Connecting to Gemini...' : 
           status === 'ready' ? 'Deep Dive Live Active' :
           status === 'speaking' ? 'Gemini is speaking' : 'Listening...'}
        </h2>
        {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
      </div>

      <div className="wave-container">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>

      <button 
        onClick={onClose}
        className="px-8 py-3 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white transition-all text-sm font-medium"
      >
        Exit Voice Mode
      </button>
    </div>
  );
};
