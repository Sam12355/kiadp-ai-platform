import { useState, useEffect } from 'react';
import { Brain, Zap, Layers, Cpu, CheckCircle2, AlertCircle, Loader2, Save } from 'lucide-react';
import apiClient from '../../api/client';
import { useLanguageStore } from '../../store/languageStore';

type AIProvider = 'auto' | 'openai' | 'gemini' | 'groq';

interface ProviderOption {
  id: AIProvider;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'auto',
    label: 'Auto (Recommended)',
    description: 'GPT-4o primary with Gemini and Groq fallbacks. Best reliability.',
    icon: Layers,
    color: 'text-emerald-400',
  },
  {
    id: 'openai',
    label: 'OpenAI Only',
    description: 'Force GPT-4o for all responses. No fallback to other providers.',
    icon: Brain,
    color: 'text-blue-400',
  },
  {
    id: 'gemini',
    label: 'Gemini Only',
    description: 'Use Google Gemini exclusively (gemini-2.5-flash cascade). Skips OpenAI.',
    icon: Zap,
    color: 'text-yellow-400',
  },
  {
    id: 'groq',
    label: 'Groq Only',
    description: 'Use Groq exclusively (Llama models). Fastest inference, lowest cost.',
    icon: Cpu,
    color: 'text-purple-400',
  },
];

export default function AdminSettings() {
  const { lang } = useLanguageStore();
  const [selected, setSelected] = useState<AIProvider>('auto');
  const [saved, setSaved] = useState<AIProvider>('auto');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    apiClient.get('/admin/settings/ai-provider')
      .then(res => {
        const p: AIProvider = res.data?.data?.provider ?? 'auto';
        setSelected(p);
        setSaved(p);
      })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await apiClient.put('/admin/settings/ai-provider', { provider: selected });
      setSaved(selected);
      setSuccess('AI provider updated successfully.');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const isDirty = selected !== saved;

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <h1 className="text-2xl font-black uppercase tracking-widest text-white mb-1">Settings</h1>
      <p className="text-white/40 text-sm mb-8">Configure system-wide AI behaviour</p>

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-white/60 mb-4">AI Provider</h2>

        {loading ? (
          <div className="flex items-center gap-2 text-white/40 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {PROVIDER_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const isActive = selected === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setSelected(opt.id)}
                  className={`flex items-start gap-4 p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    isActive
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                  }`}
                >
                  <div className={`mt-0.5 shrink-0 ${opt.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{opt.label}</span>
                      {saved === opt.id && (
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/50 mt-0.5">{opt.description}</p>
                  </div>
                  <div className={`mt-0.5 shrink-0 ${isActive ? 'text-emerald-400' : 'text-white/20'}`}>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isActive ? 'border-emerald-400' : 'border-white/20'}`}>
                      {isActive && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {success}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={!isDirty || saving || loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black text-sm uppercase tracking-widest transition-all active:scale-95"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
