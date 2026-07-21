import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { FileText, HelpCircle, Users, AlertCircle, Key, TrendingUp, CheckCircle2, XCircle, Clock, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import OnboardingWizard from './Onboarding';

interface TenantStats {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  logoUrl: string | null;
  _count: { users: number; documents: number; questions: number };
}

interface Analytics {
  daily: { day: string; questions: number }[];
  recent: {
    id: string;
    question: string;
    askedBy: string;
    createdAt: string;
    confidence: number | null;
    isGrounded: boolean | null;
  }[];
  docStatuses: { status: string; count: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#10b981',
  PROCESSING: '#f59e0b',
  QUEUED: '#3b82f6',
  UPLOADED: '#6366f1',
  FAILED: '#ef4444',
  ARCHIVED: '#6b7280',
};

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ef4444', '#6b7280'];

/** Recharts takes literal colours as props, so it cannot inherit the theme from CSS. */
function chartColors() {
  const s = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    axis: read('--t-ink-faint', '#94a3b8'),
    grid: read('--t-line', '#e2e8f0'),
    surface: read('--t-raised', '#ffffff'),
    ink: read('--t-ink', '#0f172a'),
  };
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function SchoolDashboard() {
  const { user } = useAuthStore();
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Subscribing to the theme is what re-reads the variables after a toggle: the chart holds
  // its colours as props, so nothing repaints without a render.
  const theme = useThemeStore((s) => s.theme);
  const chart = useMemo(() => chartColors(), [theme]);

  const { data: tenant, isLoading, error } = useQuery<TenantStats>({
    queryKey: ['school-tenant', user?.tenantId],
    queryFn: async () => {
      const result = (await apiClient.get(`/tenants/${user?.tenantId}`)).data.data;
      // Auto-trigger onboarding for fresh institutions (no docs yet)
      if (result._count.documents === 0) setShowOnboarding(true);
      return result;
    },
    enabled: !!user?.tenantId,
    refetchInterval: 30000,
  });

  const { data: analytics } = useQuery<Analytics>({
    queryKey: ['school-analytics', user?.tenantId],
    queryFn: async () => (await apiClient.get(`/tenants/${user?.tenantId}/analytics`)).data.data,
    enabled: !!user?.tenantId,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/50 rounded-xl text-red-700 dark:text-red-400 flex items-center gap-3">
        <AlertCircle className="w-5 h-5" />
        <p>Failed to load institution data.</p>
      </div>
    );
  }

  const statCards = [
    { name: 'Documents', value: tenant._count.documents, icon: FileText, href: '/school/documents', color: 'text-blue-700 dark:text-blue-400' },
    { name: 'Questions Answered', value: tenant._count.questions.toLocaleString(), icon: HelpCircle, href: null, color: 'text-emerald-700 dark:text-emerald-400' },
    { name: 'Users', value: tenant._count.users, icon: Users, href: '/school/users', color: 'text-purple-700 dark:text-purple-400' },
  ];

  const totalInChart = analytics?.daily.reduce((s, d) => s + d.questions, 0) ?? 0;
  const hasDocBreakdown = (analytics?.docStatuses.length ?? 0) > 0;

  return (
    <div className="animate-fade-in max-w-5xl mx-auto space-y-8">
      {showOnboarding && tenant && (
        <OnboardingWizard
          tenantId={tenant.id}
          tenantName={tenant.name}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {tenant.logoUrl && (
            <img src={tenant.logoUrl} alt={tenant.name} className="w-14 h-14 rounded-2xl object-cover border border-line shadow-lg" />
          )}
          <div>
            <h1 className="text-4xl font-black text-ink tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>
              {tenant.name}
            </h1>
            <p className="text-ink-mute mt-1 font-medium text-sm uppercase tracking-widest">
              Institution Dashboard · {tenant.slug}
              {!tenant.isActive && <span className="ml-3 text-red-700 dark:text-red-400">· Inactive</span>}
            </p>
          </div>
        </div>
        <button onClick={() => setShowOnboarding(true)}
          title="Setup wizard"
          className="flex items-center gap-2 px-4 py-2.5 bg-raised hover:bg-overlay border border-line text-ink-mute hover:text-ink rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
          <Sparkles className="w-3.5 h-3.5" /> Setup Guide
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          const card = (
            <div className="glass rounded-[1.5rem] p-8 relative overflow-hidden group hover:border-blue-500/30 transition-all duration-300">
              <div className="absolute top-0 ltr:right-0 rtl:left-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                <Icon className={`w-14 h-14 ${stat.color}`} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-ink-mute mb-2">{stat.name}</p>
              <p className="text-4xl font-black text-ink tracking-tighter" style={{ fontFamily: 'var(--font-heading)' }}>
                {stat.value}
              </p>
            </div>
          );
          return stat.href ? <Link key={stat.name} to={stat.href}>{card}</Link> : <div key={stat.name}>{card}</div>;
        })}
      </div>

      {/* Activity chart + doc breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Questions over time */}
        <div className="lg:col-span-2 glass rounded-[1.5rem] p-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-ink-mute">Questions — Last 14 Days</h2>
              <p className="text-2xl font-black text-ink mt-1">{totalInChart.toLocaleString()}</p>
            </div>
            <TrendingUp className="w-5 h-5 text-blue-700 dark:text-blue-400" />
          </div>
          {analytics && analytics.daily.some(d => d.questions > 0) ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={analytics.daily} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
                <defs>
                  <linearGradient id="qGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tickFormatter={fmt} tick={{ fontSize: 10, fill: chart.axis }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tick={{ fontSize: 10, fill: chart.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                {/* labelFormatter receives the label as ReactNode, unlike XAxis's
                    tickFormatter which passes the raw string, so fmt is wrapped. */}
                <Tooltip
                  contentStyle={{ background: chart.surface, border: `1px solid ${chart.grid}`, borderRadius: '12px', fontSize: 12 }}
                  labelStyle={{ color: chart.axis }}
                  itemStyle={{ color: '#2563eb' }}
                  labelFormatter={(label) => fmt(String(label))}
                />
                <Area type="monotone" dataKey="questions" stroke="#3b82f6" strokeWidth={2} fill="url(#qGrad)" dot={false} activeDot={{ r: 4, fill: '#3b82f6' }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-ink-faint text-sm">No questions yet in the past 14 days.</div>
          )}
        </div>

        {/* Document status breakdown */}
        <div className="glass rounded-[1.5rem] p-8 space-y-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-ink-mute">Documents by Status</h2>
          {hasDocBreakdown ? (
            <>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={analytics!.docStatuses} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={30} outerRadius={50}>
                    {analytics!.docStatuses.map((entry, i) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: chart.surface, border: `1px solid ${chart.grid}`, borderRadius: '12px', fontSize: 12 }}
                    itemStyle={{ color: chart.ink }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {analytics!.docStatuses.map((s, i) => (
                  <div key={s.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[s.status] ?? PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-[11px] text-ink-mute font-medium capitalize">{s.status.toLowerCase()}</span>
                    </div>
                    <span className="text-[11px] font-black text-ink">{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-32 text-ink-faint text-sm">No documents yet.</div>
          )}
        </div>
      </div>

      {/* Recent questions */}
      <div className="glass rounded-[1.5rem] p-8 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-ink-mute">Recent Questions</h2>
        {(analytics?.recent.length ?? 0) === 0 ? (
          <p className="text-ink-faint text-sm italic">No questions have been asked yet.</p>
        ) : (
          <div className="space-y-2">
            {analytics!.recent.map((q) => (
              <div key={q.id} className="flex items-start gap-3 p-3 bg-raised border border-line-soft rounded-2xl hover:border-line transition-all">
                <div className="mt-0.5 flex-shrink-0">
                  {q.isGrounded === true ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  ) : q.isGrounded === false ? (
                    <XCircle className="w-4 h-4 text-red-700 dark:text-red-400" />
                  ) : (
                    <Clock className="w-4 h-4 text-ink-faint" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink font-medium truncate">{q.question}</p>
                  <p className="text-[10px] text-ink-faint mt-0.5">
                    {q.askedBy} · {fmt(q.createdAt)}
                    {q.confidence != null && (
                      <span className="ml-2 text-blue-700 dark:text-blue-400">{Math.round(q.confidence * 100)}% confidence</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="glass rounded-[1.5rem] p-8 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-ink-mute">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link to="/school/documents" className="flex items-center gap-3 px-5 py-4 bg-raised hover:bg-overlay border border-line-soft hover:border-blue-500/30 rounded-2xl transition-all group">
            <FileText className="w-5 h-5 text-blue-700 dark:text-blue-400 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold text-ink">Upload Document</span>
          </Link>
          <Link to="/school/users" className="flex items-center gap-3 px-5 py-4 bg-raised hover:bg-overlay border border-line-soft hover:border-blue-500/30 rounded-2xl transition-all group">
            <Users className="w-5 h-5 text-blue-700 dark:text-blue-400 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold text-ink">Manage Users</span>
          </Link>
          <Link to="/school/api-keys" className="flex items-center gap-3 px-5 py-4 bg-raised hover:bg-overlay border border-line-soft hover:border-blue-500/30 rounded-2xl transition-all group">
            <Key className="w-5 h-5 text-blue-700 dark:text-blue-400 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold text-ink">API Keys</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
