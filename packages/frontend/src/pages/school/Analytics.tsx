import { useQuery } from '@tanstack/react-query';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useImpersonationStore } from '../../store/impersonationStore';
import { BarChart3, TrendingUp, Users, ShieldCheck, FileWarning, BookOpen } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid,
} from 'recharts';

interface Analytics {
  daily: { day: string; questions: number }[];
  summary: {
    totalAnswers: number;
    groundedAnswers: number;
    groundedRate: number | null;
    activeAskers: number;
    questionsLast14: number;
  };
  topDocuments: { id: string; title: string; citations: number }[];
  ungrounded: { id: string; question: string; createdAt: string }[];
}

/** Recharts takes literal colours as props, so it cannot inherit the theme from CSS. */
function chartColors() {
  const s = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    axis: read('--t-ink-faint', '#94a3b8'),
    grid: read('--t-line', '#e2e8f0'),
    surface: read('--t-raised', '#ffffff'),
    ink: read('--t-ink', '#0f172a'),
    accent: read('--t-accent', '#15803d'),
  };
}

function StatCard({ icon: Icon, label, value, hint }: {
  icon: typeof Users; label: string; value: string; hint?: string;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-ink-mute" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-mute">{label}</p>
      </div>
      <p className="text-3xl font-black text-ink leading-none">{value}</p>
      {hint && <p className="text-[11px] text-ink-mute mt-2">{hint}</p>}
    </div>
  );
}

export default function SchoolAnalytics() {
  const { lang } = useLanguageStore();
  const t = translations[lang];
  const { user } = useAuthStore();
  const impersonatedTenantId = useImpersonationStore((s) => s.tenantId);
  // When the platform owner is viewing an institution, their own tenantId is null — the
  // institution being viewed is the one to ask about.
  const tenantId = impersonatedTenantId ?? user?.tenantId;

  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ['school-analytics', tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => (await apiClient.get(`/tenants/${tenantId}/analytics`)).data.data,
  });

  const c = chartColors();

  if (isLoading || !data) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 rounded-lg bg-overlay animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-overlay animate-pulse" />)}
        </div>
      </div>
    );
  }

  const { summary, daily, topDocuments, ungrounded } = data;
  const groundedPct = summary.groundedRate === null ? null : Math.round(summary.groundedRate * 100);

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-black text-ink flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-accent" />
          {t.analytics}
        </h1>
        <p className="text-sm text-ink-mute mt-1">{t.analyticsSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label={t.questionsLast14} value={String(summary.questionsLast14)} />
        <StatCard icon={Users} label={t.activeStudents} value={String(summary.activeAskers)} hint={t.activeStudentsHint} />
        <StatCard
          icon={ShieldCheck}
          label={t.answeredFromDocs}
          value={groundedPct === null ? '—' : `${groundedPct}%`}
          // A rate with no denominator is not 0% — it is "nothing asked yet". Saying 0%
          // would read as a broken knowledge base on a school's first day.
          hint={groundedPct === null ? t.noQuestionsAskedYet : `${summary.groundedAnswers} ${t.ofAnswers} ${summary.totalAnswers}`}
        />
        <StatCard icon={FileWarning} label={t.gapsFound} value={String(ungrounded.length)} hint={t.gapsFoundHint} />
      </div>

      <div className="glass rounded-2xl p-6">
        <h2 className="text-sm font-bold text-ink mb-4">{t.questionsPerDay}</h2>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={daily}>
            <defs>
              <linearGradient id="qGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={c.accent} stopOpacity={0.35} />
                <stop offset="95%" stopColor={c.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: c.axis }} tickFormatter={(d: string) => d.slice(5)} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: c.axis }} allowDecimals={false} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 12, fontSize: 12, color: c.ink }}
              labelStyle={{ color: c.ink }}
            />
            <Area type="monotone" dataKey="questions" stroke={c.accent} strokeWidth={2} fill="url(#qGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-6">
          <h2 className="text-sm font-bold text-ink mb-1 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-ink-mute" />
            {t.mostUsedDocuments}
          </h2>
          <p className="text-[11px] text-ink-mute mb-4">{t.mostUsedDocumentsSub}</p>
          {topDocuments.length === 0 ? (
            <p className="text-sm text-ink-mute py-8 text-center">{t.noCitationsYet}</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, topDocuments.length * 34)}>
              <BarChart data={topDocuments} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: c.axis }} allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="title"
                  tick={{ fontSize: 10, fill: c.axis }}
                  width={140}
                  axisLine={false}
                  tickLine={false}
                  {/* Not `t` — that is the translations object in this scope. */}
                  tickFormatter={(title: string) => (title.length > 22 ? title.slice(0, 21) + '…' : title)}
                />
                <Tooltip
                  cursor={{ fill: c.grid, opacity: 0.4 }}
                  contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 12, fontSize: 12, color: c.ink }}
                />
                <Bar dataKey="citations" fill={c.accent} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass rounded-2xl p-6">
          <h2 className="text-sm font-bold text-ink mb-1 flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-ink-mute" />
            {t.unansweredQuestions}
          </h2>
          {/* The actionable half of the page: each line is a topic worth uploading. */}
          <p className="text-[11px] text-ink-mute mb-4">{t.unansweredSub}</p>
          {ungrounded.length === 0 ? (
            <p className="text-sm text-ink-mute py-8 text-center">{t.allAnsweredFromDocs}</p>
          ) : (
            <ul className="space-y-2 max-h-[320px] overflow-y-auto">
              {ungrounded.map(q => (
                <li key={q.id} className="p-3 rounded-xl bg-overlay border border-line-soft">
                  <p className="text-[13px] text-ink leading-snug">{q.question}</p>
                  <p className="text-[10px] text-ink-mute mt-1">{new Date(q.createdAt).toLocaleDateString()}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
