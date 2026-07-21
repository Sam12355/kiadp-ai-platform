import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { Building2, Save, RefreshCw, AlertCircle, CheckCircle2, User, Mail, Lock, Upload, ImageIcon } from 'lucide-react';

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function SchoolProfile() {
  const { user, setUser } = useAuthStore();
  const qc = useQueryClient();

  // Institution fields
  const [instName, setInstName] = useState('');
  const [instSaved, setInstSaved] = useState(false);
  const [instError, setInstError] = useState('');

  // Logo upload
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [logoSaved, setLogoSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Personal profile fields
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);

  const { data: tenant, isLoading } = useQuery<TenantDetail>({
    queryKey: ['school-tenant-detail', user?.tenantId],
    queryFn: async () => {
      const result: TenantDetail = (await apiClient.get(`/tenants/${user?.tenantId}`)).data.data;
      if (!instName) setInstName(result.name);
      return result;
    },
    enabled: !!user?.tenantId,
  });

  const updateInstMutation = useMutation({
    mutationFn: async () => { await apiClient.patch(`/tenants/${user?.tenantId}`, { name: instName }); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['school-tenant-detail', user?.tenantId] });
      qc.invalidateQueries({ queryKey: ['school-tenant', user?.tenantId] });
      setInstSaved(true);
      setInstError('');
      setTimeout(() => setInstSaved(false), 3000);
    },
    onError: (err: any) => setInstError(err.response?.data?.error || 'Failed to update institution'),
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async () => {
      if (!logoFile) throw new Error('No image selected');
      const form = new FormData();
      form.append('logo', logoFile);
      setLogoUploading(true);
      await apiClient.post(`/tenants/${user?.tenantId}/logo`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['school-tenant-detail', user?.tenantId] });
      qc.invalidateQueries({ queryKey: ['school-tenant', user?.tenantId] });
      setLogoFile(null); setLogoPreview(null);
      setLogoSaved(true); setLogoError('');
      setLogoUploading(false);
      setTimeout(() => setLogoSaved(false), 3000);
    },
    onError: (err: any) => {
      setLogoError(err.response?.data?.error || 'Failed to upload logo');
      setLogoUploading(false);
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (newPassword && newPassword !== confirmPassword) {
        throw new Error('Passwords do not match');
      }
      const payload: any = { fullName };
      if (newPassword) payload.password = newPassword;
      const { data } = await apiClient.patch('/auth/profile', payload);
      return data.data;
    },
    onSuccess: (updated: any) => {
      if (updated) setUser({ ...user!, fullName: updated.fullName ?? fullName });
      setNewPassword('');
      setConfirmPassword('');
      setProfileSaved(true);
      setProfileError('');
      setTimeout(() => setProfileSaved(false), 3000);
    },
    onError: (err: any) => {
      setProfileError(err.message || err.response?.data?.error || 'Failed to update profile');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-black text-ink tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>
          Profile & Settings
        </h1>
        <p className="text-ink-mute mt-2 text-sm font-medium">
          Manage your institution details and personal account
        </p>
      </div>

      {/* Institution profile */}
      <div className="glass rounded-[1.5rem] p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h2 className="text-sm font-black text-ink uppercase tracking-widest">Institution Profile</h2>
            <p className="text-[10px] text-ink-faint mt-0.5">Update your institution's display name</p>
          </div>
        </div>

        {/* Logo upload */}
        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">Institution Logo</label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border border-line bg-raised flex items-center justify-center flex-shrink-0">
              {logoPreview ? (
                <img src={logoPreview} alt="Preview" className="w-full h-full object-cover" />
              ) : tenant?.logoUrl ? (
                <img src={tenant.logoUrl} alt={tenant.name} className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="w-8 h-8 text-ink-faint" />
              )}
            </div>
            <div className="space-y-2">
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)); }
                }}
              />
              <button onClick={() => logoInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-raised hover:bg-overlay border border-line text-ink-soft hover:text-ink rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
                <Upload className="w-3 h-3" /> Choose Image
              </button>
              {logoFile && (
                <button
                  disabled={logoUploading || uploadLogoMutation.isPending}
                  onClick={() => uploadLogoMutation.mutate()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
                  {logoUploading || uploadLogoMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  {logoUploading || uploadLogoMutation.isPending ? 'Uploading...' : 'Save Logo'}
                </button>
              )}
            </div>
          </div>
          {logoError && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{logoError}
            </div>
          )}
          {logoSaved && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-700 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />Logo updated successfully.
            </div>
          )}
        </div>

        <div className="border-t border-line-soft" />

        {instError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{instError}
          </div>
        )}
        {instSaved && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-700 text-sm">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />Institution updated successfully.
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">Institution Name</label>
            <input type="text" value={instName} onChange={(e) => setInstName(e.target.value)}
              placeholder={tenant?.name}
              className="w-full px-4 py-3 bg-raised border border-line rounded-2xl text-ink placeholder:text-ink-faint text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">Slug (read-only)</label>
            <input type="text" value={tenant?.slug ?? ''} disabled
              className="w-full px-4 py-3 bg-raised border border-line-soft rounded-2xl text-ink-faint text-sm font-mono cursor-not-allowed"
            />
          </div>
        </div>

        <button
          disabled={!instName.trim() || instName === tenant?.name || updateInstMutation.isPending}
          onClick={() => updateInstMutation.mutate()}
          className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
        >
          {updateInstMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {updateInstMutation.isPending ? 'Saving...' : 'Save Institution'}
        </button>
      </div>

      {/* Personal profile */}
      <div className="glass rounded-[1.5rem] p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <User className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h2 className="text-sm font-black text-ink uppercase tracking-widest">My Account</h2>
            <p className="text-[10px] text-ink-faint mt-0.5">Update your name and password</p>
          </div>
        </div>

        {profileError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{profileError}
          </div>
        )}
        {profileSaved && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-700 text-sm">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />Profile updated successfully.
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">Full Name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-raised border border-line rounded-2xl text-ink text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-ink-mute">Email (read-only)</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
              <input type="email" value={user?.email ?? ''} disabled
                className="w-full pl-11 pr-4 py-3 bg-raised border border-line-soft rounded-2xl text-ink-faint text-sm cursor-not-allowed"
              />
            </div>
          </div>
          <div className="border-t border-line-soft pt-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-ink-faint">Change Password (optional)</p>
            {[
              { label: 'New Password', value: newPassword, set: setNewPassword, placeholder: 'Leave blank to keep current' },
              { label: 'Confirm Password', value: confirmPassword, set: setConfirmPassword, placeholder: 'Repeat new password' },
            ].map(({ label, value, set, placeholder }) => (
              <div key={label} className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-ink-faint">{label}</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                  <input type="password" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                    className="w-full pl-11 pr-4 py-3 bg-raised border border-line rounded-2xl text-ink placeholder:text-ink-faint text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          disabled={updateProfileMutation.isPending}
          onClick={() => updateProfileMutation.mutate()}
          className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
        >
          {updateProfileMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {updateProfileMutation.isPending ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}
