import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { avatarUrl } from '../../api/urls';
import { Users, Shield, ShieldAlert, UserCheck, UserMinus, Search, Mail, Calendar, UserPlus, Clock } from 'lucide-react';
import { useState } from 'react';
import ConfirmModal from './components/ConfirmModal';
import CreateUserModal from './components/CreateUserModal';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  avatarUrl?: string;
  isActive: boolean;
  isPendingApproval?: boolean;
  createdAt: string;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { lang } = useLanguageStore();
  const t = translations[lang];
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmingUser, setConfirmingUser] = useState<User | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/users');
      return data.data;
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.patch(`/admin/users/${userId}/toggle-status`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.post(`/admin/users/${userId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const pendingUsers = users?.filter(u => u.isPendingApproval);
  const filteredUsers = users?.filter(user =>
    !user.isPendingApproval && (
      user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  return (
    <div className="animate-fade-in max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>{t.identityManagement}</h1>
          <p className="text-[var(--color-secondary)] mt-2 font-medium">{t.manageSecurity}</p>
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-72 group">
            <Search className="absolute ltr:left-4 rtl:right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-emerald-400 transition-colors" />
            <input
              type="text"
              placeholder={t.filterNames}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 ltr:pl-12 rtl:pr-12 ltr:pr-4 rtl:pl-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/40 transition-all font-medium"
            />
          </div>
          
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-400 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-2xl hover:shadow-emerald-500/30 transition-all active:scale-95 group"
          >
            <UserPlus className="w-4 h-4 group-hover:scale-110 transition-transform" />
            {t.addUser}
          </button>
        </div>
      </div>

      {/* Pending Approvals */}
      {pendingUsers && pendingUsers.length > 0 && (
        <div className="glass rounded-[2rem] overflow-hidden border border-amber-500/20 shadow-2xl">
          <div className="px-8 py-5 bg-amber-500/5 border-b border-amber-500/10 flex items-center gap-3">
            <Clock className="w-4 h-4 text-amber-400" />
            <h2 className="text-[11px] font-black uppercase tracking-widest text-amber-400">
              {t.pendingApprovals}
            </h2>
            <span className="ml-auto px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black">
              {pendingUsers.length}
            </span>
          </div>
          <div className="divide-y divide-white/5">
            {pendingUsers.map((user) => (
              <div key={user.id} className="px-8 py-5 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-white font-black border border-white/10 shadow-lg">
                  {user.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white leading-none">{user.fullName}</p>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/40 mt-1 uppercase tracking-tight">
                    <Mail className="w-3 h-3" />
                    {user.email}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/30 uppercase tracking-widest me-4">
                  <Calendar className="w-3 h-3" />
                  {new Date(user.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                </div>
                <button
                  onClick={() => approveMutation.mutate(user.id)}
                  disabled={approveMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border text-emerald-400 border-emerald-400/20 hover:bg-emerald-400/10 disabled:opacity-50"
                >
                  <UserCheck className="w-4 h-4" />
                  {t.approve}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left rtl:text-right text-sm">
            <thead className="uppercase text-[var(--color-secondary)] bg-white/5 border-b border-white/5">
              <tr className="text-[10px] font-black tracking-widest">
                <th className="px-8 py-5 ">{t.user}</th>
                <th className="px-8 py-5 ">{t.role}</th>
                <th className="px-8 py-5 ">{t.created}</th>
                <th className="px-8 py-5 ">{t.status}</th>
                <th className="px-8 py-5 text-right rtl:text-left">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center">
                    <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredUsers?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-[var(--color-secondary)] italic font-black uppercase tracking-widest text-[10px]">
                    {t.noUsersFound}
                  </td>
                </tr>
              ) : filteredUsers?.map((user) => (
                <tr key={user.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-800 flex items-center justify-center text-white text-lg font-black border border-white/10 shadow-2xl overflow-hidden group-hover:scale-105 transition-transform">
                        {user.avatarUrl ? (
                          <img src={avatarUrl(user.avatarUrl)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          user.fullName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-white leading-none">{user.fullName}</p>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--color-secondary)] mt-1.5 uppercase tracking-tight">
                          <Mail className="w-3 h-3" />
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      {user.role === 'ADMIN' ? (
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-500/10 text-purple-400 text-[10px] font-black border border-purple-500/20 tracking-widest uppercase">
                          <Shield className="w-3 h-3" />
                          {t.platformAdministrator}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-black border border-blue-500/20 tracking-widest uppercase">
                          <Users className="w-3 h-3" />
                          {t.standardUser}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--color-secondary)] uppercase tracking-widest">
                      <Calendar className="w-3 h-3" />
                      {new Date(user.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    {user.isActive ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-black border border-emerald-400/20 uppercase tracking-widest">
                        <UserCheck className="w-3.5 h-3.5" /> {t.active}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-black border border-red-500/20 uppercase tracking-widest">
                        <ShieldAlert className="w-3.5 h-3.5" /> {t.inactive}
                      </span>
                    )}
                  </td>
                  <td className="px-8 py-6 text-right rtl:text-left">
                    <button
                      onClick={() => setConfirmingUser(user)}
                      disabled={toggleStatusMutation.isPending}
                      className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                        user.isActive 
                          ? 'text-red-400 border-red-400/10 hover:bg-red-400/10' 
                          : 'text-emerald-400 border-emerald-400/10 hover:bg-emerald-400/10'
                      } disabled:opacity-50`}
                    >
                      {user.isActive ? (
                        <>
                          <UserMinus className="w-4 h-4" />
                          {t.deactivate}
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-4 h-4" />
                          {t.activate}
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirmingUser && (
        <ConfirmModal
          title={confirmingUser.isActive ? t.deactivate : t.activate}
          message={`${confirmingUser.isActive ? t.confirmDeactivate : t.confirmActivate} ${confirmingUser.fullName}?`}
          confirmText={confirmingUser.isActive ? t.deactivate : t.activate}
          onClose={() => setConfirmingUser(null)}
          onConfirm={() => {
            toggleStatusMutation.mutate(confirmingUser.id);
            setConfirmingUser(null);
          }}
          loading={toggleStatusMutation.isPending}
        />
      )}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}
