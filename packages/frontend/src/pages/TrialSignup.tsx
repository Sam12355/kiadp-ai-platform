import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import apiClient from '../api/client';
import { useAuthStore } from '../store/authStore';
import type { LoginResponse } from '@khalifa/shared';

type Field = 'institutionName' | 'fullName' | 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

const FIELDS: { name: Field; label: string; type: string; placeholder: string; autoComplete: string }[] = [
  { name: 'institutionName', label: 'Institution name', type: 'text', placeholder: 'Colombo International College', autoComplete: 'organization' },
  { name: 'fullName', label: 'Your name', type: 'text', placeholder: 'Nimal Perera', autoComplete: 'name' },
  { name: 'email', label: 'Work email', type: 'email', placeholder: 'you@yourschool.lk', autoComplete: 'email' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The server reports failures as `error: { code, message, details }`, but a few older
 * handlers return `error` as a bare string and hoist `details` to the top level. Reading
 * both shapes here keeps the form honest whichever one answers.
 */
function readApiError(err: unknown): { message: string; details: FieldErrors; status?: number } {
  if (!isAxiosError(err)) {
    return { message: 'Something went wrong. Please try again.', details: {} };
  }

  const body = err.response?.data as
    | { error?: string | { message?: string; details?: unknown }; details?: unknown }
    | undefined;

  const rawError = body?.error;
  const message =
    (typeof rawError === 'string' ? rawError : rawError?.message) ||
    'Could not start your trial. Please try again.';

  const rawDetails =
    (typeof rawError === 'object' && rawError !== null ? rawError.details : undefined) ?? body?.details;

  // Zod's fieldErrors gives an array per field; only the first is worth showing inline.
  const details: FieldErrors = {};
  if (rawDetails && typeof rawDetails === 'object') {
    for (const [key, value] of Object.entries(rawDetails as Record<string, unknown>)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first === 'string') details[key as Field] = first;
    }
  }

  return { message, details, status: err.response?.status };
}

export default function TrialSignup() {
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<Field, string>>({
    institutionName: '',
    fullName: '',
    email: '',
    password: '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [emailTaken, setEmailTaken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const setField = (name: Field, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    setFieldErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  };

  // Mirrors trialSignupSchema on the server so the common mistakes never cost a round trip.
  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (values.institutionName.trim().length < 2) errors.institutionName = 'Institution name is required';
    if (values.fullName.trim().length < 2) errors.fullName = 'Your name is required';
    if (!EMAIL_RE.test(values.email.trim())) errors.email = 'A valid email is required';
    if (values.password.length < 8) errors.password = 'Use at least 8 characters';
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setEmailTaken(false);

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      const response = await apiClient.post<{ success: boolean; data: LoginResponse }>('/auth/trial-signup', {
        institutionName: values.institutionName.trim(),
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        password: values.password,
      });

      const { user, tokens } = response.data.data;
      useAuthStore.getState().setAuth(user, tokens);
      navigate('/school', { replace: true });
    } catch (err) {
      const { message, details, status } = readApiError(err);
      setFieldErrors(details);
      if (status === 409) {
        setEmailTaken(true);
        setFormError(message);
      } else {
        setFormError(message);
      }
      setLoading(false);
    }
  };

  const inputClass = (name: Field) =>
    `w-full px-4 py-3 bg-raised border rounded-xl text-ink text-sm placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-1 ${
      fieldErrors[name]
        ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500'
        : 'border-line focus:border-[var(--color-palm-500)] focus:ring-[var(--color-palm-500)]'
    }`;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 text-ink">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-6">
          <Link to="/" className="inline-flex items-center">
            <span className="app-logo uppercase" style={{ fontSize: '1.35rem' }}>
              <span className="kiadp-text">Edu</span><span className="ai-highlight">AI</span>
            </span>
          </Link>
        </div>

        <div className="glass rounded-2xl p-6 sm:p-8 shadow-[var(--shadow-elevated)]">
          <div className="text-center mb-7">
            <h1 className="text-2xl font-bold tracking-tight">Start your free trial</h1>
            <p className="mt-2 text-sm text-ink-mute">
              Seven days of full access for your institution.
            </p>
            <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-select-line bg-select px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-accent">
              <Check className="w-3 h-3" />
              No card required
            </span>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {formError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-sm text-red-700 dark:text-red-400 animate-slide-in">
                <p className="font-bold">{formError}</p>
                {emailTaken && (
                  <p className="mt-1 font-normal text-ink-soft">
                    <Link to="/login" className="text-accent font-bold hover:underline">
                      Log in instead
                    </Link>{' '}
                    with that email.
                  </p>
                )}
              </div>
            )}

            {FIELDS.map(({ name, label, type, placeholder, autoComplete }) => (
              <div key={name} className="space-y-1.5">
                <label htmlFor={name} className="block text-[10px] font-black uppercase tracking-widest text-ink-mute">
                  {label}
                </label>
                <input
                  id={name}
                  name={name}
                  type={type}
                  autoComplete={autoComplete}
                  value={values[name]}
                  onChange={(e) => setField(name, e.target.value)}
                  placeholder={placeholder}
                  aria-invalid={Boolean(fieldErrors[name])}
                  className={inputClass(name)}
                />
                {fieldErrors[name] && (
                  <p className="text-xs text-red-700 dark:text-red-400">{fieldErrors[name]}</p>
                )}
              </div>
            ))}

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-[10px] font-black uppercase tracking-widest text-ink-mute">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={values.password}
                  onChange={(e) => setField('password', e.target.value)}
                  placeholder="At least 8 characters"
                  aria-invalid={Boolean(fieldErrors.password)}
                  className={`${inputClass('password')} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-ink-faint hover:text-ink hover:bg-overlay transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-xs text-red-700 dark:text-red-400">{fieldErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--color-palm-700)] hover:bg-[var(--color-palm-600)] text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-palm-500)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Creating your account
                </>
              ) : (
                <>
                  Start free trial <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-center text-[11px] text-ink-faint leading-relaxed">
              We do not ask for card details, and the trial does not renew into anything.
            </p>
          </form>

          <div className="mt-7 pt-5 border-t border-line-soft text-center">
            <p className="text-sm text-ink-mute">
              Already have an account?{' '}
              <Link to="/login" className="text-accent font-bold hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-mute hover:text-ink transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
