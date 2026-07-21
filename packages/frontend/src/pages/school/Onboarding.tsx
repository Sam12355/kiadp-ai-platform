import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import Portal from '../../components/Portal';
import {
  ImageIcon, Upload, Users, FileText, CheckCircle2,
  ArrowRight, X, RefreshCw, Lock, Mail, User as UserIcon, Save,
} from 'lucide-react';

interface Props {
  tenantId: string;
  tenantName: string;
  onDismiss: () => void;
}

type Step = 'logo' | 'user' | 'document' | 'done';

const STEPS: Step[] = ['logo', 'user', 'document', 'done'];

export default function OnboardingWizard({ tenantId, tenantName, onDismiss }: Props) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('logo');
  const [skipped, setSkipped] = useState<Set<Step>>(new Set());

  // Logo step
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState('');
  const logoRef = useRef<HTMLInputElement>(null);

  // User step
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('STUDENT');
  const [userError, setUserError] = useState('');

  // Document step
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [docError, setDocError] = useState('');
  const docRef = useRef<HTMLInputElement>(null);

  const stepIdx = STEPS.indexOf(step);

  const advance = () => setStep(STEPS[Math.min(stepIdx + 1, STEPS.length - 1)]);
  const skip = () => { setSkipped(s => new Set(s).add(step)); advance(); };

  const logoMutation = useMutation({
    mutationFn: async () => {
      if (!logoFile) throw new Error('No file');
      const form = new FormData();
      form.append('logo', logoFile);
      await apiClient.post(`/tenants/${tenantId}/logo`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['school-tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['school-tenant-detail', tenantId] });
      setLogoError('');
      advance();
    },
    onError: (e: any) => setLogoError(e.response?.data?.error || 'Failed to upload logo'),
  });

  const userMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/admin/users', {
        fullName: userName, email: userEmail, password: userPassword, role: userRole,
      });
      await apiClient.post(`/tenants/${tenantId}/users/${data.data.id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['school-tenant', tenantId] });
      setUserError('');
      advance();
    },
    onError: (e: any) => setUserError(e.response?.data?.error || 'Failed to create user'),
  });

  const docMutation = useMutation({
    mutationFn: async () => {
      if (!docFile) throw new Error('No file');
      const form = new FormData();
      form.append('file', docFile);
      form.append('title', docTitle || docFile.name.replace('.pdf', ''));
      form.append('tenantId', tenantId);
      await apiClient.post('/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['school-tenant', tenantId] });
      qc.invalidateQueries({ queryKey: ['school-analytics', tenantId] });
      setDocError('');
      advance();
    },
    onError: (e: any) => setDocError(e.response?.data?.error || 'Failed to upload document'),
  });

  const steps = [
    { id: 'logo', label: 'Logo', icon: ImageIcon },
    { id: 'user', label: 'First User', icon: Users },
    { id: 'document', label: 'First Doc', icon: FileText },
  ];

  return (
    <Portal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-scrim backdrop-blur-md" />
        <div className="relative z-10 w-full max-w-lg glass rounded-[2rem] p-8 shadow-2xl animate-fade-in">

          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-black text-ink uppercase tracking-widest">Welcome to EduAI</h2>
              <p className="text-[11px] text-ink-mute mt-1">Let's set up <span className="text-ink-soft font-bold">{tenantName}</span> in a few steps</p>
            </div>
            <button onClick={onDismiss} className="text-ink-faint hover:text-ink transition-colors cursor-pointer p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-8">
            {steps.map((s, i) => {
              const done = STEPS.indexOf(step) > i || step === 'done';
              const active = s.id === step;
              const Icon = s.icon;
              return (
                <div key={s.id} className="flex items-center gap-2 flex-1">
                  <div className={`flex items-center gap-2 flex-1 ${i < steps.length - 1 ? '' : ''}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                      done ? 'bg-emerald-500/20 border border-emerald-500/40' :
                      active ? 'bg-blue-500/20 border border-blue-500/40' :
                      'bg-raised border border-line'
                    }`}>
                      {done ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <Icon className={`w-4 h-4 ${active ? 'text-blue-700' : 'text-ink-faint'}`} />}
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-ink' : done ? 'text-emerald-700' : 'text-ink-faint'}`}>{s.label}</span>
                  </div>
                  {i < steps.length - 1 && <div className={`h-px flex-1 mx-2 ${done ? 'bg-emerald-500/30' : 'bg-overlay'}`} />}
                </div>
              );
            })}
          </div>

          {/* Step: Logo */}
          {step === 'logo' && (
            <div className="space-y-5">
              <p className="text-sm text-ink-soft">Upload your institution's logo. It will appear in the sidebar and top bar.</p>
              <div className="flex items-center gap-5">
                <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-line-strong flex items-center justify-center overflow-hidden bg-raised flex-shrink-0">
                  {logoPreview ? <img src={logoPreview} className="w-full h-full object-cover" alt="preview" /> : <ImageIcon className="w-8 h-8 text-ink-faint" />}
                </div>
                <div className="space-y-2">
                  <input ref={logoRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)); } }} />
                  <button onClick={() => logoRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 bg-raised hover:bg-overlay border border-line text-ink-soft hover:text-ink rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
                    <Upload className="w-3.5 h-3.5" /> Choose Image
                  </button>
                  <p className="text-[10px] text-ink-faint">PNG, JPG, SVG · max 5MB</p>
                </div>
              </div>
              {logoError && <p className="text-red-700 text-sm">{logoError}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={skip} className="flex-1 py-3 bg-raised hover:bg-overlay border border-line text-ink-mute rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">Skip for now</button>
                <button disabled={!logoFile || logoMutation.isPending} onClick={() => logoMutation.mutate()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
                  {logoMutation.isPending ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Uploading...</> : <>Upload <ArrowRight className="w-3.5 h-3.5" /></>}
                </button>
              </div>
            </div>
          )}

          {/* Step: First user */}
          {step === 'user' && (
            <div className="space-y-4">
              <p className="text-sm text-ink-soft">Add the first user (student or staff) to your institution.</p>
              <div className="space-y-3">
                {[
                  { label: 'Full Name', value: userName, set: setUserName, type: 'text', placeholder: 'e.g. John Doe', Icon: UserIcon },
                  { label: 'Email', value: userEmail, set: setUserEmail, type: 'email', placeholder: 'user@school.lk', Icon: Mail },
                  { label: 'Password', value: userPassword, set: setUserPassword, type: 'password', placeholder: 'Min. 8 characters', Icon: Lock },
                ].map(({ label, value, set, type, placeholder, Icon }) => (
                  <div key={label} className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-ink-faint">{label}</label>
                    <div className="relative">
                      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                      <input type={type} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                        className="w-full pl-11 pr-4 py-3 bg-raised border border-line rounded-2xl text-ink placeholder:text-ink-faint text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                      />
                    </div>
                  </div>
                ))}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-ink-faint">Role</label>
                  <select value={userRole} onChange={(e) => setUserRole(e.target.value)}
                    className="w-full px-4 py-3 bg-raised border border-line rounded-2xl text-ink text-sm focus:outline-none focus:border-blue-500/50 transition-colors cursor-pointer">
                    <option value="STUDENT" className="bg-raised text-ink">Student / Staff</option>
                    <option value="ADMIN" className="bg-raised text-ink">Admin (institution admin)</option>
                  </select>
                </div>
              </div>
              {userError && <p className="text-red-700 text-sm">{userError}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={skip} className="flex-1 py-3 bg-raised hover:bg-overlay border border-line text-ink-mute rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">Skip for now</button>
                <button disabled={!userName || !userEmail || !userPassword || userMutation.isPending} onClick={() => userMutation.mutate()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
                  {userMutation.isPending ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Creating...</> : <>Create & Continue <ArrowRight className="w-3.5 h-3.5" /></>}
                </button>
              </div>
            </div>
          )}

          {/* Step: First document */}
          {step === 'document' && (
            <div className="space-y-4">
              <p className="text-sm text-ink-soft">Upload your first knowledge document. Students will be able to ask questions about it.</p>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-ink-faint">Title (optional)</label>
                <input type="text" value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Auto-detected from filename"
                  className="w-full px-4 py-3 bg-raised border border-line rounded-2xl text-ink placeholder:text-ink-faint text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
              <div>
                <input ref={docRef} type="file" accept=".pdf" className="hidden" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
                <button onClick={() => docRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-line hover:border-blue-500/40 rounded-2xl text-ink-faint hover:text-ink-soft transition-all cursor-pointer">
                  <Upload className="w-6 h-6" />
                  <span className="text-sm font-medium">{docFile ? docFile.name : 'Click to select a PDF'}</span>
                </button>
              </div>
              {docError && <p className="text-red-700 text-sm">{docError}</p>}
              <div className="flex gap-3">
                <button onClick={skip} className="flex-1 py-3 bg-raised hover:bg-overlay border border-line text-ink-mute rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">Skip for now</button>
                <button disabled={!docFile || docMutation.isPending} onClick={() => docMutation.mutate()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
                  {docMutation.isPending ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Uploading...</> : <>Upload <ArrowRight className="w-3.5 h-3.5" /></>}
                </button>
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-700" />
              </div>
              <div>
                <h3 className="text-xl font-black text-ink uppercase tracking-widest">You're all set!</h3>
                <p className="text-ink-mute mt-2 text-sm">
                  {skipped.size === 0
                    ? 'Your institution is configured and ready to go.'
                    : `You skipped ${skipped.size} step${skipped.size > 1 ? 's' : ''} — you can complete them anytime from Profile & Settings.`}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={() => { onDismiss(); navigate('/school/documents'); }}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
                  <FileText className="w-3.5 h-3.5" /> Go to Documents
                </button>
                <button onClick={onDismiss}
                  className="w-full py-3 bg-raised hover:bg-overlay border border-line text-ink-mute rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer">
                  Go to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
