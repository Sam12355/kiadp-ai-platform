import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { isTrialExpired, trialDaysLeft } from '../lib/homeRoute';

/**
 * Full-screen replacement shown to an institution whose trial has lapsed.
 *
 * Their data is untouched — the backend refuses new work but deletes nothing — and the
 * copy says so, because the fear at this moment is that a week of uploads has evaporated.
 */
export function TrialExpiredScreen() {
  const { user, logout } = useAuthStore();

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-surface">
      <div className="glass rounded-[2rem] p-10 max-w-lg text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto mb-6">
          <svg className="w-7 h-7 text-amber-700 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
          </svg>
        </div>

        <h1 className="text-2xl font-black text-ink mb-3">Your free trial has ended</h1>
        <p className="text-sm text-ink-soft leading-relaxed mb-2">
          The 7-day trial for <strong className="text-ink">{user?.tenantName ?? 'your institution'}</strong> is over.
        </p>
        <p className="text-sm text-ink-mute leading-relaxed mb-8">
          Nothing has been deleted. Your documents, students and history are all still here and
          will be exactly as you left them the moment your account is reactivated.
        </p>

        <a
          href="mailto:hello@kiadp.ai?subject=Continuing%20after%20our%20trial"
          className="block w-full py-3 rounded-xl bg-[var(--color-palm-700)] hover:bg-[var(--color-palm-800)] text-white text-sm font-bold transition-colors"
        >
          Get in touch to continue
        </a>

        <button
          onClick={logout}
          className="mt-4 text-[11px] font-bold uppercase tracking-widest text-ink-faint hover:text-ink transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * Countdown strip during an active trial.
 *
 * Silent until the last three days. A banner that shows from day one is furniture by day
 * two, and the point is for the deadline to land while there is still time to act on it.
 */
export function TrialBanner() {
  const user = useAuthStore((s) => s.user);
  const days = trialDaysLeft(user);
  if (days === null || days > 3 || isTrialExpired(user)) return null;

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-500/15 border-b border-amber-500/25 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
      {days === 0 ? 'Your free trial ends today.' : `${days} day${days === 1 ? '' : 's'} left in your free trial.`}
      <Link to="/school/profile" className="underline underline-offset-2 hover:no-underline">
        Keep your account
      </Link>
    </div>
  );
}
