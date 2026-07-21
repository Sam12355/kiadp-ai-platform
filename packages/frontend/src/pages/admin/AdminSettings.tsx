import { useState, useEffect } from 'react';
import { Brain, Zap, Layers, Cpu, CheckCircle2, AlertCircle, Loader2, Save, CalendarClock } from 'lucide-react';
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
    color: 'text-emerald-700 dark:text-emerald-400',
  },
  {
    id: 'openai',
    label: 'OpenAI Only',
    description: 'Force GPT-4o for all responses. No fallback to other providers.',
    icon: Brain,
    color: 'text-blue-700 dark:text-blue-400',
  },
  {
    id: 'gemini',
    label: 'Gemini Only',
    description: 'Use Google Gemini exclusively (gemini-2.5-flash cascade). Skips OpenAI.',
    icon: Zap,
    color: 'text-yellow-700 dark:text-yellow-400',
  },
  {
    id: 'groq',
    label: 'Groq Only',
    description: 'Use Groq exclusively (Llama models). Fastest inference, lowest cost.',
    icon: Cpu,
    color: 'text-purple-700 dark:text-purple-400',
  },
];

/** Pulls the server's message out of an axios error without widening to `any`. */
function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { error?: { message?: string } } } })
    ?.response?.data?.error?.message;
  return message || fallback;
}

export default function AdminSettings() {
  const { lang } = useLanguageStore();
  const [selected, setSelected] = useState<AIProvider>('auto');
  const [saved, setSaved] = useState<AIProvider>('auto');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Free trial length. Held as a string so the field can be cleared while typing.
  const [trialDays, setTrialDays] = useState('');
  const [savedTrialDays, setSavedTrialDays] = useState('');
  const [defaultTrialDays, setDefaultTrialDays] = useState<number | null>(null);
  const [trialLoading, setTrialLoading] = useState(true);
  const [trialSaving, setTrialSaving] = useState(false);
  const [trialError, setTrialError] = useState('');
  const [trialSuccess, setTrialSuccess] = useState('');

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

  useEffect(() => {
    apiClient.get('/admin/settings/trial-days')
      .then(res => {
        const days = String(res.data?.data?.days ?? '');
        setTrialDays(days);
        setSavedTrialDays(days);
        setDefaultTrialDays(res.data?.data?.default ?? null);
      })
      .catch(() => setTrialError('Failed to load trial settings'))
      .finally(() => setTrialLoading(false));
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

  const handleSaveTrial = async () => {
    setTrialSaving(true);
    setTrialError('');
    setTrialSuccess('');
    try {
      const { data } = await apiClient.put('/admin/settings/trial-days', { days: Number(trialDays) });
      const days = String(data?.data?.days ?? trialDays);
      setTrialDays(days);
      setSavedTrialDays(days);
      setTrialSuccess('Trial length updated. New signups will use it.');
      setTimeout(() => setTrialSuccess(''), 3000);
    } catch (err) {
      setTrialError(apiErrorMessage(err, 'Failed to save trial length. Please try again.'));
    } finally {
      setTrialSaving(false);
    }
  };

  const isDirty = selected !== saved;

  const trialDaysNum = Number(trialDays);
  const trialValid = trialDays.trim() !== '' && Number.isInteger(trialDaysNum) && trialDaysNum >= 1 && trialDaysNum <= 365;
  const trialDirty = trialDays !== savedTrialDays;

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <h1 className="text-2xl font-black uppercase tracking-widest text-ink mb-1">Settings</h1>
      <p className="text-ink-mute text-sm mb-8">Configure system-wide AI and billing behaviour</p>

      <div className="bg-raised border border-line rounded-2xl p-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-ink-soft mb-4">AI Provider</h2>

        {loading ? (
          <div className="flex items-center gap-2 text-ink-mute text-sm py-4">
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
                      : 'border-line bg-raised hover:bg-raised hover:border-line-strong'
                  }`}
                >
                  <div className={`mt-0.5 shrink-0 ${opt.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-ink">{opt.label}</span>
                      {saved === opt.id && (
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-mute mt-0.5">{opt.description}</p>
                  </div>
                  <div className={`mt-0.5 shrink-0 ${isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-ink-faint'}`}>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isActive ? 'border-emerald-400' : 'border-line-strong'}`}>
                      {isActive && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-700 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
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

      <div className="bg-raised border border-line rounded-2xl p-6 mt-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-ink-soft mb-4">Free Trial</h2>

        {trialLoading ? (
          <div className="flex items-center gap-2 text-ink-mute text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-4 p-4 rounded-xl border border-line bg-raised">
              <div className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-400">
                <CalendarClock className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <label htmlFor="trial-days" className="text-sm font-bold text-ink">
                  Trial length for new institutions
                </label>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    id="trial-days"
                    type="number"
                    min={1}
                    max={365}
                    step={1}
                    value={trialDays}
                    onChange={e => setTrialDays(e.target.value)}
                    className="w-28 px-3 py-2 bg-surface border border-line rounded-xl text-ink text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                  <span className="text-xs text-ink-mute">days</span>
                  {defaultTrialDays !== null && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-ink-faint">
                      Default {defaultTrialDays}
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-mute mt-2">
                  Changing this only affects <span className="font-bold text-ink-soft">new signups</span> — institutions
                  already on a trial keep the end date they were given. Must be between 1 and 365 days.
                </p>
              </div>
            </div>
          </div>
        )}

        {trialError && (
          <div className="mt-4 flex items-center gap-2 text-red-700 dark:text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {trialError}
          </div>
        )}

        {trialSuccess && (
          <div className="mt-4 flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {trialSuccess}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSaveTrial}
            disabled={!trialDirty || !trialValid || trialSaving || trialLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black text-sm uppercase tracking-widest transition-all active:scale-95"
          >
            {trialSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {trialSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
