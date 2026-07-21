import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import Portal from '../../components/Portal';
import {
  Users, Mail, Calendar, Shield, ShieldAlert, Search, AlertCircle,
  UserPlus, UserMinus, X, User, Lock, Save, RefreshCw,
} from 'lucide-react';
import { useState } from 'react';

interface TenantUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  isPendingApproval?: boolean;
  createdAt: string;
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-scrim backdrop-blur-md" onClick={onClose} />
        <div className="relative z-10 w-full max-w-md glass rounded-[2rem] p-8 shadow-2xl animate-fade-in">
          {children}
        </div>
      </div>
    </Portal>
  );
}

export default function SchoolUsers() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('STUDENT');
  const [createError, setCreateError] = useState('');

  const { data: users, isLoading, error } = useQuery<TenantUser[]>({
    queryKey: ['school-users', user?.tenantId],
    queryFn: async () => (await apiClient.get(`/tenants/${user?.tenantId}/users`)).data.data,
    enabled: !!user?.tenantId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/admin/users', {
        fullName: newName, email: newEmail, password: newPassword, role: newRole,
      });
      await apiClient.post(`/tenants/${user!.tenantId}/users/${data.data.id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['school-users', user?.tenantId] });
      setShowCreate(false);
      setNewName(''); setNewEmail(''); setNewPassword(''); setCreateError('');
    },
    onError: (err: any) => setCreateError((err.response?.data?.error?.message ?? err.response?.data?.error) || 'Failed to create user'),
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/tenants/${user!.tenantId}/users/${userId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-users', user?.tenantId] }),
  });

  const filtered = users?.filter(u =>
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  ) ?? [];

  return (
    <div className="animate-fade-in max-w-5xl mx-auto space-y-8">

      {/* Create user modal */}
      {showCreate && (
        <Modal onClose={() => { setShowCreate(false); setCreateError(''); }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-black text-ink uppercase tracking-widest">Add User</h2>
              <p className="text-[10px] text-ink-faint mt-0.5">Creates account and assigns to your institution</p>
            </div>
            <button onClick={() => { setShowCreate(false); setCreateError(''); }} className="text-ink-faint hover:text-ink cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          {createError && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{createError}
            </div>
          )}

          <div className="space-y-3">
            {[
              { label: 'Full Name', value: newName, set: setNewName, type: 'text', placeholder: 'e.g. John Doe', icon: User },
              { label: 'Email', value: newEmail, set: setNewEmail, type: 'email', placeholder: 'user@school.lk', icon: Mail },
              { label: 'Password', value: newPassword, set: setNewPassword, type: 'password', placeholder: 'Min. 8 characters', icon: Lock },
            ].map(({ label, value, set, type, placeholder, icon: Icon }) => (
              <div key={label} className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">{label}</label>
                <div className="relative">
                  <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                  <input type={type} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                    className="w-full pl-11 pr-4 py-3 bg-raised border border-line rounded-2xl text-ink placeholder:text-ink-faint text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">Role</label>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
                className="w-full px-4 py-3 bg-raised border border-line rounded-2xl text-ink text-sm focus:outline-none focus:border-blue-500/50 transition-colors cursor-pointer">
                <option value="STUDENT" className="bg-raised text-ink">Student / Staff</option>
                <option value="ADMIN" className="bg-raised text-ink">Admin (institution admin)</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => { setShowCreate(false); setCreateError(''); }}
              className="flex-1 py-3 bg-raised hover:bg-overlay border border-line text-ink rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
              Cancel
            </button>
            <button disabled={!newName || !newEmail || !newPassword || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2">
              {createMutation.isPending
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Creating...</>
                : <><Save className="w-3.5 h-3.5" /> Create</>}
            </button>
          </div>
        </Modal>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-ink tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>
            Users
          </h1>
          <p className="text-ink-mute mt-2 text-sm font-medium">
            Members of your institution on this platform
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20 cursor-pointer whitespace-nowrap">
          <UserPlus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full pl-11 pr-4 py-3 bg-raised border border-line rounded-2xl text-ink placeholder:text-ink-faint text-sm font-medium focus:outline-none focus:border-blue-500/50 transition-colors"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="p-6 bg-red-500/10 border border-red-500/50 rounded-xl text-red-700 dark:text-red-400 flex items-center gap-3">
          <AlertCircle className="w-5 h-5" /><p>Failed to load users.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-[1.5rem] p-12 text-center">
          <Users className="w-12 h-12 text-ink-faint mx-auto mb-4" />
          <p className="text-ink-mute font-medium">
            {searchTerm ? 'No users match your search.' : 'No users yet — click "Add User" to create one.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((u) => (
            <div key={u.id} className="glass rounded-[1.5rem] p-5 flex items-center gap-4 group">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 text-blue-700 dark:text-blue-400 font-black text-sm">
                {u.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink truncate">{u.fullName}</p>
                <p className="text-xs text-ink-faint flex items-center gap-1.5 mt-0.5">
                  <Mail className="w-3 h-3" /> {u.email}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`hidden sm:flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                  u.role === 'ADMIN' ? 'text-purple-700 dark:text-purple-400 bg-purple-500/10 border-purple-500/25' : 'text-blue-700 dark:text-blue-400 bg-blue-500/10 border-blue-500/25'
                }`}>
                  {u.role === 'ADMIN' ? <Shield className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                  {u.role}
                </span>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                  u.isPendingApproval ? 'text-yellow-700 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/25'
                  : u.isActive ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                  : 'text-red-700 dark:text-red-400 bg-red-500/10 border-red-500/25'
                }`}>
                  {u.isPendingApproval ? 'Pending' : u.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-[10px] text-ink-faint hidden md:flex items-center gap-1 flex-shrink-0">
                <Calendar className="w-3 h-3" />
                {new Date(u.createdAt).toLocaleDateString()}
              </p>
              <button onClick={() => removeMutation.mutate(u.id)} disabled={removeMutation.isPending}
                title="Remove from institution"
                className="p-2 text-ink-faint hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer disabled:opacity-30 flex-shrink-0">
                <UserMinus className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
