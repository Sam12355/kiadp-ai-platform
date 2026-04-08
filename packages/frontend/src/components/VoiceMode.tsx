import React, { useState, useEffect, useRef } from 'react';

interface VoiceModeProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
}

export const VoiceMode: React.FC<VoiceModeProps> = ({ isOpen, onClose, apiKey }) => {
  const [status, setStatus] = useState<'connecting'|'ready'|'listening'|'speaking'>('connecting');
  const [error, setError] = useState<string|null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
      setStatus('connecting');
      setError(null);

      // PROACTIVE PERMISSION: Request mic before connecting
      await startMic();

      // Connect to the local backend bridge instead of direct Google API
      // This bypasses browser-side CORS and 1006 errors
      // Use a hardcoded loopback IP to avoid IPv6 resolution issues with 'localhost'
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//127.0.0.1:3001/api/voice`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // Minimal setup for v1beta
        const setupMsg = {
          setup: {
            model: "models/gemini-2.0-flash-exp"
          }
        };
        ws.send(JSON.stringify(setupMsg));
      };

      ws.onmessage = async (event) => {
        try {
          const response = JSON.parse(event.data);
          
          if (response.setupComplete) {
            setStatus('ready');
          }

          if (response.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
            const base64Audio = response.serverContent.modelTurn.parts[0].inlineData.data;
            playOutputAudio(base64Audio);
          }
        } catch (e) {
          console.error("Parse Error", e);
        }
      };

      ws.onerror = () => {
        setError("Network error: Could not reach Gemini servers.");
      };

      ws.onclose = (e) => {
        console.warn("WS Closed", e.code, e.reason);
        if (e.code === 1006) {
          setError("Connection failed (1006): Check internet or API key limits.");
        } else if (e.code === 4003) {
          setError("API Key Error (4003): Your key may not have access to Live mode.");
        } else {
          setError(`Connection closed: ${e.reason || 'Unknown reason'} (Code: ${e.code})`);
        }
        setStatus('connecting');
      };

    } catch (err: any) {
      setError(err.message);
    }
  };

  const disconnect = () => {
    if (wsRef.current) wsRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    wsRef.current = null;
    setStatus('connecting');
  };

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // In a real production app, we would use an AudioWorklet for better performance
      // Here we will use ScriptProcessor for simplicity in this demo, though it's deprecated
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && status !== 'speaking') {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = floatTo16BitPCM(inputData);
          const base64Data = arrayBufferToBase64(pcmData);
          
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{
                mimeType: "audio/pcm",
                data: base64Data
              }]
            }
          }));
        }
      };
    } catch (err: any) {
      setError("Microphone access denied");
    }
  };

  const playOutputAudio = async (base64: string) => {
    if (!audioContextRef.current) return;
    setStatus('speaking');
    
    const arrayBuffer = base64ToArrayBuffer(base64);
    const float32Data = pcm16ToFloat32(arrayBuffer);
    
    const buffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000); // Gemini uses 24kHz out
    buffer.getChannelData(0).set(float32Data);
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => setStatus('listening');
    source.start();
  };

  // Helper functions
  const floatTo16BitPCM = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output.buffer;
  };

  const pcm16ToFloat32 = (input: ArrayBuffer) => {
    const int16 = new Int16Array(input);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    return float32;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const base64ToArrayBuffer = (base64: string) => {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
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
