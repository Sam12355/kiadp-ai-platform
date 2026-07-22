import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import Portal from '../../components/Portal';
import { useImpersonationStore } from '../../store/impersonationStore';
import {
  Building2, Plus, Users, FileText, HelpCircle, ChevronRight, X,
  AlertCircle, UserPlus, UserMinus, ToggleLeft, ToggleRight, Search,
  Lock, Mail, User, Save, Trash2, RefreshCw, Pencil, Upload, Eye,
  CalendarClock, FlaskConical, Layers, Gauge, CreditCard, ArrowRight,
} from 'lucide-react';

type Plan = 'trial' | 'paid';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  plan: string;
  trialEndsAt: string | null;
  /** Rung on the student ladder. Null = no plan assigned. */
  studentCap: number | null;
  /** Included questions per month. Null = unmetered. */
  questionsPerMonth: number | null;
  questionCredits: number;
  /** This month's counter, joined by the list endpoint so rows need no extra request. */
  usedThisMonth?: number;
  allowAdvancedModel: boolean;
  _count: { users: number; documents: number; questions: number };
}

/** A rung on the price list, as served by GET /tenants/plans. */
interface PlanBand {
  students: number;
  pricePerYear: number;
  pricePerStudent: number;
  questionsPerMonth: number;
  allowAdvancedModel: boolean;
}

interface CreditPack {
  questions: number;
  priceLkr: number;
  pricePerQuestion: number;
}

interface PlansCatalog {
  bands: PlanBand[];
  creditPacks: CreditPack[];
}

interface Usage {
  used: number;
  /** Null when the institution is unmetered. */
  limit: number | null;
  remaining: number | null;
  credits: number;
  exhausted: boolean;
  /** "YYYY-MM". */
  month: string;
  studentCap?: number | null;
  allowAdvancedModel?: boolean;
  plan?: string;
}

interface TenantUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  tenantId: string | null;
}

interface Doc {
  id: string;
  title: string;
  originalFilename: string;
  status: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  READY: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  PROCESSING: 'text-yellow-700 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/25',
  UPLOADED: 'text-blue-700 dark:text-blue-400 bg-blue-500/10 border-blue-500/25',
  FAILED: 'text-red-700 dark:text-red-400 bg-red-500/10 border-red-500/25',
};

/** Countdown wording. Ceil so "7 days" reads as "7 days left", not "6". */
function formatRemaining(ms: number): string {
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins} min left`;
  const hrs = Math.ceil(mins / 60);
  if (hrs < 48) return `${hrs} hr left`;
  return `${Math.ceil(hrs / 24)} days left`;
}

/** Billing state as shown to the operator, derived from plan + trialEndsAt vs now. */
function trialState(t: Pick<Tenant, 'plan' | 'trialEndsAt'>): { label: string; tone: string } {
  if (t.plan === 'paid') {
    return { label: 'Paid', tone: 'text-blue-700 dark:text-blue-400 bg-blue-500/10 border-blue-500/25' };
  }
  if (!t.trialEndsAt) {
    return { label: 'Trial · no expiry', tone: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25' };
  }
  const ms = new Date(t.trialEndsAt).getTime() - Date.now();
  if (ms <= 0) {
    return { label: 'Trial expired', tone: 'text-red-700 dark:text-red-400 bg-red-500/10 border-red-500/25' };
  }
  const tone = ms < 86_400_000
    ? 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/25'
    : 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25';
  return { label: formatRemaining(ms), tone };
}

const fmtNum = (n: number): string => n.toLocaleString('en-US');

/** "2026-07" → "July 2026". Parsed as UTC because the backend keys months in UTC. */
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The two things a band decides: how many questions, and which model answers them. */
function PlanFacts({ questionsPerMonth, advanced }: { questionsPerMonth: number | null; advanced: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <span className="font-bold text-ink">
        {questionsPerMonth == null ? 'Unmetered' : `${fmtNum(questionsPerMonth)} q/mo`}
      </span>
      <span className={advanced ? 'text-emerald-700 dark:text-emerald-400' : 'text-ink-faint'}>
        {advanced ? 'gpt-4o included' : 'gpt-4o-mini only'}
      </span>
    </span>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-surface border border-line-soft rounded-xl px-3 py-2 min-w-0">
      <p className="text-[9px] font-black uppercase tracking-widest text-ink-faint">{label}</p>
      <p className={`text-xs font-bold mt-0.5 truncate ${tone ?? 'text-ink'}`}>{value}</p>
    </div>
  );
}

/**
 * The compact plan/usage line on a list row. `used` is only known for the institution
 * currently selected — the list endpoint carries the allowance, not the month's count —
 * so rows fall back to showing what the plan includes.
 */
function listQuotaLabel(t: Tenant, used: number | null): string {
  if (t.questionsPerMonth == null) return 'unmetered';
  const band = t.studentCap != null ? `${t.studentCap} · ` : '';
  return used == null
    ? `${band}${fmtNum(t.questionsPerMonth)}/mo`
    : `${band}${fmtNum(used)}/${fmtNum(t.questionsPerMonth)}`;
}

/** ISO → the local wall-clock string a datetime-local input expects. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-scrim backdrop-blur-md" onClick={onClose} />
        <div className="relative z-10 w-full max-w-lg glass rounded-[2rem] p-8 shadow-2xl animate-fade-in">
          {children}
        </div>
      </div>
    </Portal>
  );
}

export default function Institutions() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Tenant | null>(null);
  const navigate = useNavigate();
  const startImpersonation = useImpersonationStore((st) => st.start);
  const [tab, setTab] = useState<'users' | 'documents'>('users');
  const [userSearch, setUserSearch] = useState('');

  // Create institution modal
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createError, setCreateError] = useState('');

  // Edit institution modal
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');

  // Create user modal
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('STUDENT');
  const [newUserError, setNewUserError] = useState('');

  // Trial & billing controls (detail panel)
  const [planDraft, setPlanDraft] = useState<Plan>('trial');
  const [trialDraft, setTrialDraft] = useState('');
  const [planError, setPlanError] = useState('');

  // Plan assignment + credits. bandDraft is the student count as a string; '' means no plan.
  const [bandDraft, setBandDraft] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [creditError, setCreditError] = useState('');

  // Upload document modal
  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data ─────────────────────────────────────────────────
  const { data: tenants, isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ['admin-tenants'],
    queryFn: async () => (await apiClient.get('/tenants')).data.data,
  });

  // The price list never changes between deploys, so it is fetched once and kept.
  const { data: plans } = useQuery<PlansCatalog>({
    queryKey: ['tenant-plans'],
    queryFn: async () => (await apiClient.get('/tenants/plans')).data.data,
    staleTime: Infinity,
  });

  const { data: usage, isLoading: usageLoading } = useQuery<Usage>({
    queryKey: ['tenant-usage', selected?.id],
    queryFn: async () => (await apiClient.get(`/tenants/${selected!.id}/usage`)).data.data,
    enabled: !!selected,
  });

  const { data: tenantUsers, isLoading: tuLoading } = useQuery<TenantUser[]>({
    queryKey: ['tenant-users', selected?.id],
    queryFn: async () => (await apiClient.get(`/tenants/${selected!.id}/users`)).data.data,
    enabled: !!selected,
  });

  const { data: allUsers } = useQuery<TenantUser[]>({
    queryKey: ['admin-users-list'],
    queryFn: async () => (await apiClient.get('/admin/users')).data.data,
    enabled: !!selected,
  });

  const { data: tenantDocs, isLoading: docsLoading } = useQuery<Doc[]>({
    queryKey: ['tenant-docs', selected?.id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/documents?tenantId=${selected!.id}&limit=50`);
      return data.data.items;
    },
    enabled: !!selected && tab === 'documents',
  });

  // Keep the trial controls in step with whichever institution is selected, and with the
  // values the server hands back after a change.
  useEffect(() => {
    setPlanDraft(selected?.plan === 'paid' ? 'paid' : 'trial');
    setTrialDraft(toLocalInput(selected?.trialEndsAt ?? null));
    setPlanError('');
  }, [selected?.id, selected?.plan, selected?.trialEndsAt]);

  // Same idea for the band selector — it must always open showing what they are on now,
  // not what was left in the box from the last institution looked at.
  useEffect(() => {
    setBandDraft(selected?.studentCap != null ? String(selected.studentCap) : '');
  }, [selected?.id, selected?.studentCap]);

  useEffect(() => {
    setCreditAmount(''); setCreditNote(''); setCreditError('');
  }, [selected?.id]);

  // ── Mutations ─────────────────────────────────────────────
  const editTenantMutation = useMutation({
    mutationFn: async () => (await apiClient.patch(`/tenants/${editing!.id}`, { name: editName })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      if (selected?.id === editing?.id) setSelected(s => s ? { ...s, name: editName } : s);
      setEditing(null); setEditName(''); setEditError('');
    },
    onError: (err: any) => setEditError((err.response?.data?.error?.message ?? err.response?.data?.error) || 'Failed to update institution'),
  });

  const createTenantMutation = useMutation({
    mutationFn: async () => (await apiClient.post('/tenants', { name: createName, slug: createSlug })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      setShowCreate(false); setCreateName(''); setCreateSlug(''); setCreateError('');
    },
    onError: (err: any) => setCreateError((err.response?.data?.error?.message ?? err.response?.data?.error) || 'Failed to create institution'),
  });

  const planMutation = useMutation({
    mutationFn: async (vars: {
      plan?: Plan;
      trialEndsAt?: string | null;
      studentBand?: number | null;
      questionsPerMonth?: number | null;
      allowAdvancedModel?: boolean;
    }) => {
      const { data } = await apiClient.patch(`/tenants/${selected!.id}/plan`, vars);
      return data.data as Pick<Tenant,
        'id' | 'name' | 'plan' | 'trialEndsAt' | 'studentCap' | 'questionsPerMonth' | 'allowAdvancedModel' | 'questionCredits'>;
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      qc.invalidateQueries({ queryKey: ['tenant-usage', updated.id] });
      // Mirror the server's own numbers back into the panel rather than the ones just
      // typed — a band derives the allowance and the model policy, so what was sent is
      // not what was stored.
      setSelected(s => s && s.id === updated.id ? {
        ...s,
        plan: updated.plan,
        trialEndsAt: updated.trialEndsAt,
        studentCap: updated.studentCap,
        questionsPerMonth: updated.questionsPerMonth,
        allowAdvancedModel: updated.allowAdvancedModel,
        questionCredits: updated.questionCredits,
      } : s);
      setPlanError('');
    },
    onError: (err: any) => setPlanError(err.response?.data?.error?.message || 'Failed to update plan'),
  });

  const creditsMutation = useMutation({
    mutationFn: async (vars: { questions: number; note?: string }) => {
      const { data } = await apiClient.post(`/tenants/${selected!.id}/credits`, vars);
      return data.data as Pick<Tenant, 'id' | 'name' | 'questionCredits'>;
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      qc.invalidateQueries({ queryKey: ['tenant-usage', updated.id] });
      setSelected(s => s && s.id === updated.id ? { ...s, questionCredits: updated.questionCredits } : s);
      setCreditAmount(''); setCreditNote(''); setCreditError('');
    },
    onError: (err: any) => setCreditError(err.response?.data?.error?.message || 'Failed to adjust credits'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiClient.patch(`/tenants/${id}`, { isActive });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenants'] }),
  });

  const assignMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.post(`/tenants/${selected!.id}/users/${userId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-users', selected?.id] });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      qc.invalidateQueries({ queryKey: ['admin-users-list'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/tenants/${selected!.id}/users/${userId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-users', selected?.id] });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      qc.invalidateQueries({ queryKey: ['admin-users-list'] });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/admin/users', {
        fullName: newUserName, email: newUserEmail,
        password: newUserPassword, role: newUserRole,
      });
      // Immediately assign to institution
      await apiClient.post(`/tenants/${selected!.id}/users/${data.data.id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-users', selected?.id] });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      qc.invalidateQueries({ queryKey: ['admin-users-list'] });
      setShowCreateUser(false);
      setNewUserName(''); setNewUserEmail(''); setNewUserPassword(''); setNewUserError('');
    },
    onError: (err: any) => setNewUserError((err.response?.data?.error?.message ?? err.response?.data?.error) || 'Failed to create user'),
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (docId: string) => { await apiClient.delete(`/documents/${docId}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-docs', selected?.id] }),
  });

  const uploadDocMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile || !selected) throw new Error('No file selected');
      const form = new FormData();
      form.append('file', uploadFile);
      form.append('title', uploadTitle || uploadFile.name.replace('.pdf', ''));
      form.append('tenantId', selected.id);
      await apiClient.post('/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-docs', selected?.id] });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      setShowUploadDoc(false);
      setUploadTitle(''); setUploadFile(null); setUploadError('');
    },
    onError: (err: any) => setUploadError((err.response?.data?.error?.message ?? err.response?.data?.error) || 'Failed to upload document'),
  });

  // ── Derived ───────────────────────────────────────────────
  const assignedIds = new Set((tenantUsers ?? []).map(u => u.id));
  const unassigned = (allUsers ?? []).filter(u =>
    !u.tenantId &&
    (u.fullName.toLowerCase().includes(userSearch.toLowerCase()) ||
     u.email.toLowerCase().includes(userSearch.toLowerCase()))
  );
  const assignedFiltered = (tenantUsers ?? []).filter(u =>
    u.fullName.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const autoSlug = (n: string) => n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // ── Plan assignment, derived ──────────────────────────────
  const currentBandKey = selected?.studentCap != null ? String(selected.studentCap) : '';
  const draftBand = (plans?.bands ?? []).find(b => String(b.students) === bandDraft) ?? null;
  const bandChanged = !!selected && bandDraft !== currentBandKey;

  const applyBand = () => {
    if (!selected) return;
    // Clearing the band must also clear the allowance: the API leaves questionsPerMonth
    // alone when studentBand is null, which would strand a limit with no plan behind it.
    planMutation.mutate(
      draftBand
        ? { studentBand: draftBand.students }
        : { studentBand: null, questionsPerMonth: null },
    );
  };

  const usagePct = usage && usage.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0;
  const usageTone = usagePct >= 100 ? 'bg-red-500' : usagePct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  const creditBalance = usage?.credits ?? selected?.questionCredits ?? 0;
  const creditDelta = Number(creditAmount);

  // Quick-sets force plan back to 'trial' — expiring a date on a 'paid' tenant would
  // change nothing, and the point of these buttons is to make the lockout actually fire.
  const quickSetTrial = (offsetMs: number) =>
    planMutation.mutate({ plan: 'trial', trialEndsAt: new Date(Date.now() + offsetMs).toISOString() });

  return (
    <div className="animate-fade-in max-w-7xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-ink tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>
            Institutions
          </h1>
          <p className="text-ink-mute mt-2 font-medium text-sm">
            Manage schools and institutions using the platform
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-400 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-2xl hover:shadow-emerald-500/30 transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> New Institution
        </button>
      </div>

      {/* Create institution modal */}
      {showCreate && (
        <Modal onClose={() => { setShowCreate(false); setCreateError(''); }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-ink uppercase tracking-widest">New Institution</h2>
            <button onClick={() => { setShowCreate(false); setCreateError(''); }} className="text-ink-faint hover:text-ink cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
          {createError && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{createError}
            </div>
          )}
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">Name</label>
              <input type="text" value={createName}
                onChange={(e) => { setCreateName(e.target.value); setCreateSlug(autoSlug(e.target.value)); }}
                placeholder="e.g. Royal College Colombo"
                className="w-full px-4 py-3 bg-raised border border-line rounded-2xl text-ink placeholder:text-ink-faint text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">Slug</label>
              <input type="text" value={createSlug} onChange={(e) => setCreateSlug(e.target.value)}
                placeholder="royal-college-colombo"
                className="w-full px-4 py-3 bg-raised border border-line rounded-2xl text-ink placeholder:text-ink-faint text-sm font-mono focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
              <p className="text-[10px] text-ink-faint px-1">Lowercase letters, numbers, hyphens only</p>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => { setShowCreate(false); setCreateError(''); }}
              className="flex-1 py-3 bg-raised hover:bg-overlay border border-line text-ink rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
              Cancel
            </button>
            <button disabled={!createName.trim() || !createSlug.trim() || createTenantMutation.isPending}
              onClick={() => createTenantMutation.mutate()}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
              {createTenantMutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit institution modal */}
      {editing && (
        <Modal onClose={() => { setEditing(null); setEditError(''); }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-ink uppercase tracking-widest">Edit Institution</h2>
            <button onClick={() => { setEditing(null); setEditError(''); }} className="text-ink-faint hover:text-ink cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
          {editError && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{editError}
            </div>
          )}
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">Name</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                placeholder="Institution name"
                className="w-full px-4 py-3 bg-raised border border-line rounded-2xl text-ink placeholder:text-ink-faint text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">Slug (read-only)</label>
              <input type="text" value={editing.slug} disabled
                className="w-full px-4 py-3 bg-raised border border-line-soft rounded-2xl text-ink-faint text-sm font-mono cursor-not-allowed"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => { setEditing(null); setEditError(''); }}
              className="flex-1 py-3 bg-raised hover:bg-overlay border border-line text-ink rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
              Cancel
            </button>
            <button disabled={!editName.trim() || editTenantMutation.isPending}
              onClick={() => editTenantMutation.mutate()}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
              {editTenantMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* Create user modal */}
      {showCreateUser && selected && (
        <Modal onClose={() => { setShowCreateUser(false); setNewUserError(''); }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-black text-ink uppercase tracking-widest">Add User</h2>
              <p className="text-[10px] text-ink-faint mt-0.5">Creates account and assigns to {selected.name}</p>
            </div>
            <button onClick={() => { setShowCreateUser(false); setNewUserError(''); }} className="text-ink-faint hover:text-ink cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
          {newUserError && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{newUserError}
            </div>
          )}
          <div className="space-y-3">
            {[
              { label: 'Full Name', value: newUserName, set: setNewUserName, type: 'text', placeholder: 'e.g. John Doe', icon: User },
              { label: 'Email', value: newUserEmail, set: setNewUserEmail, type: 'email', placeholder: 'user@school.lk', icon: Mail },
              { label: 'Password', value: newUserPassword, set: setNewUserPassword, type: 'password', placeholder: 'Min. 8 characters', icon: Lock },
            ].map(({ label, value, set, type, placeholder, icon: Icon }) => (
              <div key={label} className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">{label}</label>
                <div className="relative">
                  <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                  <input type={type} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                    className="w-full pl-11 pr-4 py-3 bg-raised border border-line rounded-2xl text-ink placeholder:text-ink-faint text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">Role</label>
              <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}
                className="w-full px-4 py-3 bg-raised border border-line rounded-2xl text-ink text-sm focus:outline-none focus:border-emerald-500/50 transition-colors cursor-pointer">
                <option value="STUDENT" className="bg-raised text-ink">Student / Staff</option>
                <option value="ADMIN" className="bg-raised text-ink">Admin (institution admin)</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => { setShowCreateUser(false); setNewUserError(''); }}
              className="flex-1 py-3 bg-raised hover:bg-overlay border border-line text-ink rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
              Cancel
            </button>
            <button
              disabled={!newUserName || !newUserEmail || !newUserPassword || createUserMutation.isPending}
              onClick={() => createUserMutation.mutate()}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2">
              {createUserMutation.isPending ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Creating...</> : <><Save className="w-3.5 h-3.5" /> Create & Assign</>}
            </button>
          </div>
        </Modal>
      )}

      {/* Upload document modal */}
      {showUploadDoc && selected && (
        <Modal onClose={() => { setShowUploadDoc(false); setUploadError(''); setUploadFile(null); setUploadTitle(''); }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-black text-ink uppercase tracking-widest">Upload Document</h2>
              <p className="text-[10px] text-ink-faint mt-0.5">Upload PDF to {selected.name}</p>
            </div>
            <button onClick={() => { setShowUploadDoc(false); setUploadError(''); setUploadFile(null); setUploadTitle(''); }} className="text-ink-faint hover:text-ink cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
          {uploadError && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{uploadError}
            </div>
          )}
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">Title (optional)</label>
              <input type="text" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Auto-detected from filename"
                className="w-full px-4 py-3 bg-raised border border-line rounded-2xl text-ink placeholder:text-ink-faint text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">PDF File</label>
              <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-3 py-8 border-2 border-dashed border-line hover:border-emerald-500/40 rounded-2xl text-ink-faint hover:text-ink-soft transition-all cursor-pointer">
                <Upload className="w-5 h-5" />
                <span className="text-sm font-medium">{uploadFile ? uploadFile.name : 'Click to select PDF'}</span>
              </button>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => { setShowUploadDoc(false); setUploadError(''); setUploadFile(null); setUploadTitle(''); }}
              className="flex-1 py-3 bg-raised hover:bg-overlay border border-line text-ink rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
              Cancel
            </button>
            <button disabled={!uploadFile || uploadDocMutation.isPending}
              onClick={() => uploadDocMutation.mutate()}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2">
              {uploadDocMutation.isPending ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Uploading...</> : <><Upload className="w-3.5 h-3.5" /> Upload</>}
            </button>
          </div>
        </Modal>
      )}

      {/* Two-column layout when institution is selected */}
      <div className={`grid gap-6 ${selected ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>

        {/* Institution list */}
        <div className="space-y-3">
          {tenantsLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !tenants?.length ? (
            <div className="glass rounded-[1.5rem] p-12 text-center">
              <Building2 className="w-12 h-12 text-ink-faint mx-auto mb-4" />
              <p className="text-ink-mute font-medium">No institutions yet. Create the first one above.</p>
            </div>
          ) : tenants.map((t) => (
            <div key={t.id}
              onClick={() => { setSelected(selected?.id === t.id ? null : t); setTab('users'); setUserSearch(''); }}
              className={`glass rounded-[1.5rem] p-6 cursor-pointer transition-all group ${selected?.id === t.id ? 'border border-emerald-500/40 shadow-lg shadow-emerald-500/10' : 'hover:border-line'}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-lg shadow-lg ${t.isActive ? 'bg-gradient-to-br from-emerald-500 to-emerald-800 text-white' : 'bg-raised text-ink-faint'}`}>
                  {t.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-ink">{t.name}</p>
                    {!t.isActive && <span className="text-[9px] font-black uppercase tracking-widest text-red-700 dark:text-red-400 bg-red-500/10 border border-red-500/25 px-2 py-0.5 rounded-full">Inactive</span>}
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${trialState(t).tone}`}>
                      {trialState(t).label}
                    </span>
                  </div>
                  <p className="text-xs text-ink-faint font-mono mt-0.5">{t.slug}</p>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-ink-faint uppercase tracking-widest">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {t._count.users}</span>
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {t._count.documents}</span>
                    <span className="flex items-center gap-1"><HelpCircle className="w-3 h-3" /> {t._count.questions}</span>
                    <span className={`flex items-center gap-1 ${t.questionsPerMonth == null ? 'text-ink-faint italic' : 'text-ink-mute'}`}>
                      <Gauge className="w-3 h-3" />
                      {listQuotaLabel(t, selected?.id === t.id ? usage?.used ?? t.usedThisMonth ?? null : t.usedThisMonth ?? null)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { setEditing(t); setEditName(t.name); }}
                    title="Edit institution"
                    className="p-2 text-ink-faint hover:text-ink transition-colors cursor-pointer">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleMutation.mutate({ id: t.id, isActive: !t.isActive })}
                    title={t.isActive ? 'Deactivate' : 'Activate'}
                    className="p-2 text-ink-faint hover:text-emerald-600 transition-colors cursor-pointer">
                    {t.isActive ? <ToggleRight className="w-5 h-5 text-emerald-700 dark:text-emerald-400" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                </div>
                <ChevronRight className={`w-4 h-4 text-ink-faint transition-transform ${selected?.id === t.id ? 'rotate-90' : ''}`} />
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="glass rounded-[1.5rem] p-6 space-y-4 animate-fade-in">
            {/* Panel header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-ink uppercase tracking-widest">{selected.name}</h2>
                <p className="text-[10px] text-ink-faint uppercase tracking-widest mt-0.5 font-mono">{selected.slug}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 text-ink-faint hover:text-ink transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            {/* View as this institution — support access, not a shortcut. Sends you into the
                school panel scoped to their data, with a banner that stays up until you exit. */}
            <button
              onClick={() => { startImpersonation(selected.id, selected.name); navigate('/school'); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-amber-950 text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              View as this institution
            </button>

            {/* ── Trial & billing ── */}
            <div className="space-y-3 p-4 bg-raised border border-line-soft rounded-2xl">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-ink-mute flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5" /> Trial &amp; Billing
                </p>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${trialState(selected).tone}`}>
                  {trialState(selected).label}
                </span>
              </div>

              {planError && (
                <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 dark:text-red-400 text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{planError}
                </div>
              )}

              {/* Plan toggle — applies immediately */}
              <div className="flex bg-surface rounded-xl p-1 gap-1">
                {(['trial', 'paid'] as const).map((p) => (
                  <button key={p}
                    disabled={planMutation.isPending}
                    onClick={() => { setPlanDraft(p); planMutation.mutate({ plan: p }); }}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${planDraft === p ? 'bg-overlay text-ink' : 'text-ink-faint hover:text-ink'}`}>
                    {p}
                  </button>
                ))}
              </div>

              {/* ── What they are on RIGHT NOW ──
                  First thing in the block, before any control that changes it. An operator
                  who cannot read the current band at a glance will assign the wrong one. */}
              <div className="grid grid-cols-3 gap-2">
                <Fact
                  label="Band"
                  value={selected.studentCap != null ? `${selected.studentCap} students` : 'None'}
                  tone={selected.studentCap != null ? 'text-ink' : 'text-ink-faint'}
                />
                <Fact
                  label="Included"
                  value={selected.questionsPerMonth == null ? 'Unmetered' : `${fmtNum(selected.questionsPerMonth)}/mo`}
                  tone={selected.questionsPerMonth == null ? 'text-ink-faint' : 'text-ink'}
                />
                <Fact
                  label="gpt-4o"
                  value={selected.allowAdvancedModel ? 'Included' : 'Excluded'}
                  tone={selected.allowAdvancedModel ? 'text-emerald-700 dark:text-emerald-400' : 'text-ink-faint'}
                />
              </div>

              {/* ── Band assignment ── */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Plan band
                </label>
                <div className="flex gap-2">
                  <select
                    value={bandDraft}
                    onChange={(e) => setBandDraft(e.target.value)}
                    disabled={planMutation.isPending}
                    className="flex-1 min-w-0 px-3 py-2 bg-surface border border-line rounded-xl text-ink text-xs focus:outline-none focus:border-emerald-500/50 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <option value="" className="bg-raised text-ink">No plan — unmetered</option>
                    {(plans?.bands ?? []).map((b) => (
                      <option key={b.students} value={String(b.students)} className="bg-raised text-ink">
                        {b.students} students — LKR {fmtNum(b.pricePerYear)}/yr
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!bandChanged || planMutation.isPending}
                    onClick={applyBand}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap">
                    {planMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Apply
                  </button>
                </div>

                {/* What the choice implies — before, and what it becomes after. */}
                <div className="px-1 pt-0.5 text-[10px] leading-relaxed">
                  {bandChanged ? (
                    <div className="flex items-center gap-2 flex-wrap text-ink-mute">
                      <span className="line-through decoration-ink-faint/60">
                        <PlanFacts questionsPerMonth={selected.questionsPerMonth} advanced={selected.allowAdvancedModel} />
                      </span>
                      <ArrowRight className="w-3 h-3 text-ink-faint flex-shrink-0" />
                      <PlanFacts
                        questionsPerMonth={draftBand ? draftBand.questionsPerMonth : null}
                        advanced={draftBand ? draftBand.allowAdvancedModel : false}
                      />
                    </div>
                  ) : (
                    <span className="text-ink-mute">
                      Currently{' '}
                      <PlanFacts questionsPerMonth={selected.questionsPerMonth} advanced={selected.allowAdvancedModel} />
                    </span>
                  )}
                  {draftBand && (
                    <p className="text-ink-faint mt-0.5">
                      LKR {fmtNum(draftBand.pricePerYear)}/yr · LKR {fmtNum(draftBand.pricePerStudent)} per student
                    </p>
                  )}
                  {!draftBand && bandChanged && (
                    <p className="text-amber-700 dark:text-amber-400 mt-0.5 font-bold">
                      Removes the allowance entirely — questions stop being metered.
                    </p>
                  )}
                </div>
              </div>

              {/* ── Usage against the allowance ── */}
              <div className="space-y-1.5 pt-3 border-t border-line-soft">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-ink-mute flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5" /> Usage
                  </p>
                  {usage && (
                    <span className="text-[9px] font-black uppercase tracking-widest text-ink-faint">
                      {monthLabel(usage.month)}
                    </span>
                  )}
                </div>

                {usageLoading ? (
                  <div className="flex justify-center py-2">
                    <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : !usage ? (
                  <p className="text-[11px] text-ink-faint italic px-1">Usage unavailable.</p>
                ) : usage.limit == null ? (
                  <p className="text-[11px] text-ink-faint px-1">Unmetered — no plan assigned.</p>
                ) : (
                  <>
                    <div className="h-2 rounded-full bg-surface border border-line-soft overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${usageTone}`} style={{ width: `${usagePct}%` }} />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-1">
                      <span className="text-[10px] font-bold text-ink">
                        {fmtNum(usage.used)} of {fmtNum(usage.limit)} this month
                      </span>
                      <span className="text-[10px] font-bold text-ink-faint">{usagePct.toFixed(0)}%</span>
                    </div>
                    {usage.exhausted && (
                      <p className="text-[10px] font-bold text-red-700 dark:text-red-400 px-1">
                        Allowance spent and no credits left — further questions are refused.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* ── Pay-as-you-go credits ── */}
              <div className="space-y-2 pt-3 border-t border-line-soft">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-ink-mute flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" /> Credits
                  </p>
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    creditBalance > 0
                      ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                      : 'text-ink-faint bg-raised border-line'
                  }`}>
                    {fmtNum(creditBalance)} left
                  </span>
                </div>

                {creditError && (
                  <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 dark:text-red-400 text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{creditError}
                  </div>
                )}

                <div className="flex gap-2">
                  {(plans?.creditPacks ?? []).map((p) => (
                    <button key={p.questions}
                      disabled={creditsMutation.isPending}
                      onClick={() => creditsMutation.mutate({ questions: p.questions, note: 'pack' })}
                      className="flex-1 min-w-0 py-2 px-2 bg-surface hover:bg-overlay border border-line rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                      <span className="block text-[11px] font-black text-ink leading-none">+{fmtNum(p.questions)}</span>
                      <span className="block text-[9px] text-ink-faint mt-1">LKR {fmtNum(p.priceLkr)}</span>
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)}
                    placeholder="Amount"
                    className="w-24 flex-shrink-0 px-3 py-2 bg-surface border border-line rounded-xl text-ink placeholder:text-ink-faint text-xs focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                  <input type="text" value={creditNote} onChange={(e) => setCreditNote(e.target.value)}
                    placeholder="Note (optional)"
                    className="flex-1 min-w-0 px-3 py-2 bg-surface border border-line rounded-xl text-ink placeholder:text-ink-faint text-xs focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                  <button
                    disabled={!Number.isFinite(creditDelta) || creditDelta === 0 || creditsMutation.isPending}
                    onClick={() => creditsMutation.mutate({ questions: Math.trunc(creditDelta), note: creditNote.trim() || undefined })}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap">
                    {creditsMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Add
                  </button>
                </div>
                <p className="text-[10px] text-ink-faint px-1">
                  Adds to the balance rather than replacing it. A negative amount reverses a top-up; the balance floors at zero.
                </p>
              </div>

              {/* Exact expiry */}
              <div className="space-y-1 pt-3 border-t border-line-soft">
                <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">Trial ends at</label>
                <div className="flex gap-2">
                  <input type="datetime-local" value={trialDraft}
                    onChange={(e) => setTrialDraft(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2 bg-surface border border-line rounded-xl text-ink text-xs focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                  <button
                    disabled={planMutation.isPending}
                    onClick={() => planMutation.mutate({
                      trialEndsAt: trialDraft ? new Date(trialDraft).toISOString() : null,
                    })}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap">
                    {planMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
                <p className="text-[10px] text-ink-faint px-1">Leave empty and save to clear the expiry (trial never lapses).</p>
              </div>

              {/* Quick-sets for testing the lockout */}
              <div className="space-y-1.5 pt-1 border-t border-line-soft">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 flex items-center gap-1.5 pt-2">
                  <FlaskConical className="w-3.5 h-3.5" /> Testing — force a trial state
                </p>
                <div className="flex gap-2">
                  {([
                    { label: 'Expire now', offset: -60_000 },
                    { label: '2 minutes', offset: 2 * 60_000 },
                    { label: '7 days', offset: 7 * 24 * 60 * 60_000 },
                  ] as const).map((q) => (
                    <button key={q.label}
                      disabled={planMutation.isPending}
                      onClick={() => quickSetTrial(q.offset)}
                      className="flex-1 py-2 bg-surface hover:bg-overlay border border-line text-ink rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                      {q.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-ink-faint px-1">
                  Sets the plan to trial and moves the end date. Use “2 minutes”, then sign in as one of this
                  institution's admins — the lock fires on its own when the clock runs out.
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-raised rounded-xl p-1 gap-1">
              {(['users', 'documents'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer ${tab === t ? 'bg-overlay text-ink' : 'text-ink-faint hover:text-ink'}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* ── USERS TAB ── */}
            {tab === 'users' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
                    <input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search users..."
                      className="w-full pl-9 pr-3 py-2 bg-raised border border-line rounded-xl text-ink placeholder:text-ink-faint text-xs focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                  </div>
                  <button onClick={() => setShowCreateUser(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap">
                    <UserPlus className="w-3.5 h-3.5" /> Add User
                  </button>
                </div>

                {/* Assigned users */}
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                  Assigned ({tenantUsers?.length ?? 0})
                </p>
                {tuLoading ? (
                  <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : assignedFiltered.length === 0 ? (
                  <p className="text-[11px] text-ink-faint italic px-1">{userSearch ? 'No assigned users match.' : 'No users assigned yet — create or assign one above.'}</p>
                ) : assignedFiltered.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl group">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-black text-sm flex-shrink-0">
                      {u.fullName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-ink truncate leading-none">{u.fullName}</p>
                      <p className="text-[10px] text-ink-faint truncate mt-0.5">{u.email}</p>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${u.isActive ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25' : 'text-red-700 dark:text-red-400 bg-red-500/10 border-red-500/25'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-ink-faint">{u.role}</span>
                    <button onClick={() => removeMutation.mutate(u.id)} disabled={removeMutation.isPending}
                      title="Remove from institution"
                      className="p-1.5 text-ink-faint hover:text-red-600 transition-colors cursor-pointer disabled:opacity-30 opacity-0 group-hover:opacity-100">
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {/* Unassigned users to pick from */}
                {unassigned.length > 0 && (
                  <>
                    <div className="border-t border-line-soft pt-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-ink-faint">Assign Existing User</p>
                    {unassigned.map((u) => (
                      <div key={u.id} className="flex items-center gap-3 p-3 bg-raised border border-line-soft rounded-2xl hover:border-line transition-all group">
                        <div className="w-8 h-8 rounded-xl bg-raised flex items-center justify-center text-ink-mute font-black text-sm flex-shrink-0">
                          {u.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-ink-soft truncate leading-none">{u.fullName}</p>
                          <p className="text-[10px] text-ink-faint truncate mt-0.5">{u.email}</p>
                        </div>
                        <button onClick={() => assignMutation.mutate(u.id)} disabled={assignMutation.isPending}
                          title="Assign to institution"
                          className="p-1.5 text-ink-faint hover:text-emerald-600 transition-colors cursor-pointer disabled:opacity-30 opacity-0 group-hover:opacity-100">
                          <UserPlus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ── DOCUMENTS TAB ── */}
            {tab === 'documents' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button onClick={() => setShowUploadDoc(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap">
                    <Upload className="w-3.5 h-3.5" /> Upload PDF
                  </button>
                </div>
                {docsLoading ? (
                  <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : !tenantDocs?.length ? (
                  <div className="text-center py-8">
                    <FileText className="w-10 h-10 text-ink-faint mx-auto mb-3" />
                    <p className="text-[11px] text-ink-faint italic">No documents yet — upload one above.</p>
                  </div>
                ) : tenantDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 bg-raised border border-line-soft rounded-2xl group hover:border-line transition-all">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-ink truncate leading-none">{doc.title}</p>
                      <p className="text-[10px] text-ink-faint mt-0.5 truncate">{doc.originalFilename}</p>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${STATUS_COLORS[doc.status] ?? 'text-ink-faint border-line bg-raised'}`}>
                      {doc.status}
                    </span>
                    <button onClick={() => deleteDocMutation.mutate(doc.id)} disabled={deleteDocMutation.isPending}
                      title="Delete document"
                      className="p-1.5 text-ink-faint hover:text-red-600 transition-colors cursor-pointer disabled:opacity-30 opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
