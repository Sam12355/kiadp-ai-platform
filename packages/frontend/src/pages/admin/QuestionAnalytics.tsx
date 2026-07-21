import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MessageSquare, AlertTriangle, Users, TrendingUp,
  RefreshCw, AlertCircle, BarChart2,
} from 'lucide-react';
import apiClient from '../../api/client';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';

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

function VolumeChart({ data, labelAnswered, labelGaps, labelQuestions, labelLast30, labelNoActivity }: {
  data: DayVolume[];
  labelAnswered: string;
  labelGaps: string;
  labelQuestions: string;
  labelLast30: string;
  labelNoActivity: string;
}) {
  const [selected, setSelected] = useState<BarDetail | null>(null);

  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-ink-mute">
        {labelNoActivity}
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
        <div className="flex items-center gap-4 text-[10px] font-bold text-ink-mute">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/90" />
            {labelAnswered}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-red-500/90" />
            {labelGaps}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold">
          <span className="text-ink-soft">{totalAll} {labelQuestions}</span>
          {totalGapsAll > 0 && <span className="text-red-700/80">{totalGapsAll} {labelGaps.toLowerCase()}</span>}
          <span className="text-ink-mute">{labelLast30}</span>
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
              {/* Classes rather than fill/stroke attributes: the chart is drawn inline, so
                  these are the only colours here that have to follow the theme. */}
              <line x1={PAD_L} x2={W} y1={y} y2={y} className="stroke-line" strokeWidth="1" />
              <text x={PAD_L - 4} y={y + 4} fontSize="8" className="fill-ink-faint" textAnchor="end">
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
                  fill={isSelected ? 'rgba(5,150,105,1)' : 'rgba(16,185,129,0.9)'}
                  className="transition-all duration-100"
                />
              )}

              {/* Gap (red) portion — sits on top */}
              {gapH > 0 && (
                <rect
                  x={x} y={baseY - totalH}
                  width={barW} height={gapH}
                  rx="0"
                  fill={isSelected ? 'rgba(220,38,38,1)' : 'rgba(239,68,68,0.9)'}
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
                    ? (isSelected ? 'rgba(220,38,38,1)' : 'rgba(239,68,68,0.9)')
                    : (isSelected ? 'rgba(5,150,105,1)' : 'rgba(16,185,129,0.9)')}
                />
              )}

              {/* Empty placeholder */}
              {d.total === 0 && (
                <rect x={x} y={baseY - 2} width={barW} height={2} rx="1" className="fill-line" />
              )}

              {/* X label */}
              {showLabel && (
                <text x={x + barW / 2} y={H - 2} fontSize="7" className="fill-ink-faint" textAnchor="middle">
                  {shortDate(d.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Detail panel */}
      {selected ? (
        <div className="mt-3 p-3 rounded-xl bg-raised border border-line text-xs flex flex-wrap gap-4 animate-fade-in">
          <span className="font-bold text-ink">{fmtDate(selected.day)}</span>
          <span className="text-emerald-700">
            {selected.total} question{selected.total !== 1 ? 's' : ''}
          </span>
          <span className="text-emerald-700">
            {selected.total - selected.gaps} answered
          </span>
          {selected.gaps > 0 && (
            <span className="text-red-700 font-bold">
              {selected.gaps} knowledge gap{selected.gaps !== 1 ? 's' : ''}
            </span>
          )}
          {selected.gaps === 0 && (
            <span className="text-ink-mute">No gaps this day</span>
          )}
          <span className="text-ink-mute ms-auto">Click elsewhere to dismiss</span>
        </div>
      ) : (
        <p className="text-center text-[9px] text-ink-mute mt-2">
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
        <p className="text-xs text-ink-soft leading-tight line-clamp-2 flex-1">{label}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {hadGap && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-red-700 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/25">
              gap
            </span>
          )}
          <span className="text-[11px] font-black text-ink bg-overlay px-2 py-0.5 rounded-full">
            {count}x
          </span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-raised overflow-hidden">
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
    <div className="glass rounded-[1.5rem] p-6 relative overflow-hidden group hover:border-line transition-all duration-300 border border-line-soft">
      <div className="absolute top-0 ltr:right-0 rtl:left-0 p-5 opacity-10 group-hover:opacity-20 transition-opacity">
        <Icon className={`w-12 h-12 ${iconColor}`} />
      </div>
      <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center border mb-3`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <p className="text-[9px] font-black uppercase tracking-widest text-ink-mute mb-1">{label}</p>
      <p className="text-3xl font-black text-ink tracking-tighter" style={{ fontFamily: 'var(--font-heading)' }}>{value}</p>
      {sub && <p className={`text-[10px] font-bold mt-1 ${subColor ?? 'text-ink-mute'}`}>{sub}</p>}
    </div>
  );
}

// ---------- Load-more list --------------------------------------------------
const PAGE = 10;

function LoadMoreList<T>({ items, renderItem, loadMoreLabel }: { items: T[]; renderItem: (item: T, i: number) => React.ReactNode; loadMoreLabel?: (n: number, rem: number) => string }) {
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
          className="mt-4 w-full py-2 rounded-xl bg-raised hover:bg-overlay border border-line text-xs font-bold text-ink-mute hover:text-ink transition-all"
        >
          {loadMoreLabel
            ? loadMoreLabel(Math.min(PAGE, items.length - visible), items.length - visible)
            : `Load ${Math.min(PAGE, items.length - visible)} more (${items.length - visible} remaining)`}
        </button>
      )}
    </div>
  );
}

// ---------- Main page -------------------------------------------------------
export default function QuestionAnalytics() {
  const { lang } = useLanguageStore();
  const t = translations[lang];
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
            className="text-4xl font-black text-ink tracking-tight uppercase flex items-center gap-4"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            <div className="w-11 h-11 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/20">
              <BarChart2 className="w-5 h-5 text-purple-700" />
            </div>
            {t.questionAnalytics}
          </h1>
          <p className="text-ink-mute mt-2 font-medium ms-14 text-sm">
            {t.questionAnalyticsSubtitle}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-raised hover:bg-overlay border border-line text-xs text-ink-mute transition-all shrink-0"
          disabled={isFetching}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : t.refresh}
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 flex items-center gap-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {t.failedLoadAnalytics}
        </div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              icon={MessageSquare}
              color="bg-purple-500/20 border-purple-500/20"
              iconColor="text-purple-700"
              label={t.totalQuestions}
              value={data.summary.totalQuestions.toLocaleString()}
              sub={t.allTimeAllUsers}
            />
            <SummaryCard
              icon={TrendingUp}
              color="bg-emerald-500/20 border-emerald-500/20"
              iconColor="text-emerald-700"
              label={t.answeredByAi}
              value={data.summary.totalAnswered.toLocaleString()}
              sub={t.aiResponsesGenerated}
            />
            <SummaryCard
              icon={AlertTriangle}
              color="bg-red-500/20 border-red-500/20"
              iconColor="text-red-700"
              label={t.knowledgeGaps}
              value={data.summary.knowledgeGaps.toLocaleString()}
              sub={t.aiCouldNotAnswerKb}
            />
            <SummaryCard
              icon={Users}
              color="bg-sky-500/20 border-sky-500/20"
              iconColor="text-sky-700"
              label={t.gapRate}
              value={`${data.summary.gapPercent}%`}
              sub={data.summary.gapPercent >= 20 ? t.gapHigh : t.gapHealthy}
              subColor={data.summary.gapPercent >= 20 ? 'text-red-700' : 'text-emerald-700'}
            />
          </div>

          {/* Daily chart + top users */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass rounded-[1.5rem] p-6 border border-line-soft">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-ink-mute mb-5 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" />
                {t.last30Days}
              </h3>
              <VolumeChart
                data={data.dailyVolume}
                labelAnswered={t.answered}
                labelGaps={t.knowledgeGaps}
                labelQuestions={t.questionsLabel}
                labelLast30={t.last30Days}
                labelNoActivity={t.noActivity30Days}
              />
            </div>

            <div className="glass rounded-[1.5rem] p-6 border border-line-soft">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-ink-mute mb-5 flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />
                {t.topUsers}
              </h3>
              {data.topUsers.length === 0 ? (
                <p className="text-xs text-ink-mute italic">{t.noUserDataYet}</p>
              ) : (
                <div className="space-y-3">
                  {data.topUsers.map((u, i) => (
                    <div key={u.userId} className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-ink-mute w-4 text-center">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-ink truncate">{u.fullName}</p>
                        <p className="text-[10px] text-ink-mute truncate">{u.email}</p>
                      </div>
                      <span className="text-xs font-black text-purple-700 bg-purple-500/10 px-2 py-0.5 rounded-full shrink-0">
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
            <div className="glass rounded-[1.5rem] p-6 border border-line-soft">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-ink-mute mb-1 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5" />
                {t.mostAskedQuestions}
              </h3>
              <p className="text-[9px] text-ink-mute italic mb-5">
                {t.mostAskedSubtitle}
              </p>
              {data.topQuestions.length === 0 ? (
                <p className="text-xs text-ink-mute italic">{t.noQuestionsYet}</p>
              ) : (
                <LoadMoreList
                  items={data.topQuestions}
                  loadMoreLabel={(n, rem) => `${t.loadMore} ${n} (${rem} ${t.moreRemaining})`}
                  renderItem={(q, i) => (
                    <HBar key={i} label={q.text} count={q.count} max={data.topQuestions[0].count} hadGap={q.hadGap} />
                  )}
                />
              )}
            </div>

            {/* Knowledge gaps */}
            <div className="glass rounded-[1.5rem] p-6 border border-line-soft">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-2 text-red-700/80">
                <AlertTriangle className="w-3.5 h-3.5 text-red-700" />
                {t.knowledgeGaps}
              </h3>
              <p className="text-[9px] text-ink-mute italic mb-5">
                {t.knowledgeGapsSubtitle}
                {data.recentGaps.length > 0 && ` ${t.repeatedQuestionsNote}`}
              </p>
              {data.recentGaps.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-emerald-700">
                  <AlertTriangle className="w-8 h-8 opacity-30" />
                  <p className="text-xs font-bold">{t.noKnowledgeGaps}</p>
                </div>
              ) : (
                <LoadMoreList
                  items={data.recentGaps}
                  loadMoreLabel={(n, rem) => `${t.loadMore} ${n} (${rem} ${t.moreRemaining})`}
                  renderItem={(gap) => (
                    <div
                      key={gap.questionId}
                      className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 space-y-1.5 hover:border-red-500/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-ink leading-snug line-clamp-3 flex-1">{gap.questionText}</p>
                        {gap.times > 1 && (
                          <span className="text-[9px] font-black text-red-700 bg-red-500/15 px-1.5 py-0.5 rounded border border-red-500/25 shrink-0">
                            {gap.times}x
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-ink-mute truncate">
                          {gap.userName} &middot; {gap.userEmail}
                        </p>
                        <span
                          className="text-[10px] text-red-600/70 shrink-0 ms-2"
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
