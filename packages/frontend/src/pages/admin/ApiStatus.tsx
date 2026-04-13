import { useQuery } from '@tanstack/react-query';
import { Cloud, Database, Zap, Brain, Layers, Sparkles, AlertCircle, CheckCircle2, XCircle, MinusCircle, RefreshCw, ExternalLink } from 'lucide-react';
import apiClient from '../../api/client';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';

// ─── Types ───────────────────────────────────────────────────────────────────
interface UsageBar { usageBytes?: number; limitBytes?: number | null; usage?: number; limit?: number | null; usedPercent?: number | null; isUnlimited?: boolean }
interface SelfTracked { requests: number; inputTokens: number; outputTokens: number; byModel: Record<string, { requests: number; inputTokens: number; outputTokens: number }> }
interface CloudinaryInfo { configured: boolean; status: string; plan?: string; storage?: UsageBar; bandwidth?: UsageBar; transformations?: UsageBar; resources?: number; lastUpdated?: string; error?: string }
interface PineconeInfo  { configured: boolean; status: string; indexName?: string; vectorCount?: number; indexFullness?: number | null; fullnessReported?: boolean; dimension?: number; metric?: string; error?: string }
interface OpenAIInfo    { configured: boolean; status: string; models?: { chat: string; chatMini: string; embedding: string }; creditBalance?: number; creditGranted?: number; creditUsed?: number; creditsExpire?: string; monthlyUsageUsd?: number; selfTracked?: SelfTracked; error?: string }
interface GeminiInfo    { configured: boolean; status: string; chatModels?: string[]; voiceModel?: string; quotaVisibility?: string; selfTracked?: SelfTracked; error?: string }
interface GroqInfo      { configured: boolean; status: string; chatModels?: string[]; tier?: string; quotaVisibility?: string; selfTracked?: SelfTracked; error?: string }
interface CohereInfo    { configured: boolean; status: string; usage?: string; selfTracked?: SelfTracked; error?: string }

interface ApiStatusData {
  cloudinary: CloudinaryInfo;
  pinecone:   PineconeInfo;
  openai:     OpenAIInfo;
  gemini:     GeminiInfo;
  groq:       GroqInfo;
  cohere:     CohereInfo;
  trackingPeriod?: { from: string; to: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtBytes(b: number): string {
  if (b === 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === 'online')
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" /> Online
      </span>
    );
  if (status === 'unconfigured')
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)]">
        <MinusCircle className="w-3.5 h-3.5" /> Not set
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-400">
      <XCircle className="w-3.5 h-3.5" /> Error
    </span>
  );
}

function ProgressBar({ label, usedPercent, left, right }: { label: string; usedPercent: number; left: string; right: string }) {
  const pct = Math.min(usedPercent, 100);
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--color-secondary)]">
        <span>{label}</span>
        <span className="text-white">{left} / {right}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right text-[10px] font-bold text-[var(--color-secondary)]">{pct.toFixed(1)}% used</div>
    </div>
  );
}

function CardHeader({ icon: Icon, color, name, badge }: { icon: React.ElementType; color: string; name: string; badge: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center border border-white/10`}>
          <Icon className="w-4.5 h-4.5 text-white" />
        </div>
        <p className="text-sm font-black text-white uppercase tracking-wide">{name}</p>
      </div>
      {badge}
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 break-all">{msg}</p>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-white/[0.06] border border-white/10 text-[10px] font-bold text-[var(--color-secondary)] rounded-md px-2 py-0.5">{children}</span>
  );
}

// ─── Service cards ────────────────────────────────────────────────────────────
function CloudinaryCard({ d }: { d: CloudinaryInfo }) {
  return (
    <div className="glass rounded-[1.5rem] p-6 border border-white/5 space-y-4">
      <CardHeader icon={Cloud} color="bg-orange-500/20" name="Cloudinary" badge={<StatusBadge status={d.status} />} />
      {d.error && <ErrorMsg msg={d.error} />}
      {d.status === 'online' && d.storage && d.bandwidth && d.transformations && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)]">Plan</span>
            <Tag>{d.plan}</Tag>
            {d.resources !== undefined && <Tag>{fmtNum(d.resources)} files</Tag>}
          </div>
          <div className="space-y-4">
            {d.storage.isUnlimited ? (
              <Row label="Storage used" value={`${fmtBytes(d.storage.usageBytes ?? 0)} (unlimited plan)`} />
            ) : (
              <ProgressBar
                label="Storage"
                usedPercent={d.storage.usedPercent ?? 0}
                left={fmtBytes(d.storage.usageBytes ?? 0)}
                right={fmtBytes(d.storage.limitBytes ?? 0)}
              />
            )}
            {d.bandwidth.isUnlimited ? (
              <Row label="Bandwidth used" value={`${fmtBytes(d.bandwidth.usageBytes ?? 0)} (unlimited plan)`} />
            ) : (
              <ProgressBar
                label="Bandwidth"
                usedPercent={d.bandwidth.usedPercent ?? 0}
                left={fmtBytes(d.bandwidth.usageBytes ?? 0)}
                right={fmtBytes(d.bandwidth.limitBytes ?? 0)}
              />
            )}
            {d.transformations.isUnlimited ? (
              <Row label="Transformations used" value={`${fmtNum(d.transformations.usage ?? 0)} (unlimited plan)`} />
            ) : (
              <ProgressBar
                label="Transformations"
                usedPercent={d.transformations.usedPercent ?? 0}
                left={fmtNum(d.transformations.usage ?? 0)}
                right={fmtNum(d.transformations.limit ?? 0)}
              />
            )}
          </div>
          {d.lastUpdated && (
            <p className="text-[10px] text-[var(--color-secondary)] pt-1">
              Updated: {new Date(d.lastUpdated).toLocaleString()}
            </p>
          )}
        </>
      )}
      {!d.configured && <p className="text-[11px] text-[var(--color-secondary)]">Cloudinary env vars not configured.</p>}
    </div>
  );
}

function PineconeCard({ d }: { d: PineconeInfo }) {
  const fullnessPct = d.indexFullness !== null && d.indexFullness !== undefined ? +(d.indexFullness * 100).toFixed(2) : null;
  return (
    <div className="glass rounded-[1.5rem] p-6 border border-white/5 space-y-4">
      <CardHeader icon={Database} color="bg-emerald-500/20" name="Pinecone" badge={<StatusBadge status={d.status} />} />
      {d.error && <ErrorMsg msg={d.error} />}
      {d.status === 'online' && (
        <>
          <div className="flex flex-wrap gap-2 mb-2">
            {d.indexName && <Tag>{d.indexName}</Tag>}
            {d.metric && <Tag>{d.metric}</Tag>}
            {d.dimension && <Tag>{d.dimension}d</Tag>}
          </div>
          <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5 text-center">
            <p className="text-3xl font-black text-white tracking-tighter" style={{ fontFamily: 'var(--font-heading)' }}>
              {fmtNum(d.vectorCount ?? 0)}
            </p>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)] mt-1">Vectors indexed</p>
          </div>
          {fullnessPct !== null ? (
            <ProgressBar
              label="Index fullness"
              usedPercent={fullnessPct}
              left={`${fullnessPct.toFixed(2)}%`}
              right="100%"
            />
          ) : (
            <p className="text-[10px] text-[var(--color-secondary)] italic">Capacity % is not reported for this Pinecone index type.</p>
          )}
        </>
      )}
      {!d.configured && <p className="text-[11px] text-[var(--color-secondary)]">Pinecone not configured.</p>}
    </div>
  );
}

function OpenAICard({ d, period }: { d: OpenAIInfo; period?: string }) {
  return (
    <div className="glass rounded-[1.5rem] p-6 border border-white/5 space-y-3">
      <CardHeader icon={Sparkles} color="bg-violet-500/20" name="OpenAI" badge={<StatusBadge status={d.status} />} />
      {d.error && <ErrorMsg msg={d.error} />}

      {/* Credit balance — from billing API */}
      {d.creditBalance !== undefined ? (
        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)] mb-2">Credit balance</p>
          <div className="flex items-end gap-1.5">
            <span className="text-3xl font-black text-white tracking-tighter" style={{ fontFamily: 'var(--font-heading)' }}>
              ${d.creditBalance.toFixed(2)}
            </span>
            <span className="text-[10px] font-black text-[var(--color-secondary)] mb-1">USD remaining</span>
          </div>
          {d.creditGranted !== undefined && d.creditUsed !== undefined && (
            <ProgressBar
              label="Used"
              usedPercent={d.creditGranted > 0 ? +((d.creditUsed / d.creditGranted) * 100).toFixed(1) : 0}
              left={`$${d.creditUsed.toFixed(2)}`}
              right={`$${d.creditGranted.toFixed(2)}`}
            />
          )}
          {d.creditsExpire && <p className="text-[10px] text-[var(--color-secondary)] pt-1">Expires: {d.creditsExpire}</p>}
        </div>
      ) : (
        <p className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Credit balance not available for this account type — see billing dashboard.
        </p>
      )}

      {d.monthlyUsageUsd !== undefined && (
        <Row label="Spend this month" value={`$${d.monthlyUsageUsd.toFixed(4)}`} />
      )}
      {d.models && (
        <div className="space-y-2">
          <Row label="Chat" value={d.models.chat} />
          <Row label="Mini" value={d.models.chatMini} />
          <Row label="Embed" value={d.models.embedding} />
        </div>
      )}

      {/* Self-tracked token usage from our DB */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)] mb-2">Self-tracked usage (30 days)</p>
        <SelfTrackedBlock data={d.selfTracked} period={period} />
      </div>

      <a
        href="https://platform.openai.com/usage"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-violet-400 hover:text-violet-300 transition-colors pt-1"
      >
        <ExternalLink className="w-3 h-3" /> OpenAI billing dashboard
      </a>
    </div>
  );
}

function GeminiCard({ d, period }: { d: GeminiInfo; period?: string }) {
  return (
    <div className="glass rounded-[1.5rem] p-6 border border-white/5 space-y-3">
      <CardHeader icon={Brain} color="bg-blue-500/20" name="Gemini" badge={<StatusBadge status={d.status} />} />
      {d.error && <ErrorMsg msg={d.error} />}
      {d.chatModels && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)]">Chat fallback chain</p>
          <div className="flex flex-col gap-1">
            {d.chatModels.map(m => <Tag key={m}>{m}</Tag>)}
          </div>
        </div>
      )}
      {d.voiceModel && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)]">Voice model</p>
          <Tag>{d.voiceModel}</Tag>
        </div>
      )}
      {!d.configured && <p className="text-[11px] text-[var(--color-secondary)]">GEMINI_API_KEY not set.</p>}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)] mb-2">Self-tracked usage (30 days)</p>
        <SelfTrackedBlock
          data={d.selfTracked}
          period={period}
          emptyText={d.quotaVisibility === 'provider-does-not-expose-balance-via-api-key'
            ? 'Gemini does not expose historical balance via API key. This shows usage tracked from your app traffic.'
            : undefined}
        />
      </div>
      <a
        href="https://aistudio.google.com/app/usage"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors"
      >
        <ExternalLink className="w-3 h-3" /> AI Studio usage
      </a>
    </div>
  );
}

function GroqCard({ d, period }: { d: GroqInfo; period?: string }) {
  return (
    <div className="glass rounded-[1.5rem] p-6 border border-white/5 space-y-3">
      <CardHeader icon={Zap} color="bg-amber-500/20" name="Groq" badge={<StatusBadge status={d.status} />} />
      {d.error && <ErrorMsg msg={d.error} />}
      {d.tier && <Row label="Tier" value={d.tier} />}
      {d.chatModels && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)]">Chat fallback models</p>
          <div className="flex flex-col gap-1">
            {d.chatModels.map(m => <Tag key={m}>{m}</Tag>)}
          </div>
        </div>
      )}
      {!d.configured && <p className="text-[11px] text-[var(--color-secondary)]">GROQ_API_KEY not set.</p>}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)] mb-2">Self-tracked usage (30 days)</p>
        <SelfTrackedBlock
          data={d.selfTracked}
          period={period}
          emptyText={d.quotaVisibility === 'provider-does-not-expose-balance-via-api-key'
            ? 'Groq does not expose account balance via API key. This shows usage tracked from your app traffic.'
            : undefined}
        />
      </div>
    </div>
  );
}

function CohereCard({ d, period }: { d: CohereInfo; period?: string }) {
  return (
    <div className="glass rounded-[1.5rem] p-6 border border-white/5 space-y-3">
      <CardHeader icon={Layers} color="bg-pink-500/20" name="Cohere" badge={<StatusBadge status={d.status} />} />
      {d.error && <ErrorMsg msg={d.error} />}
      {d.usage && <Row label="Used for" value={d.usage} />}
      {!d.configured && <p className="text-[11px] text-[var(--color-secondary)]">COHERE_API_KEY not set.</p>}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)] mb-2">Self-tracked usage (30 days)</p>
        <SelfTrackedBlock data={d.selfTracked} period={period} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-2.5 border border-white/5">
      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)]">{label}</span>
      <span className="text-[11px] font-bold text-white font-mono">{value}</span>
    </div>
  );
}

function SelfTrackedBlock({ data, period, emptyText }: { data?: SelfTracked | null; period?: string; emptyText?: string }) {
  if (!data || data.requests === 0) return (
    <p className="text-[10px] text-[var(--color-secondary)] italic pt-1">{emptyText ?? 'No usage recorded in the selected period.'}</p>
  );
  const modelEntries = Object.entries(data.byModel).sort((a, b) => b[1].requests - a[1].requests);
  return (
    <div className="space-y-2 pt-1">
      {period && <p className="text-[10px] font-bold text-[var(--color-secondary)] uppercase tracking-wider">{period}</p>}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Requests used', val: fmtNum(data.requests) },
          { label: 'Models active', val: fmtNum(modelEntries.length) },
        ].map(({ label, val }) => (
          <div key={label} className="bg-white/[0.04] rounded-xl p-2.5 border border-white/5 text-center">
            <p className="text-base font-black text-white tracking-tighter" style={{ fontFamily: 'var(--font-heading)' }}>{val}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--color-secondary)] mt-0.5">{label}</p>
          </div>
        ))}
      </div>
      {modelEntries.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)]">Usage split (used out of service total)</p>
          {modelEntries.map(([mdl, stats]) => {
            const pct = data.requests > 0 ? (stats.requests / data.requests) * 100 : 0;
            return (
              <div key={mdl} className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-[var(--color-secondary)] font-mono truncate max-w-[150px]">{mdl}</span>
                  <span className="text-white font-bold">{fmtNum(stats.requests)} / {fmtNum(data.requests)} ({pct.toFixed(1)}%)</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ApiStatus() {
  const { lang } = useLanguageStore();
  const t = translations[lang];
  const { data, isLoading, error, refetch, isFetching } = useQuery<ApiStatusData>({
    queryKey: ['admin-api-status'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/api-status');
      return data.data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
            <Sparkles className="w-5 h-5 text-emerald-400" />
          </div>
          {t.apiServicesQuotas}
        </h2>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)] hover:text-white transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {t.refresh}
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-3 text-[var(--color-secondary)]">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-bold">Checking all services…</span>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-300 text-sm font-bold">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Failed to load API status.
        </div>
      )}

      {/* Cards grid */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          <CloudinaryCard d={data.cloudinary} />
          <PineconeCard   d={data.pinecone} />
          <OpenAICard     d={data.openai}  period={data.trackingPeriod ? `${data.trackingPeriod.from} → ${data.trackingPeriod.to}` : undefined} />
          <GeminiCard     d={data.gemini}  period={data.trackingPeriod ? `${data.trackingPeriod.from} → ${data.trackingPeriod.to}` : undefined} />
          <GroqCard       d={data.groq}    period={data.trackingPeriod ? `${data.trackingPeriod.from} → ${data.trackingPeriod.to}` : undefined} />
          <CohereCard     d={data.cohere}  period={data.trackingPeriod ? `${data.trackingPeriod.from} → ${data.trackingPeriod.to}` : undefined} />
        </div>
      )}
    </div>
  );
}
