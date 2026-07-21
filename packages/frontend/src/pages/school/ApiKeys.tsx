import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { Key, Trash2, RefreshCw, AlertCircle, Copy, CheckCircle2, Clock } from 'lucide-react';
import { useState } from 'react';

interface ApiKey {
  id: string;
  keyPrefix: string;
  name: string;
  tenantId: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  requestCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export default function SchoolApiKeys() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys, isLoading, error } = useQuery<ApiKey[]>({
    queryKey: ['school-api-keys'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/api-keys');
      // Filter to only keys belonging to this institution
      return (data.data as ApiKey[]).filter(k => k.tenantId === user?.tenantId);
    },
    enabled: !!user?.tenantId,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await apiClient.post('/admin/api-keys', {
        name,
        tenantId: user?.tenantId,
      });
      return data.data;
    },
    onSuccess: (data) => {
      setCreatedKey(data.rawKey);
      setNewKeyName('');
      qc.invalidateQueries({ queryKey: ['school-api-keys'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/api-keys/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-api-keys'] }),
  });

  const rotateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post(`/admin/api-keys/${id}/rotate`);
      return data.data;
    },
    onSuccess: (data) => {
      setCreatedKey(data.rawKey);
      qc.invalidateQueries({ queryKey: ['school-api-keys'] });
    },
  });

  const copyKey = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="animate-fade-in max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-black text-white tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>
          API Keys
        </h1>
        <p className="text-white/40 mt-2 text-sm font-medium">
          Keys for integrating this platform into your school systems (Moodle, websites, apps)
        </p>
      </div>

      {/* New key created banner */}
      {createdKey && (
        <div className="glass rounded-[1.5rem] p-6 border border-emerald-500/30 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-black uppercase tracking-widest">API Key Created — Save It Now</span>
          </div>
          <p className="text-xs text-white/40">This key will not be shown again. Copy it immediately.</p>
          <div className="flex items-center gap-3 bg-black/30 border border-white/10 rounded-xl px-4 py-3">
            <code className="flex-1 text-sm text-emerald-300 font-mono break-all">{createdKey}</code>
            <button
              onClick={copyKey}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[10px] font-black uppercase tracking-widest text-white transition-all cursor-pointer flex-shrink-0"
            >
              {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button onClick={() => setCreatedKey(null)} className="text-[10px] text-white/30 hover:text-white/60 uppercase tracking-widest font-black transition-colors cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Create new key form */}
      <div className="glass rounded-[1.5rem] p-6 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Create New Key</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g. Moodle Integration"
            className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/20 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
          />
          <button
            disabled={!newKeyName.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate(newKeyName.trim())}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all cursor-pointer"
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>

      {/* Key list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="p-6 bg-red-500/10 border border-red-500/50 rounded-xl text-red-200 flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <p>Failed to load API keys.</p>
        </div>
      ) : !keys?.length ? (
        <div className="glass rounded-[1.5rem] p-12 text-center">
          <Key className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/40 font-medium">No API keys yet. Create one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <div key={k.id} className="glass rounded-[1.5rem] p-5 flex items-center gap-4 group">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Key className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{k.name}</p>
                <p className="text-xs text-white/30 font-mono mt-0.5">{k.keyPrefix}••••••••••••</p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-white/20 uppercase tracking-widest">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {k.requestCount.toLocaleString()} calls</span>
                  {k.lastUsedAt && <span>Last used {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
                  {k.expiresAt && <span>Expires {new Date(k.expiresAt).toLocaleDateString()}</span>}
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                k.isActive ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'
              }`}>
                {k.isActive ? 'Active' : 'Revoked'}
              </span>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => rotateMutation.mutate(k.id)}
                  title="Rotate key"
                  className="p-2 text-white/20 hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteMutation.mutate(k.id)}
                  title="Revoke key"
                  className="p-2 text-white/20 hover:text-red-400 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
