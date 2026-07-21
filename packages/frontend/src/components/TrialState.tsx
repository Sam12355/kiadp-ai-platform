import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { isTrialExpired } from '../lib/homeRoute';

/**
 * Where an expired institution should write to. Set this to your real address.
 *
 * Empty on purpose rather than carrying a plausible-looking default: an address nobody
 * reads is worse than no address, because the customer believes they have made contact.
 * While it is empty the screen tells them to reach their platform administrator instead
 * of offering a link that goes nowhere.
 */
const SUPPORT_EMAIL = '';

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

        {SUPPORT_EMAIL ? (
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Continuing after our trial')}`}
            className="block w-full py-3 rounded-xl bg-[var(--color-palm-700)] hover:bg-[var(--color-palm-800)] text-white text-sm font-bold transition-colors"
          >
            Get in touch to continue
          </a>
        ) : (
          <p className="w-full py-3 rounded-xl bg-overlay border border-line text-sm font-semibold text-ink-soft">
            Contact{' '}
            <a
              href="https://www.vybecreativemedia.lk"
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent underline underline-offset-2 hover:no-underline"
            >
              www.vybecreativemedia.lk
            </a>{' '}
            administrator to continue
          </p>
        )}

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
/** Largest two units that still carry information: 6d 4h, then 4h 12m, then 12m 30s. */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec}s`;
}

/**
 * Live countdown, shown for the whole trial rather than only its last days.
 *
 * The tick interval follows the granularity on screen: once a minute while days are
 * showing, once a second in the final hour. A per-second re-render for six days would be
 * half a million renders to animate a number that has not changed.
 *
 * `subject` is the institution being shown, so the strip is right during "view as" — the
 * platform owner previewing a school has no trial of their own.
 */
export function TrialBanner({ subject }: { subject?: { plan?: string | null; trialEndsAt?: string | null } | null }) {
  const user = useAuthStore((s) => s.user);
  const plan = subject ? subject.plan : user?.tenantPlan;
  const endsAt = subject ? subject.trialEndsAt : user?.tenantTrialEndsAt;
  const [now, setNow] = useState(() => Date.now());

  const remaining = endsAt ? new Date(endsAt).getTime() - now : 0;
  const active = plan === 'trial' && !!endsAt && remaining > 0;

  useEffect(() => {
    if (!active) return;
    const everySecond = remaining < 3600_000;
    const id = window.setInterval(() => setNow(Date.now()), everySecond ? 1000 : 60_000);
    return () => window.clearInterval(id);
    // Re-armed when crossing the one-hour mark, so the cadence tightens on its own.
  }, [active, remaining < 3600_000]);

  if (!active) return null;

  // Neutral for most of the trial; the colour only escalates when it is nearly out, so
  // urgency still means something when it arrives.
  const hours = remaining / 3600_000;
  const tone =
    hours <= 24
      ? 'bg-red-500/15 border-red-500/25 text-red-800 dark:text-red-300'
      : hours <= 72
        ? 'bg-amber-500/15 border-amber-500/25 text-amber-800 dark:text-amber-300'
        : 'bg-overlay border-line text-ink-soft';

  return (
    <div className={`flex items-center justify-center gap-2 px-4 py-1.5 border-b text-[11px] font-semibold ${tone}`}>
      <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
      </svg>
      <span>
        Free trial — <strong className="tabular-nums">{formatCountdown(remaining)}</strong> left
      </span>
      <Link to="/school/profile" className="underline underline-offset-2 hover:no-underline">
        Keep your account
      </Link>
    </div>
  );
}

/**
 * Locks the app the moment the trial lapses, without waiting for a reload or a request.
 *
 * Two independent triggers, because either alone leaves a hole:
 *  - A timer set for the exact expiry instant catches an idle tab whose clock simply runs
 *    out. Polling would mean showing a working product for up to a poll interval after it
 *    had stopped being paid for.
 *  - `trialLocked`, set by the 402 interceptor, catches an end date changed on the server
 *    since this page loaded — the browser's copy would otherwise still look valid.
 *
 * Returns whether the app should be locked right now.
 */
export function useTrialLock(subject?: { plan?: string | null; trialEndsAt?: string | null } | null): boolean {
  const user = useAuthStore((s) => s.user);
  const trialLocked = useAuthStore((s) => s.trialLocked);
  const setTrialLocked = useAuthStore((s) => s.setTrialLocked);

  // `subject` is the institution actually on screen. It differs from the signed-in user
  // only during "view as", where the platform owner has no trial of their own — without
  // it the preview would show a working panel for an institution whose staff are locked
  // out, which is precisely the thing the preview exists to reveal.
  const endsAt = subject ? subject.trialEndsAt ?? null : user?.tenantTrialEndsAt ?? null;
  const isTrial = (subject ? subject.plan : user?.tenantPlan) === 'trial';

  useEffect(() => {
    if (!isTrial || !endsAt) return;
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms <= 0) {
      setTrialLocked(true);
      return;
    }
    // setTimeout saturates above ~24.8 days; anything beyond that is re-armed on the next
    // mount long before it matters.
    const id = window.setTimeout(() => setTrialLocked(true), Math.min(ms, 2_000_000_000));
    return () => window.clearTimeout(id);
  }, [isTrial, endsAt, setTrialLocked]);

  if (subject) return trialLocked || (isTrial && !!endsAt && new Date(endsAt).getTime() <= Date.now());
  return trialLocked || isTrialExpired(user);
}
