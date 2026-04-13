import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MessageSquare, AlertTriangle, Users, TrendingUp,
  RefreshCw, AlertCircle, BarChart2,
} from 'lucide-react';
import apiClient from '../../api/client';

// ---------- Types -----------------------------------------------------------
interface Summary {
  totalQuestions: number;
  totalAnswered: number;
  knowledgeGaps: number;
  gapPercent: number;
}

interface DayVolume { day: string; total: number; gaps: number }

interface TopUser {
  userId: string;
  fullName: string;
  email: string;
  questionCount: number;
}

interface GapQuestion {
  questionId: string;
  questionText: string;
  userId: string;
  userName: string;
  userEmail: string;
  askedAt: string;
  times: number;
}

interface TopQuestion {
  text: string;
  count: number;
  lastAsked: string;
  hadGap: boolean;
}

interface AnalyticsData {
  summary: Summary;
  dailyVolume: DayVolume[];
  topUsers: TopUser[];
  recentGaps: GapQuestion[];
  topQuestions: TopQuestion[];
}

// ---------- Helpers ---------------------------------------------------------
function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function shortDate(isoOrDate: string): string {
  const d = new Date(isoOrDate.length === 10 ? isoOrDate + 'T00:00:00Z' : isoOrDate);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ---------- Bar Chart -------------------------------------------------------
interface BarDetail { day: string; total: number; gaps: number }

function VolumeChart({ data }: { data: DayVolume[] }) {
  const [selected, setSelected] = useState<BarDetail | null>(null);

  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-[var(--color-secondary)]">
        No activity in the last 30 days
      </div>
    );
  }

  const W = 560;
  const H = 120;
  const PAD_L = 30;
  const PAD_B = 20;
  const BAR_GAP = 2;
  const chartW = W - PAD_L;
  const chartH = H - PAD_B;

  const maxTotal = Math.max(...data.map(d => d.total), 1);
  const barW = Math.max(4, Math.floor((chartW - BAR_GAP * data.length) / data.length));
  const totalAll = data.reduce((s, d) => s + d.total, 0);
  const totalGapsAll = data.reduce((s, d) => s + d.gaps, 0);

  const yTicks = [0, Math.round(maxTotal / 2), maxTotal];

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-4 text-[10px] font-bold text-[var(--color-secondary)]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-400/70" />
            Answered
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-red-400/70" />
            Knowledge gaps
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold">
          <span className="text-white/60">{totalAll} questions</span>
          {totalGapsAll > 0 && <span className="text-red-400/80">{totalGapsAll} gaps</span>}
          <span className="text-[var(--color-secondary)]">last 30 days</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-pointer"
        style={{ height: 130 }}
        onClick={() => setSelected(null)}
      >
        {/* Y grid + labels */}
        {yTicks.map(tick => {
          const y = PAD_B / 2 + chartH - (tick / maxTotal) * chartH;
          return (
            <g key={tick}>
              <line x1={PAD_L} x2={W} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <text x={PAD_L - 4} y={y + 4} fontSize="8" fill="rgba(255,255,255,0.3)" textAnchor="end">
                {tick}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const totalH = Math.max(d.total > 0 ? 2 : 0, (d.total / maxTotal) * chartH);
          const gapH = d.total > 0 ? (d.gaps / d.total) * totalH : 0;
          const answeredH = totalH - gapH;
          const x = PAD_L + i * (barW + BAR_GAP);
          const baseY = PAD_B / 2 + chartH;
          const isSelected = selected?.day === d.day;
          const showLabel = i === 0 || i === data.length - 1 || i % 7 === 0;

          return (
            <g
              key={d.day}
              onClick={(e) => {
                e.stopPropagation();
                setSelected(isSelected ? null : d);
              }}
              style={{ cursor: 'pointer' }}
            >
              <title>
                {shortDate(d.day)}: {d.total} question{d.total !== 1 ? 's' : ''}
                {d.gaps > 0 ? `, ${d.gaps} gap${d.gaps !== 1 ? 's' : ''}` : ''}
              </title>

              {/* Answered (green) portion */}
              {answeredH > 0 && (
                <rect
                  x={x} y={baseY - totalH}
                  width={barW} height={answeredH}
                  rx="0"
                  fill={isSelected ? 'rgba(52,211,153,0.95)' : 'rgba(52,211,153,0.65)'}
                  className="transition-all duration-100"
                />
              )}

              {/* Gap (red) portion — sits on top */}
              {gapH > 0 && (
                <rect
                  x={x} y={baseY - totalH}
                  width={barW} height={gapH}
                  rx="0"
                  fill={isSelected ? 'rgba(248,113,113,0.95)' : 'rgba(248,113,113,0.75)'}
                  className="transition-all duration-100"
                />
              )}

              {/* Rounded top cap */}
              {totalH > 0 && (
                <rect
                  x={x} y={baseY - totalH}
                  width={barW} height={Math.min(2, totalH)}
                  rx="1"
                  fill={d.gaps >= d.total && d.total > 0
                    ? (isSelected ? 'rgba(248,113,113,0.95)' : 'rgba(248,113,113,0.75)')
                    : (isSelected ? 'rgba(52,211,153,0.95)' : 'rgba(52,211,153,0.65)')}
                />
              )}

              {/* Empty placeholder */}
              {d.total === 0 && (
                <rect x={x} y={baseY - 2} width={barW} height={2} rx="1" fill="rgba(255,255,255,0.04)" />
              )}

              {/* X label */}
              {showLabel && (
                <text x={x + barW / 2} y={H - 2} fontSize="7" fill="rgba(255,255,255,0.25)" textAnchor="middle">
                  {shortDate(d.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Detail panel */}
      {selected ? (
        <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10 text-xs flex flex-wrap gap-4 animate-fade-in">
          <span className="font-bold text-white">{fmtDate(selected.day)}</span>
          <span className="text-emerald-400">
            {selected.total} question{selected.total !== 1 ? 's' : ''}
          </span>
          <span className="text-emerald-400">
            {selected.total - selected.gaps} answered
          </span>
          {selected.gaps > 0 && (
            <span className="text-red-400 font-bold">
              {selected.gaps} knowledge gap{selected.gaps !== 1 ? 's' : ''}
            </span>
          )}
          {selected.gaps === 0 && (
            <span className="text-[var(--color-secondary)]">No gaps this day</span>
          )}
          <span className="text-[var(--color-secondary)] ms-auto">Click elsewhere to dismiss</span>
        </div>
      ) : (
        <p className="text-center text-[9px] text-[var(--color-secondary)] mt-2">
          Click a bar to see daily details
        </p>
      )}
    </div>
  );
}

// ---------- Frequency bar ---------------------------------------------------
function HBar({ label, count, max, hadGap }: { label: string; count: number; max: number; hadGap: boolean }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-white/80 leading-tight line-clamp-2 flex-1">{label}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {hadGap && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/20">
              gap
            </span>
          )}
          <span className="text-[11px] font-black text-white bg-white/10 px-2 py-0.5 rounded-full">
            {count}x
          </span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${hadGap ? 'bg-red-500/60' : 'bg-emerald-500/60'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------- Summary card ----------------------------------------------------
function SummaryCard({
  icon: Icon, color, iconColor, label, value, sub, subColor,
}: {
  icon: React.ElementType;
  color: string;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div className="glass rounded-[1.5rem] p-6 relative overflow-hidden group hover:border-white/10 transition-all duration-300 border border-white/5">
      <div className="absolute top-0 ltr:right-0 rtl:left-0 p-5 opacity-10 group-hover:opacity-20 transition-opacity">
        <Icon className={`w-12 h-12 ${iconColor}`} />
      </div>
      <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center border mb-3`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <p className="text-[9px] font-black uppercase tracking-widest text-[var(--color-secondary)] mb-1">{label}</p>
      <p className="text-3xl font-black text-white tracking-tighter" style={{ fontFamily: 'var(--font-heading)' }}>{value}</p>
      {sub && <p className={`text-[10px] font-bold mt-1 ${subColor ?? 'text-[var(--color-secondary)]'}`}>{sub}</p>}
    </div>
  );
}

// ---------- Load-more list --------------------------------------------------
const PAGE = 10;

function LoadMoreList<T>({ items, renderItem }: { items: T[]; renderItem: (item: T, i: number) => React.ReactNode }) {
  const [visible, setVisible] = useState(PAGE);
  const shown = items.slice(0, visible);
  return (
    <div>
      <div className="space-y-3.5 overflow-y-auto pr-1" style={{ maxHeight: 420 }}>
        {shown.map((item, i) => renderItem(item, i))}
      </div>
      {visible < items.length && (
        <button
          onClick={() => setVisible(v => v + PAGE)}
          className="mt-4 w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-[var(--color-secondary)] hover:text-white transition-all"
        >
          Load {Math.min(PAGE, items.length - visible)} more ({items.length - visible} remaining)
        </button>
      )}
    </div>
  );
}

// ---------- Main page -------------------------------------------------------
export default function QuestionAnalytics() {
  const { data, isLoading, error, isFetching, refetch, dataUpdatedAt } = useQuery<AnalyticsData>({
    queryKey: ['admin-question-analytics'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/question-analytics');
      return data.data as AnalyticsData;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return (
    <div className="animate-fade-in max-w-7xl mx-auto space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-4xl font-black text-white tracking-tight uppercase flex items-center gap-4"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            <div className="w-11 h-11 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/20">
              <BarChart2 className="w-5 h-5 text-purple-400" />
            </div>
            Question Analytics
          </h1>
          <p className="text-[var(--color-secondary)] mt-2 font-medium ms-14 text-sm">
            Real data from your database - user activity, knowledge gaps, and conversation trends
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-[var(--color-secondary)] transition-all shrink-0"
          disabled={isFetching}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : 'Refresh'}
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 flex items-center gap-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Failed to load question analytics.
        </div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              icon={MessageSquare}
              color="bg-purple-500/20 border-purple-500/20"
              iconColor="text-purple-400"
              label="Total Questions"
              value={data.summary.totalQuestions.toLocaleString()}
              sub="all time, all users"
            />
            <SummaryCard
              icon={TrendingUp}
              color="bg-emerald-500/20 border-emerald-500/20"
              iconColor="text-emerald-400"
              label="Answered"
              value={data.summary.totalAnswered.toLocaleString()}
              sub="AI responses generated"
            />
            <SummaryCard
              icon={AlertTriangle}
              color="bg-red-500/20 border-red-500/20"
              iconColor="text-red-400"
              label="Knowledge Gaps"
              value={data.summary.knowledgeGaps.toLocaleString()}
              sub="AI could not answer from KB"
            />
            <SummaryCard
              icon={Users}
              color="bg-sky-500/20 border-sky-500/20"
              iconColor="text-sky-400"
              label="Gap Rate"
              value={`${data.summary.gapPercent}%`}
              sub={data.summary.gapPercent >= 20 ? 'High - review KB coverage' : 'Healthy coverage'}
              subColor={data.summary.gapPercent >= 20 ? 'text-red-400' : 'text-emerald-400'}
            />
          </div>

          {/* Daily chart + top users */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass rounded-[1.5rem] p-6 border border-white/5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)] mb-5 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" />
                Daily question volume - last 30 days
              </h3>
              <VolumeChart data={data.dailyVolume} />
            </div>

            <div className="glass rounded-[1.5rem] p-6 border border-white/5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)] mb-5 flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />
                Most active users
              </h3>
              {data.topUsers.length === 0 ? (
                <p className="text-xs text-[var(--color-secondary)] italic">No user data yet</p>
              ) : (
                <div className="space-y-3">
                  {data.topUsers.map((u, i) => (
                    <div key={u.userId} className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-[var(--color-secondary)] w-4 text-center">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{u.fullName}</p>
                        <p className="text-[10px] text-[var(--color-secondary)] truncate">{u.email}</p>
                      </div>
                      <span className="text-xs font-black text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full shrink-0">
                        {u.questionCount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Most asked + Knowledge gaps */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Most asked questions */}
            <div className="glass rounded-[1.5rem] p-6 border border-white/5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)] mb-1 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5" />
                Most asked questions
              </h3>
              <p className="text-[9px] text-[var(--color-secondary)] italic mb-5">
                Grouped from recent 500 questions. Red bars = answers that resulted in a knowledge gap.
              </p>
              {data.topQuestions.length === 0 ? (
                <p className="text-xs text-[var(--color-secondary)] italic">No questions yet</p>
              ) : (
                <LoadMoreList
                  items={data.topQuestions}
                  renderItem={(q, i) => (
                    <HBar key={i} label={q.text} count={q.count} max={data.topQuestions[0].count} hadGap={q.hadGap} />
                  )}
                />
              )}
            </div>

            {/* Knowledge gaps */}
            <div className="glass rounded-[1.5rem] p-6 border border-white/5">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-2 text-red-400/80">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                Knowledge gaps
              </h3>
              <p className="text-[9px] text-[var(--color-secondary)] italic mb-5">
                Unique questions the AI could not answer from the knowledge base. Deduplicated.
                {data.recentGaps.length > 0 && ` Repeated questions show a count badge.`}
              </p>
              {data.recentGaps.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-emerald-400">
                  <AlertTriangle className="w-8 h-8 opacity-30" />
                  <p className="text-xs font-bold">No knowledge gaps - great coverage!</p>
                </div>
              ) : (
                <LoadMoreList
                  items={data.recentGaps}
                  renderItem={(gap) => (
                    <div
                      key={gap.questionId}
                      className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 space-y-1.5 hover:border-red-500/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-white/90 leading-snug line-clamp-3 flex-1">{gap.questionText}</p>
                        {gap.times > 1 && (
                          <span className="text-[9px] font-black text-red-300 bg-red-400/15 px-1.5 py-0.5 rounded border border-red-400/20 shrink-0">
                            {gap.times}x
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-[var(--color-secondary)] truncate">
                          {gap.userName} &middot; {gap.userEmail}
                        </p>
                        <span
                          className="text-[10px] text-red-400/60 shrink-0 ms-2"
                          title={fmtDate(gap.askedAt)}
                        >
                          {relativeTime(gap.askedAt)}
                        </span>
                      </div>
                    </div>
                  )}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
