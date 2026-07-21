import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import Portal from '../../components/Portal';
import { useImpersonationStore } from '../../store/impersonationStore';
import {
  Building2, Plus, Users, FileText, HelpCircle, ChevronRight, X,
  AlertCircle, UserPlus, UserMinus, ToggleLeft, ToggleRight, Search,
  Lock, Mail, User, Save, Trash2, RefreshCw, Pencil, Upload, Eye,
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  _count: { users: number; documents: number; questions: number };
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

  // ── Mutations ─────────────────────────────────────────────
  const editTenantMutation = useMutation({
    mutationFn: async () => (await apiClient.patch(`/tenants/${editing!.id}`, { name: editName })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      if (selected?.id === editing?.id) setSelected(s => s ? { ...s, name: editName } : s);
      setEditing(null); setEditName(''); setEditError('');
    },
    onError: (err: any) => setEditError(err.response?.data?.error || 'Failed to update institution'),
  });

  const createTenantMutation = useMutation({
    mutationFn: async () => (await apiClient.post('/tenants', { name: createName, slug: createSlug })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      setShowCreate(false); setCreateName(''); setCreateSlug(''); setCreateError('');
    },
    onError: (err: any) => setCreateError(err.response?.data?.error || 'Failed to create institution'),
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
    onError: (err: any) => setNewUserError(err.response?.data?.error || 'Failed to create user'),
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
    onError: (err: any) => setUploadError(err.response?.data?.error || 'Failed to upload document'),
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
                  </div>
                  <p className="text-xs text-ink-faint font-mono mt-0.5">{t.slug}</p>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-ink-faint uppercase tracking-widest">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {t._count.users}</span>
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {t._count.documents}</span>
                    <span className="flex items-center gap-1"><HelpCircle className="w-3 h-3" /> {t._count.questions}</span>
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
